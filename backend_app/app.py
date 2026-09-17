import logging
import time
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .config import Settings
from .providers import AIProviderError, build_provider
from .schemas import ArchitectureResponse, DesignResponse, DiagramRequest, DiagramResponse, HealthResponse, MCQRequest, MCQResponse, NoteSuggestionRequest, NoteSuggestionResponse, ProjectRequest
from .service import AIService

logger = logging.getLogger("architecture_api")


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})


def create_app(provider_override: Optional[str] = None) -> FastAPI:
    settings = Settings.from_env(provider_override)
    app = FastAPI(title="AI System Architecture Designer API", version="1.1.0")
    app.state.settings = settings
    app.state.ai_service = None

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        expose_headers=["Server-Timing", "X-Process-Time-Ms"],
    )

    @app.middleware("http")
    async def timing_middleware(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - started) * 1000
        response.headers["Server-Timing"] = f'app;dur={elapsed_ms:.1f}'
        response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.1f}"
        logger.info("%s %s %.1fms", request.method, request.url.path, elapsed_ms)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {"msg": "Invalid request"}
        location = ".".join(str(item) for item in first.get("loc", [])[1:])
        message = f"{location}: {first['msg']}" if location else first["msg"]
        return error_response(422, "validation_error", message)

    @app.exception_handler(AIProviderError)
    async def provider_error(_: Request, exc: AIProviderError) -> JSONResponse:
        return error_response(503, "ai_provider_error", str(exc))

    def service() -> AIService:
        if app.state.ai_service is None:
            app.state.ai_service = AIService(build_provider(settings), settings)
        return app.state.ai_service

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok" if settings.is_configured else "degraded", provider=settings.provider, model=settings.model, configured=settings.is_configured)

    @app.post("/api/architecture", response_model=ArchitectureResponse)
    async def architecture(req: ProjectRequest) -> ArchitectureResponse:
        return ArchitectureResponse(architecture=await service().architecture(req))

    @app.post("/api/architecture/stream")
    async def architecture_stream(req: ProjectRequest) -> StreamingResponse:
        return StreamingResponse(service().architecture_stream(req), media_type="text/plain; charset=utf-8")

    @app.post("/api/design", response_model=DesignResponse)
    async def design(req: ProjectRequest) -> DesignResponse:
        return await service().design(req)

    @app.post("/api/diagram", response_model=DiagramResponse)
    async def diagram(req: DiagramRequest) -> DiagramResponse:
        diagram_code, architecture_text = await service().diagram(req)
        return DiagramResponse(diagram=diagram_code, architecture=architecture_text)

    @app.post("/api/mcq", response_model=MCQResponse)
    async def mcq(req: MCQRequest) -> MCQResponse:
        return MCQResponse(mcq=await service().mcq(req))

    @app.post("/api/notes/suggestion", response_model=NoteSuggestionResponse)
    async def note_suggestion(req: NoteSuggestionRequest) -> NoteSuggestionResponse:
        return NoteSuggestionResponse(suggestion=await service().note_suggestion(req))

    # Temporary aliases keep the old static frontend working during migration.
    @app.post("/api/generate")
    async def legacy_architecture(req: ProjectRequest) -> dict[str, str]:
        return {"result": await service().architecture(req)}

    @app.post("/generate_diagram", response_model=DiagramResponse)
    async def legacy_diagram(req: DiagramRequest) -> DiagramResponse:
        diagram_code, architecture_text = await service().diagram(req)
        return DiagramResponse(diagram=diagram_code, architecture=architecture_text)

    @app.post("/api/generate_mcq", response_model=MCQResponse)
    async def legacy_mcq(req: MCQRequest) -> MCQResponse:
        return MCQResponse(mcq=await service().mcq(req))

    @app.post("/api/note_hint", response_model=NoteSuggestionResponse)
    async def legacy_note_suggestion(req: NoteSuggestionRequest) -> NoteSuggestionResponse:
        return NoteSuggestionResponse(suggestion=await service().note_suggestion(req))

    return app
