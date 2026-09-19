import sqlite3
import tempfile
import unittest
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from backend_app.app import create_app
from backend_app.storage import Database, StorageError


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "workspace.sqlite3"
        self.client = TestClient(create_app("fake", database_path=self.path))
        self.client.__enter__()
        self.project_id = str(uuid4())
        self.base = f"/api/projects/{self.project_id}"
        self.create = {"request_id": str(uuid4()), "project_id": self.project_id,
                       "name": "Local project", "snapshot": {"project": {"prompt": "测试需求"}, "notes": [{"id": "n1", "content": "Keep me"}]}}
        self.assertEqual(self.client.post("/api/projects", json=self.create).status_code, 201)

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.temp.cleanup()

    def version_request(self, revision=0):
        return {"request_id": str(uuid4()), "expected_revision": revision,
                "architecture": "Architecture", "diagram": "graph TD; A-->B",
                "basis": {"project": {"prompt": "测试需求"}, "decisions": []}, "source": "generated"}

    def test_api_roundtrip_idempotency_restore_and_restart(self):
        created = self.client.post("/api/projects", json=self.create)
        self.assertEqual(created.json()["revision"], 0)
        self.assertEqual(len(self.client.get("/api/projects").json()), 1)
        request = self.version_request()
        first = self.client.post(self.base + "/versions", json=request)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(self.client.post(self.base + "/versions", json=request).json(), first.json())
        changed = {**request, "architecture": "Different"}
        self.assertEqual(self.client.post(self.base + "/versions", json=changed).json()["error"]["code"], "idempotency_conflict")
        self.assertEqual(self.client.post(self.base + "/versions", json=self.version_request()).status_code, 409)
        save = {"request_id": str(uuid4()), "expected_revision": 1, "schema_version": 3,
                "snapshot": {"project": {"prompt": "Updated"}, "notes": [{"content": "Still here"}]}}
        saved = self.client.put(self.base + "/workspace", json=save)
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(self.client.put(self.base + "/workspace", json=save).json(), saved.json())
        restore_path = self.base + "/versions/" + first.json()["overall"]["id"] + "/restore"
        restore = {"request_id": str(uuid4()), "expected_revision": 2}
        restored = self.client.post(restore_path, json=restore)
        self.assertEqual(restored.status_code, 201)
        self.assertEqual(self.client.post(restore_path, json=restore).json(), restored.json())
        self.assertEqual(restored.json()["overall"]["version"], 2)
        self.assertEqual(restored.json()["overall"]["source"], "restored")
        self.assertEqual(restored.json()["overall"]["restored_from"], first.json()["overall"]["id"])
        self.assertEqual(len(self.client.get(self.base + "/versions?limit=1").json()), 1)
        self.assertEqual(self.client.get(self.base + "/versions?before=2").json()[0]["version"], 1)
        self.assertEqual(self.client.get(self.base + "/versions/" + first.json()["overall"]["id"]).status_code, 200)
        self.assertEqual(self.client.get(f"/api/projects/{uuid4()}/versions/{first.json()['overall']['id']}").status_code, 404)
        # Reopen the application using the same file, not an in-memory database.
        with TestClient(create_app("fake", database_path=self.path)) as restarted:
            state = restarted.get(self.base + "/workspace").json()
            self.assertEqual(state["revision"], 3)
            self.assertEqual(state["snapshot"]["notes"], save["snapshot"]["notes"])
            self.assertEqual(state["overall"], restored.json()["overall"])
            self.assertEqual(restarted.get("/health").status_code, 200)

    def test_write_failure_rolls_back_version_pointer_and_receipt(self):
        request = self.version_request()
        with closing(sqlite3.connect(self.path, isolation_level=None)) as db:
            db.execute("CREATE TRIGGER fail_receipt BEFORE INSERT ON write_requests BEGIN SELECT RAISE(ABORT, 'test write failure'); END")
        self.assertEqual(self.client.post(self.base + "/versions", json=request).status_code, 503)
        self.assertEqual(self.client.get(self.base + "/versions").json(), [])
        workspace = self.client.get(self.base + "/workspace").json()
        self.assertEqual(workspace["revision"], 0)
        self.assertIsNone(workspace["overall"])
        with closing(sqlite3.connect(self.path, isolation_level=None)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM write_requests").fetchone()[0], 1)
            db.execute("DROP TRIGGER fail_receipt")
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(self.client.post(self.base + "/versions", json=request).json()["overall"]["version"], 1)

    def test_existing_project_identity_is_exposed_without_data_migration(self):
        self.assertEqual(self.client.post(self.base + "/versions", json=self.version_request()).status_code, 201)
        tables = ("projects", "workspaces", "solution_versions", "write_requests")
        with closing(sqlite3.connect(self.path)) as db:
            before = {table: db.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall() for table in tables}
        Database(self.path).initialize()
        workspace = self.client.get(self.base + "/workspace").json()
        self.assertEqual(workspace["project_id"], self.project_id)
        self.assertEqual(workspace["project_record"]["id"], self.project_id)
        self.assertEqual(workspace["project_record"]["name"], "Local project")
        self.assertEqual(workspace["revision"], 1)
        with closing(sqlite3.connect(self.path)) as db:
            after = {table: db.execute(f"SELECT * FROM {table} ORDER BY rowid").fetchall() for table in tables}
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 1)
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(before, after)

    def test_concurrent_retry_and_revision_conflict(self):
        db = Database(self.path)
        payload = self.version_request()
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: db.write(self.project_id, "version", payload), range(2)))
        self.assertEqual(results[0], results[1])
        def competing_write(_):
            try:
                return db.write(self.project_id, "version", self.version_request(1))["revision"]
            except StorageError as error:
                return error.code
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(competing_write, range(2)))
        self.assertCountEqual(outcomes, [2, "revision_conflict"])
        self.assertEqual(len(db.versions(self.project_id, 100, None)), 2)

    def test_two_projects_save_restore_and_request_isolation(self):
        other_id = str(uuid4())
        other = f"/api/projects/{other_id}"
        # The same request ID is valid in different projects.
        created = self.client.post("/api/projects", json={**self.create, "project_id": other_id, "name": "Project B"})
        self.assertEqual(created.status_code, 201)
        self.assertEqual({p["id"] for p in self.client.get("/api/projects").json()}, {self.project_id, other_id})
        shared_request = str(uuid4())
        originals = {}
        for base, label in ((self.base, "A"), (other, "B")):
            save = {"request_id": shared_request, "expected_revision": 0,
                    "snapshot": {"project": {"prompt": label}, "notes": [{"content": label}]}}
            response = self.client.put(base + "/workspace", json=save)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.client.put(base + "/workspace", json=save).json(), response.json())
            result = self.client.post(base + "/versions", json={**self.version_request(1), "architecture": label})
            self.assertEqual(result.status_code, 201)
            originals[base] = result.json()["overall"]["id"]
        b_before = self.client.get(other + "/workspace").json()
        restored = self.client.post(self.base + f"/versions/{originals[self.base]}/restore", json={
            "request_id": str(uuid4()), "expected_revision": 2})
        self.assertEqual(restored.status_code, 201)
        self.assertEqual(restored.json()["overall"]["architecture"], "A")
        self.assertEqual(self.client.get(other + "/workspace").json(), b_before)
        # A has revision 3, B still accepts its own revision 2.
        response = self.client.post(other + f"/versions/{originals[other]}/restore", json={
            "request_id": str(uuid4()), "expected_revision": 2})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["overall"]["architecture"], "B")
        self.assertEqual(self.client.get(other + f"/versions/{originals[self.base]}").status_code, 404)
        before = self.client.get(other + "/workspace").json()
        response = self.client.post(other + f"/versions/{originals[self.base]}/restore", json={
            "request_id": str(uuid4()), "expected_revision": 3})
        self.assertEqual(response.json()["error"]["code"], "version_not_found")
        foreign_pointer = {"request_id": str(uuid4()), "expected_revision": 3,
                           "snapshot": before["snapshot"], "current_version_id": originals[self.base]}
        self.assertEqual(self.client.put(other + "/sync", json=foreign_pointer).status_code, 422)
        self.assertEqual(self.client.get(other + "/workspace").json(), before)
        for base, label in ((self.base, "A"), (other, "B")):
            state = self.client.get(base + "/workspace").json()
            self.assertEqual(state["snapshot"]["notes"], [{"content": label}])
            self.assertEqual(len(self.client.get(base + "/versions").json()), 2)

    def test_rename_is_transactional_revision_checked_and_idempotent(self):
        before = self.client.get(self.base + "/workspace").json()
        rename = {"request_id": str(uuid4()), "expected_revision": 0, "name": "  Renamed project  "}
        with closing(sqlite3.connect(self.path, isolation_level=None)) as db:
            db.execute("CREATE TRIGGER fail_rename BEFORE INSERT ON write_requests BEGIN SELECT RAISE(ABORT, 'test'); END")
        self.assertEqual(self.client.patch(self.base, json=rename).status_code, 503)
        self.assertEqual(self.client.get(self.base + "/workspace").json(), before)
        with closing(sqlite3.connect(self.path, isolation_level=None)) as db:
            db.execute("DROP TRIGGER fail_rename")
        response = self.client.patch(self.base, json=rename)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["revision"], 1)
        self.assertEqual(self.client.patch(self.base, json=rename).json(), response.json())
        self.assertEqual(self.client.patch(self.base, json={**rename, "name": "Different"}).json()["error"]["code"], "idempotency_conflict")
        self.assertEqual(self.client.patch(self.base, json={**rename, "request_id": str(uuid4())}).json()["error"]["code"], "revision_conflict")
        self.assertEqual(self.client.patch(self.base, json={**rename, "name": " \t "}).status_code, 422)
        self.assertEqual(self.client.post("/api/projects", json={**self.create, "name": " "}).status_code, 422)
        after = self.client.get(self.base + "/workspace").json()
        self.assertEqual(after["project_record"]["name"], "Renamed project")
        self.assertEqual(self.client.get("/api/projects").json()[0]["name"], "Renamed project")
        for key in ("snapshot", "overall", "result_history", "current_version_id"):
            self.assertEqual(after[key], before[key])

    def test_missing_project_never_falls_back(self):
        missing = f"/api/projects/{uuid4()}"
        before = self.client.get(self.base + "/workspace").json()
        version_id = str(uuid4())
        snapshot = {"request_id": str(uuid4()), "expected_revision": 0, "snapshot": self.create["snapshot"]}
        responses = [
            self.client.get(missing + "/workspace"),
            self.client.get(missing + "/versions"),
            self.client.get(missing + f"/versions/{version_id}"),
            self.client.put(missing + "/workspace", json=snapshot),
            self.client.put(missing + "/sync", json=snapshot),
            self.client.patch(missing, json={"request_id": str(uuid4()), "expected_revision": 0, "name": "Missing"}),
            self.client.post(missing + "/versions", json=self.version_request()),
            self.client.post(missing + f"/versions/{version_id}/restore", json={"request_id": str(uuid4()), "expected_revision": 0}),
        ]
        for response in responses:
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["error"]["code"], "project_not_found")
        self.assertEqual(self.client.get(self.base + "/workspace").json(), before)

    def test_transactional_import_and_bundle_retry(self):
        project_id = str(uuid4())
        version = {"id": "legacy-original-id", "version": 1, "createdAt": "2026-09-19T00:00:00Z",
                   "architecture": "Original", "diagram": "graph TD; A-->B", "basis": None, "source": "legacy"}
        payload = {**self.create, "project_id": project_id, "request_id": str(uuid4()),
                   "versions": [version], "current_version_id": "missing"}
        response = self.client.post("/api/projects/import", json=payload)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get(f"/api/projects/{project_id}/workspace").status_code, 404)
        payload["current_version_id"] = version["id"]
        response = self.client.post("/api/projects/import", json=payload)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.post("/api/projects/import", json=payload).json(), response.json())
        state = self.client.get(f"/api/projects/{project_id}/workspace").json()
        self.assertEqual(state["overall"]["id"], version["id"])
        self.assertEqual(state["snapshot"]["notes"], self.create["snapshot"]["notes"])
        sync = {"request_id": str(uuid4()), "expected_revision": 0, "schema_version": 3,
                "snapshot": self.create["snapshot"], "versions": [version], "current_version_id": version["id"]}
        response = self.client.put(f"/api/projects/{project_id}/sync", json=sync)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.put(f"/api/projects/{project_id}/sync", json=sync).json(), response.json())
        self.assertEqual(len(self.client.get(f"/api/projects/{project_id}/versions").json()), 1)


if __name__ == "__main__":
    unittest.main()
