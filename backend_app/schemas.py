from typing import List, Optional

from pydantic import BaseModel, Field


class StrictModel(BaseModel):
    model_config = {"extra": "forbid"}


class ProjectRequest(StrictModel):
    prompt: str = Field(min_length=1, max_length=20_000)
    appType: str = Field(min_length=1, max_length=100)
    features: List[str] = Field(default_factory=list, max_length=50)
    userCount: str = Field(min_length=1, max_length=100)
    notes: List[str] = Field(default_factory=list, max_length=100)


class DiagramRequest(ProjectRequest):
    architecture: Optional[str] = Field(default=None, max_length=50_000)


class MCQRequest(ProjectRequest):
    category: str = Field(min_length=1, max_length=100)


class NoteSuggestionRequest(StrictModel):
    existingNotes: str = Field(default="", max_length=50_000)
    title: str = Field(default="New Note", min_length=1, max_length=200)
    content: str = Field(default="", max_length=20_000)


class ArchitectureResponse(StrictModel):
    architecture: str


class DiagramResponse(StrictModel):
    diagram: str
    architecture: str


class DesignResponse(StrictModel):
    architecture: str = Field(description="Concise software architecture proposal in English")
    diagram: str = Field(description="Valid Mermaid graph TD code without Markdown fences")


class MCQResponse(StrictModel):
    mcq: str


class NoteSuggestionResponse(StrictModel):
    suggestion: str


class HealthResponse(StrictModel):
    status: str
    provider: str
    model: str
    configured: bool


class ErrorDetail(StrictModel):
    code: str
    message: str


class ErrorResponse(StrictModel):
    error: ErrorDetail
