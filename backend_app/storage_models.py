from typing import Literal
from uuid import UUID

from pydantic import Field, JsonValue

from .schemas import StrictModel


class WorkspaceSnapshot(StrictModel):
    project: dict[str, JsonValue]
    notes: list[dict[str, JsonValue]] = Field(default_factory=list)
    diagrams: list[dict[str, JsonValue]] = Field(default_factory=list)
    favorites: list[dict[str, JsonValue]] = Field(default_factory=list)
    trash: list[dict[str, JsonValue]] = Field(default_factory=list)
    legacyArchive: list[dict[str, JsonValue]] = Field(default_factory=list)


class CreateProject(StrictModel):
    request_id: UUID
    project_id: UUID
    name: str = Field(min_length=1, max_length=200)
    snapshot: WorkspaceSnapshot
    schema_version: int = Field(default=3, ge=1)


class SaveWorkspace(StrictModel):
    request_id: UUID
    expected_revision: int = Field(ge=0)
    schema_version: int = Field(default=3, ge=1)
    snapshot: WorkspaceSnapshot


class SaveVersion(StrictModel):
    request_id: UUID
    expected_revision: int = Field(ge=0)
    architecture: str = Field(max_length=1_000_000)
    diagram: str = Field(max_length=1_000_000)
    basis: dict[str, JsonValue] | None = None
    source: Literal["generated", "edited", "legacy"] = "generated"


class RestoreVersion(StrictModel):
    request_id: UUID
    expected_revision: int = Field(ge=0)


class ProjectRecord(StrictModel):
    id: str
    name: str
    created_at: str
    updated_at: str


class VersionRecord(StrictModel):
    project_id: str
    id: str
    version: int
    created_at: str
    architecture: str
    diagram: str
    basis: dict[str, JsonValue] | None
    source: Literal["generated", "edited", "legacy", "restored"]
    restored_from: str | None


class WriteReceipt(StrictModel):
    project_id: str
    revision: int
    updated_at: str
    overall: VersionRecord | None = None


class WorkspaceRecord(StrictModel):
    project_id: str
    project_record: ProjectRecord
    snapshot: WorkspaceSnapshot
    schema_version: int
    revision: int
    current_version_id: str | None
    updated_at: str
    overall: VersionRecord | None
    result_history: list[VersionRecord] = Field(default_factory=list)


class ImportedVersion(StrictModel):
    id: str = Field(min_length=1, max_length=200)
    version: int = Field(ge=1)
    createdAt: str
    architecture: str
    diagram: str
    basis: dict[str, JsonValue] | None
    source: Literal["generated", "edited", "legacy", "restored"]


class SaveBundle(SaveWorkspace):
    versions: list[ImportedVersion] = Field(default_factory=list)
    current_version_id: str | None = None


class ImportProject(CreateProject):
    versions: list[ImportedVersion] = Field(default_factory=list)
    current_version_id: str | None = None
