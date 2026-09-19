"""Local SQLite persistence. Connections are short-lived and never shared between threads."""
import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


class StorageError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code = status, code


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def now():
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)

    @contextmanager
    def connection(self, write=False):
        db = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("PRAGMA synchronous=FULL")
            db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=5)
        try:
            db.execute("PRAGMA journal_mode=WAL")
        finally:
            db.close()
        with self.connection(write=True) as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > 1:
                raise RuntimeError("Database schema is newer than this application; refusing to modify it")
            if version == 1:
                return
            statements = [
                """CREATE TABLE projects (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
                """CREATE TABLE solution_versions (
                    project_id TEXT NOT NULL REFERENCES projects(id), id TEXT NOT NULL,
                    version INTEGER NOT NULL CHECK(version > 0), created_at TEXT NOT NULL,
                    architecture TEXT NOT NULL, diagram TEXT NOT NULL, basis TEXT,
                    source TEXT NOT NULL CHECK(source IN ('generated','edited','legacy','restored')),
                    restored_from TEXT, PRIMARY KEY(project_id,id), UNIQUE(project_id,version),
                    FOREIGN KEY(project_id,restored_from) REFERENCES solution_versions(project_id,id))""",
                """CREATE TABLE workspaces (
                    project_id TEXT PRIMARY KEY REFERENCES projects(id), snapshot TEXT NOT NULL,
                    schema_version INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
                    current_version_id TEXT, updated_at TEXT NOT NULL,
                    FOREIGN KEY(project_id,current_version_id) REFERENCES solution_versions(project_id,id))""",
                """CREATE TABLE write_requests (
                    project_id TEXT NOT NULL REFERENCES projects(id), request_id TEXT NOT NULL,
                    payload_hash TEXT NOT NULL, response TEXT NOT NULL,
                    PRIMARY KEY(project_id,request_id))""",
            ]
            for statement in statements:
                db.execute(statement)
            db.execute("PRAGMA user_version=1")

    @staticmethod
    def require_workspace(db, project_id):
        row = db.execute("SELECT * FROM workspaces WHERE project_id=?", (project_id,)).fetchone()
        if row is None:
            raise StorageError(404, "project_not_found", "Project not found")
        return row

    @staticmethod
    def version_result(row):
        value = dict(row)
        value["basis"] = json.loads(value["basis"]) if value["basis"] is not None else None
        return value

    def list_projects(self):
        with self.connection() as db:
            return [dict(row) for row in db.execute("SELECT * FROM projects ORDER BY updated_at DESC, id")]

    def workspace(self, project_id):
        with self.connection() as db:
            row = dict(self.require_workspace(db, project_id))
            row["project_record"] = dict(db.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone())
            row["snapshot"] = json.loads(row["snapshot"])
            version = db.execute("SELECT * FROM solution_versions WHERE project_id=? AND id=?", (project_id, row["current_version_id"])).fetchone()
            row["overall"] = self.version_result(version) if version else None
            row["result_history"] = [self.version_result(item) for item in db.execute(
                "SELECT * FROM solution_versions WHERE project_id=? AND id IS NOT ? ORDER BY version DESC LIMIT 10",
                (project_id, row["current_version_id"]))]
            return row

    def save_bundle(self, project_id, payload, importing=False):
        fingerprint = hashlib.sha256(encode({"operation": "import" if importing else "sync", "payload": payload}).encode()).hexdigest()
        with self.connection(write=True) as db:
            receipt = db.execute("SELECT * FROM write_requests WHERE project_id=? AND request_id=?", (project_id, payload["request_id"])).fetchone()
            if receipt:
                if receipt["payload_hash"] != fingerprint:
                    raise StorageError(409, "idempotency_conflict", "Request ID was already used for different content")
                return json.loads(receipt["response"])
            timestamp = now()
            if importing:
                if db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
                    raise StorageError(409, "project_exists", "Project already exists")
                db.execute("INSERT INTO projects VALUES(?,?,?,?)", (project_id, payload["name"], timestamp, timestamp))
                db.execute("INSERT INTO workspaces VALUES(?,?,?,0,NULL,?)", (project_id, encode(payload["snapshot"]), payload["schema_version"], timestamp))
                revision = 0
            else:
                workspace = self.require_workspace(db, project_id)
                if workspace["revision"] != payload["expected_revision"]:
                    raise StorageError(409, "revision_conflict", "Another page updated this workspace. Load the latest data or save your changes as a new project.")
                revision = workspace["revision"] + 1
            for item in payload["versions"]:
                values = (project_id, item["id"], item["version"], item["createdAt"], item["architecture"], item["diagram"], encode(item["basis"]) if item["basis"] is not None else None, item["source"], None)
                existing = db.execute("SELECT * FROM solution_versions WHERE project_id=? AND id=?", (project_id, item["id"])).fetchone()
                if existing:
                    # Existing rows are immutable. Restored provenance is owned by the server.
                    if tuple(existing)[:8] != values[:8]:
                        raise StorageError(409, "version_conflict", "Saved version content cannot be overwritten")
                else:
                    if db.execute("SELECT 1 FROM solution_versions WHERE project_id=? AND version=?", (project_id, item["version"])).fetchone():
                        raise StorageError(409, "version_conflict", "Version number already exists")
                    db.execute("INSERT INTO solution_versions VALUES(?,?,?,?,?,?,?,?,?)", values)
            current = payload["current_version_id"]
            if current and not db.execute("SELECT 1 FROM solution_versions WHERE project_id=? AND id=?", (project_id, current)).fetchone():
                raise StorageError(422, "missing_version", "Current result must refer to a saved version")
            db.execute("UPDATE workspaces SET snapshot=?,schema_version=?,revision=?,current_version_id=?,updated_at=? WHERE project_id=?", (encode(payload["snapshot"]), payload["schema_version"], revision, current, timestamp, project_id))
            db.execute("UPDATE projects SET updated_at=? WHERE id=?", (timestamp, project_id))
            response = {"project_id": project_id, "revision": revision, "updated_at": timestamp}
            db.execute("INSERT INTO write_requests VALUES(?,?,?,?)", (project_id, payload["request_id"], fingerprint, encode(response)))
            return response

    def versions(self, project_id, limit, before):
        with self.connection() as db:
            self.require_workspace(db, project_id)
            rows = db.execute("SELECT * FROM solution_versions WHERE project_id=? AND (? IS NULL OR version < ?) ORDER BY version DESC LIMIT ?", (project_id, before, before, limit)).fetchall()
            return [self.version_result(row) for row in rows]

    def version(self, project_id, version_id):
        with self.connection() as db:
            self.require_workspace(db, project_id)
            row = db.execute("SELECT * FROM solution_versions WHERE project_id=? AND id=?", (project_id, version_id)).fetchone()
            if not row:
                raise StorageError(404, "version_not_found", "Version not found")
            return self.version_result(row)

    def write(self, project_id, operation, payload, target=None):
        fingerprint = hashlib.sha256(encode({"operation": operation, "target": target, "payload": payload}).encode()).hexdigest()
        with self.connection(write=True) as db:
            receipt = db.execute("SELECT * FROM write_requests WHERE project_id=? AND request_id=?", (project_id, payload["request_id"])).fetchone()
            if receipt:
                if receipt["payload_hash"] != fingerprint:
                    raise StorageError(409, "idempotency_conflict", "Request ID was already used for different content")
                return json.loads(receipt["response"])
            timestamp = now()
            if operation == "create":
                if db.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
                    raise StorageError(409, "project_exists", "Project already exists")
                db.execute("INSERT INTO projects VALUES(?,?,?,?)", (project_id, payload["name"], timestamp, timestamp))
                db.execute("INSERT INTO workspaces VALUES(?,?,?,0,NULL,?)", (project_id, encode(payload["snapshot"]), payload["schema_version"], timestamp))
                response = {"project_id": project_id, "revision": 0, "updated_at": timestamp}
            else:
                workspace = self.require_workspace(db, project_id)
                if workspace["revision"] != payload["expected_revision"]:
                    raise StorageError(409, "revision_conflict", "Workspace changed; reload before saving")
                revision = workspace["revision"] + 1
                response = {"project_id": project_id, "revision": revision, "updated_at": timestamp}
                if operation == "workspace":
                    db.execute("UPDATE workspaces SET snapshot=?,schema_version=?,revision=?,updated_at=? WHERE project_id=?", (encode(payload["snapshot"]), payload["schema_version"], revision, timestamp, project_id))
                elif operation == "rename":
                    # One revision sequence per project, shared by metadata and content.
                    # Rename never rewrites the snapshot or touches result versions.
                    db.execute("UPDATE projects SET name=? WHERE id=?", (payload["name"], project_id))
                    db.execute("UPDATE workspaces SET revision=?,updated_at=? WHERE project_id=?", (revision, timestamp, project_id))
                else:
                    if operation == "restore":
                        row = db.execute("SELECT * FROM solution_versions WHERE project_id=? AND id=?", (project_id, target)).fetchone()
                        if not row:
                            raise StorageError(404, "version_not_found", "Version not found")
                        result = self.version_result(row)
                        result["source"] = "restored"
                    else:
                        result = payload
                    number = db.execute("SELECT COALESCE(MAX(version),0)+1 FROM solution_versions WHERE project_id=?", (project_id,)).fetchone()[0]
                    version_id = str(uuid4())
                    db.execute("INSERT INTO solution_versions VALUES(?,?,?,?,?,?,?,?,?)", (
                        project_id, version_id, number, timestamp, result["architecture"], result["diagram"],
                        encode(result["basis"]) if result["basis"] is not None else None,
                        result["source"], target if operation == "restore" else None))
                    db.execute("UPDATE workspaces SET current_version_id=?,revision=?,updated_at=? WHERE project_id=?", (version_id, revision, timestamp, project_id))
                    response["overall"] = self.version_result(db.execute("SELECT * FROM solution_versions WHERE project_id=? AND id=?", (project_id, version_id)).fetchone())
                db.execute("UPDATE projects SET updated_at=? WHERE id=?", (timestamp, project_id))
            db.execute("INSERT INTO write_requests VALUES(?,?,?,?)", (project_id, payload["request_id"], fingerprint, encode(response)))
            return response
