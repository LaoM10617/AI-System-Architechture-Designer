import json
from collections.abc import AsyncIterator
from typing import Protocol, TypeVar

from pydantic import BaseModel

from .config import Settings
from .schemas import DesignResponse

T = TypeVar("T", bound=BaseModel)


class AIProviderError(RuntimeError):
    pass


class AIProvider(Protocol):
    async def complete(self, system: str, prompt: str, *, temperature: float = 0.2) -> str: ...
    def stream(self, system: str, prompt: str, *, temperature: float = 0.2) -> AsyncIterator[str]: ...
    async def complete_structured(self, system: str, prompt: str, schema: type[T], *, temperature: float = 0.2) -> T: ...


class OpenAIProvider:
    def __init__(self, settings: Settings):
        if not settings.api_key:
            raise AIProviderError("OPENAI_API_KEY is not configured")
        from openai import AsyncOpenAI
        self.model = settings.model
        self.client = AsyncOpenAI(api_key=settings.api_key, base_url=settings.base_url, timeout=settings.timeout_seconds)

    async def complete(self, system: str, prompt: str, *, temperature: float = 0.2) -> str:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            temperature=temperature,
        )
        content = response.choices[0].message.content
        if not content:
            raise AIProviderError("AI provider returned an empty response")
        return content.strip()

    async def stream(self, system: str, prompt: str, *, temperature: float = 0.2) -> AsyncIterator[str]:
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            temperature=temperature,
            stream=True,
        )
        async for chunk in response:
            text = chunk.choices[0].delta.content if chunk.choices else None
            if text:
                yield text

    async def complete_structured(self, system: str, prompt: str, schema: type[T], *, temperature: float = 0.2) -> T:
        schema_prompt = prompt + "\nReturn only JSON matching this schema:\n" + json.dumps(schema.model_json_schema())
        text = await self.complete(system, schema_prompt, temperature=temperature)
        text = text.removeprefix("```json").removesuffix("```").strip()
        return schema.model_validate_json(text)


class GeminiProvider:
    def __init__(self, settings: Settings):
        if not settings.api_key:
            raise AIProviderError("GEMINI_API_KEY is not configured")
        try:
            from google import genai
        except ImportError as exc:
            raise AIProviderError("google-genai is not installed") from exc
        self.model = settings.model
        self.client = genai.Client(api_key=settings.api_key)

    async def complete(self, system: str, prompt: str, *, temperature: float = 0.2) -> str:
        from google.genai import types
        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system, temperature=temperature),
        )
        if not response.text:
            raise AIProviderError("AI provider returned an empty response")
        return response.text.strip()

    async def stream(self, system: str, prompt: str, *, temperature: float = 0.2) -> AsyncIterator[str]:
        from google.genai import types
        stream = await self.client.aio.models.generate_content_stream(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system, temperature=temperature),
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text

    async def complete_structured(self, system: str, prompt: str, schema: type[T], *, temperature: float = 0.2) -> T:
        from google.genai import types
        json_schema = schema.model_json_schema()
        json_schema.pop("additionalProperties", None)
        response = await self.client.aio.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
                response_mime_type="application/json",
                response_json_schema=json_schema,
            ),
        )
        if response.parsed:
            return schema.model_validate(response.parsed)
        if not response.text:
            raise AIProviderError("AI provider returned an empty structured response")
        return schema.model_validate_json(response.text)


class FakeProvider:
    async def complete(self, system: str, prompt: str, *, temperature: float = 0.2) -> str:
        lowered = prompt.lower()
        if "mermaid" in lowered:
            return 'graph TD\n    A["Client"] --> B["API"]\n    B --> C["Service"]\n    C --> D["Database"]'
        if "multiple-choice" in lowered:
            return "Which deployment model is preferred?\nA. Public cloud\nB. Private cloud\nC. Hybrid\nD. On-premises"
        if "sticky note" in lowered:
            return "Define the component responsibilities, data ownership, and failure behavior."
        return "Use a client, API layer, domain service, and persistent data store with clear boundaries and observability."

    async def stream(self, system: str, prompt: str, *, temperature: float = 0.2) -> AsyncIterator[str]:
        text = await self.complete(system, prompt, temperature=temperature)
        for word in text.split(" "):
            yield word + " "

    async def complete_structured(self, system: str, prompt: str, schema: type[T], *, temperature: float = 0.2) -> T:
        if schema is DesignResponse:
            return schema.model_validate({
                "architecture": "Use a client, API layer, domain service, and persistent data store with clear boundaries.",
                "diagram": 'graph TD\n    A["Client"] --> B["API"]\n    B --> C["Service"]\n    C --> D["Database"]',
            })
        raise AIProviderError(f"Fake provider has no fixture for {schema.__name__}")


def build_provider(settings: Settings) -> AIProvider:
    if settings.provider == "fake":
        return FakeProvider()
    if settings.provider == "gemini":
        return GeminiProvider(settings)
    return OpenAIProvider(settings)
