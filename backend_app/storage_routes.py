from uuid import UUID

from fastapi import APIRouter, Query

from .storage import Database
from .storage_models import CreateProject, RestoreVersion, SaveVersion, SaveWorkspace, ProjectRecord, VersionRecord, WorkspaceRecord, WriteReceipt
from .storage_models import ImportProject, SaveBundle


def storage_router(db: Database):
    router = APIRouter(prefix="/api/projects", tags=["Local persistence"])

    # Sync endpoints run in FastAPI's threadpool, not the async AI event loop.
    @router.get("", response_model=list[ProjectRecord])
    def projects():
        return db.list_projects()

    @router.post("", status_code=201, response_model=WriteReceipt, response_model_exclude_none=True)
    def create(req: CreateProject):
        return db.write(str(req.project_id), "create", req.model_dump(mode="json"))

    @router.post("/import", status_code=201, response_model=WriteReceipt, response_model_exclude_none=True)
    def import_project(req: ImportProject):
        return db.save_bundle(str(req.project_id), req.model_dump(mode="json"), importing=True)

    @router.put("/{project_id}/sync", response_model=WriteReceipt, response_model_exclude_none=True)
    def sync(project_id: UUID, req: SaveBundle):
        return db.save_bundle(str(project_id), req.model_dump(mode="json"))

    @router.get("/{project_id}/workspace", response_model=WorkspaceRecord)
    def workspace(project_id: UUID):
        return db.workspace(str(project_id))

    @router.put("/{project_id}/workspace", response_model=WriteReceipt, response_model_exclude_none=True)
    def save_workspace(project_id: UUID, req: SaveWorkspace):
        return db.write(str(project_id), "workspace", req.model_dump(mode="json"))

    @router.get("/{project_id}/versions", response_model=list[VersionRecord])
    def versions(project_id: UUID, limit: int = Query(20, ge=1, le=100), before: int | None = Query(None, ge=1)):
        return db.versions(str(project_id), limit, before)

    @router.get("/{project_id}/versions/{version_id}", response_model=VersionRecord)
    def version(project_id: UUID, version_id: UUID):
        return db.version(str(project_id), str(version_id))

    @router.post("/{project_id}/versions", status_code=201, response_model=WriteReceipt)
    def save_version(project_id: UUID, req: SaveVersion):
        return db.write(str(project_id), "version", req.model_dump(mode="json"))

    @router.post("/{project_id}/versions/{version_id}/restore", status_code=201, response_model=WriteReceipt)
    def restore(project_id: UUID, version_id: UUID, req: RestoreVersion):
        return db.write(str(project_id), "restore", req.model_dump(mode="json"), str(version_id))

    return router
