import logging
import time
import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from .config import Settings
from .providers import AIProviderError, build_provider
from .schemas import ArchitectureResponse, DesignResponse, DiagramRequest, DiagramResponse, HealthResponse, MCQRequest, MCQResponse, NoteSuggestionRequest, NoteSuggestionResponse, ProjectRequest
from .service import AIService
from .storage import Database, StorageError
from .storage_routes import storage_router

logger = logging.getLogger("architecture_api")


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})


def create_app(provider_override: Optional[str] = None, database_path: Optional[Path] = None) -> FastAPI:
    settings = Settings.from_env(provider_override)
    root = Path(__file__).resolve().parent.parent
    path = Path(database_path or os.getenv("DATABASE_PATH", "data/workspace.sqlite3"))
    database = Database(path if path.is_absolute() else root / path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await run_in_threadpool(database.initialize)
        yield

    app = FastAPI(title="AI System Architecture Designer API", version="1.2.0", lifespan=lifespan)
    app.state.database = database
    app.include_router(storage_router(database))
    app.state.settings = settings
    app.state.ai_service = None
    profiles = {name: Settings.from_env(name) for name in {"gemini", "groq", settings.provider}}
    profiles[settings.provider] = settings
    services: dict[str, AIService] = {}

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type", "X-AI-Provider"],
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

    @app.exception_handler(StorageError)
    async def storage_error(_: Request, exc: StorageError) -> JSONResponse:
        return error_response(exc.status, exc.code, str(exc))

    @app.exception_handler(sqlite3.Error)
    async def database_error(_: Request, exc: sqlite3.Error) -> JSONResponse:
        logger.error("SQLite operation failed (%s)", type(exc).__name__)
        return error_response(503, "database_unavailable", "Local database could not save or load data. Retry the request; your unsaved changes should be retained.")

    async def service(request: Request) -> AIService:
        name = request.headers.get("X-AI-Provider") or settings.provider
        if name not in profiles:
            raise AIProviderError("Unknown AI provider selection")
        if name not in services:
            config = profiles[name]
            services[name] = AIService(build_provider(config), config)
        return services[name]

    @app.get("/api/providers")
    async def providers():
        return {"default": settings.provider, "providers": [
            {"id": name, "model": config.model, "configured": config.is_configured}
            for name, config in sorted(profiles.items())
        ]}

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok" if settings.is_configured else "degraded", provider=settings.provider, model=settings.model, configured=settings.is_configured)

    @app.post("/api/architecture", response_model=ArchitectureResponse)
    async def architecture(req: ProjectRequest, ai: AIService = Depends(service)) -> ArchitectureResponse:
        return ArchitectureResponse(architecture=await ai.architecture(req))

    @app.post("/api/architecture/stream")
    async def architecture_stream(req: ProjectRequest, ai: AIService = Depends(service)) -> StreamingResponse:
        stream = ai.architecture_stream(req)
        first = await anext(stream, "")
        async def chunks():
            try:
                yield first
                async for chunk in stream:
                    yield chunk
            finally:
                await stream.aclose()
        return StreamingResponse(chunks(), media_type="text/plain; charset=utf-8")

    @app.post("/api/design", response_model=DesignResponse)
    async def design(req: ProjectRequest, ai: AIService = Depends(service)) -> DesignResponse:
        return await ai.design(req)

    @app.post("/api/diagram", response_model=DiagramResponse)
    async def diagram(req: DiagramRequest, ai: AIService = Depends(service)) -> DiagramResponse:
        diagram_code, architecture_text = await ai.diagram(req)
        return DiagramResponse(diagram=diagram_code, architecture=architecture_text)

    @app.post("/api/mcq", response_model=MCQResponse)
    async def mcq(req: MCQRequest, ai: AIService = Depends(service)) -> MCQResponse:
        return MCQResponse(mcq=await ai.mcq(req))

    @app.post("/api/notes/suggestion", response_model=NoteSuggestionResponse)
    async def note_suggestion(req: NoteSuggestionRequest, ai: AIService = Depends(service)) -> NoteSuggestionResponse:
        return NoteSuggestionResponse(suggestion=await ai.note_suggestion(req))

    # Temporary aliases keep the old static frontend working during migration.
    @app.post("/api/generate")
    async def legacy_architecture(req: ProjectRequest, ai: AIService = Depends(service)) -> dict[str, str]:
        return {"result": await ai.architecture(req)}

    @app.post("/generate_diagram", response_model=DiagramResponse)
    async def legacy_diagram(req: DiagramRequest, ai: AIService = Depends(service)) -> DiagramResponse:
        diagram_code, architecture_text = await ai.diagram(req)
        return DiagramResponse(diagram=diagram_code, architecture=architecture_text)

    @app.post("/api/generate_mcq", response_model=MCQResponse)
    async def legacy_mcq(req: MCQRequest, ai: AIService = Depends(service)) -> MCQResponse:
        return MCQResponse(mcq=await ai.mcq(req))

    @app.post("/api/note_hint", response_model=NoteSuggestionResponse)
    async def legacy_note_suggestion(req: NoteSuggestionRequest, ai: AIService = Depends(service)) -> NoteSuggestionResponse:
        return NoteSuggestionResponse(suggestion=await ai.note_suggestion(req))

    return app
