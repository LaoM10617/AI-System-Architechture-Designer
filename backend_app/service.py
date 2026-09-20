import asyncio
import hashlib
import json
import time
from collections.abc import AsyncIterator
from typing import Any, Awaitable, Callable, TypeVar

from .config import Settings
from .providers import AIProvider, AIProviderError
from .schemas import DesignResponse, DiagramRequest, MCQRequest, NoteSuggestionRequest, ProjectRequest

ARCHITECT_SYSTEM = "You are an expert software architect. Answer in English."
MERMAID_LABELS = 'Use exactly one pair of double quotes around node labels, e.g. A["API (HTTP)"]; never A[""API (HTTP)""].'
T = TypeVar("T")


class AIService:
    def __init__(self, provider: AIProvider, settings: Settings):
        self.provider = provider
        self.settings = settings
        self._cache: dict[str, tuple[float, Any]] = {}

    async def _complete(self, system: str, prompt: str, *, temperature: float = 0.2) -> str:
        try:
            return await asyncio.wait_for(self.provider.complete(system, prompt, temperature=temperature), timeout=self.settings.timeout_seconds)
        except asyncio.TimeoutError as exc:
            raise AIProviderError(f"AI provider timed out after {self.settings.timeout_seconds:g} seconds") from exc
        except AIProviderError:
            raise
        except Exception as exc:
            raise AIProviderError("AI provider request failed") from exc

    async def _cached(self, operation: str, payload: dict[str, Any], factory: Callable[[], Awaitable[T]]) -> T:
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        key = operation + ":" + hashlib.sha256(raw.encode("utf-8")).hexdigest()
        cached = self._cache.get(key)
        now = time.monotonic()
        if cached and cached[0] > now:
            return cached[1]
        result = await factory()
        self._cache[key] = (now + self.settings.cache_ttl_seconds, result)
        if len(self._cache) > 256:
            self._cache = {item_key: value for item_key, value in self._cache.items() if value[0] > now}
        return result

    def project_context(self, req: ProjectRequest) -> str:
        notes = req.notes[: self.settings.max_notes]
        notes_text = "\n".join(notes)
        remaining = max(0, self.settings.max_context_chars - len(req.prompt))
        notes_text = notes_text[:remaining] or "None"
        features = ", ".join(req.features) or "None"
        return (
            f"Application type: {req.appType}\nCore features: {features}\n"
            f"Expected user count: {req.userCount}\nUser notes:\n{notes_text}\n"
            f"Project description: {req.prompt}"
        )

    async def architecture(self, req: ProjectRequest) -> str:
        async def generate() -> str:
            return await self._complete(ARCHITECT_SYSTEM, "Create a concise software architecture proposal for:\n\n" + self.project_context(req))
        return await self._cached("architecture", req.model_dump(), generate)

    async def architecture_stream(self, req: ProjectRequest) -> AsyncIterator[str]:
        payload = req.model_dump()
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        key = "architecture:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()
        cached = self._cache.get(key)
        if cached and cached[0] > time.monotonic():
            yield cached[1]
            return
        chunks: list[str] = []
        try:
            async with asyncio.timeout(self.settings.timeout_seconds):
                async for chunk in self.provider.stream(
                    ARCHITECT_SYSTEM,
                    "Create a concise software architecture proposal for:\n\n" + self.project_context(req),
                ):
                    chunks.append(chunk)
                    yield chunk
        except TimeoutError as exc:
            raise AIProviderError(f"AI provider timed out after {self.settings.timeout_seconds:g} seconds") from exc
        except AIProviderError:
            raise
        except Exception as exc:
            raise AIProviderError("AI provider request failed. Retry or select the backup provider.") from exc
        result = "".join(chunks).strip()
        if result:
            self._cache[key] = (time.monotonic() + self.settings.cache_ttl_seconds, result)

    async def design(self, req: ProjectRequest) -> DesignResponse:
        async def generate() -> DesignResponse:
            try:
                return await asyncio.wait_for(
                    self.provider.complete_structured(
                        "You are an expert software architect and Mermaid diagram author. Answer in English.",
                        "Create a concise architecture proposal and a valid Mermaid graph TD diagram. " + MERMAID_LABELS + "\n\n" + self.project_context(req),
                        DesignResponse,
                        temperature=0.1,
                    ),
                    timeout=self.settings.timeout_seconds,
                )
            except asyncio.TimeoutError as exc:
                raise AIProviderError(f"AI provider timed out after {self.settings.timeout_seconds:g} seconds") from exc
            except AIProviderError:
                raise
            except Exception as exc:
                raise AIProviderError("AI provider returned invalid structured output") from exc
        result = await self._cached("design", req.model_dump(), generate)
        return DesignResponse(architecture=result.architecture, diagram=self.clean_mermaid(result.diagram))

    async def diagram(self, req: DiagramRequest) -> tuple[str, str]:
        if not req.architecture:
            result = await self.design(ProjectRequest(**req.model_dump(exclude={"architecture"})))
            return result.diagram, result.architecture

        async def generate() -> str:
            return await self._complete(
                "You convert architecture descriptions into valid Mermaid diagrams.",
                "Return only Mermaid graph TD code without Markdown fences. " + MERMAID_LABELS + "\n\nArchitecture:\n" + req.architecture,
                temperature=0.1,
            )
        diagram = await self._cached("diagram", req.model_dump(), generate)
        return self.clean_mermaid(diagram), req.architecture

    async def mcq(self, req: MCQRequest) -> str:
        async def generate() -> str:
            return await self._complete(
                "You are an experienced software consultant who asks high-value clarification questions.",
                self.project_context(req) + f"\nQuestion category: {req.category}\nIdentify one unclear aspect. Ask one short multiple-choice question in English with options A, B, C, and D only, without extra commentary.",
            )
        return await self._cached("mcq", req.model_dump(), generate)

    async def note_suggestion(self, req: NoteSuggestionRequest) -> str:
        content = f"The note already contains:\n{req.content}\nContinue or complete it." if req.content else "Suggest content for this note."
        async def generate() -> str:
            return await self._complete(
                "You are an expert software architect assistant.",
                f"You are helping with architecture using sticky notes.\nExisting notes:\n{req.existingNotes[:self.settings.max_context_chars] or 'None'}\n\nNew note title: {req.title}\n{content}",
            )
        return await self._cached("note", req.model_dump(), generate)

    @staticmethod
    def clean_mermaid(value: str) -> str:
        text = value.strip()
        if text.startswith("```mermaid"):
            text = text[len("```mermaid"):]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"): text = text[:-3]
        return text.strip()
