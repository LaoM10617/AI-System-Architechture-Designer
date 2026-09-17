import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

load_dotenv("api.env")


@dataclass(frozen=True)
class Settings:
    provider: str
    model: str
    api_key: Optional[str]
    base_url: Optional[str]
    timeout_seconds: float
    cache_ttl_seconds: float
    max_notes: int
    max_context_chars: int
    cors_origins: list[str]

    @classmethod
    def from_env(cls, provider_override: Optional[str] = None) -> "Settings":
        provider = (provider_override or os.getenv("AI_PROVIDER", "openai")).lower()
        if provider not in {"openai", "gemini", "fake"}:
            raise ValueError("AI_PROVIDER must be one of: openai, gemini, fake")
        default_model = {"openai": "deepseek-chat", "gemini": "gemini-3.5-flash-lite", "fake": "fake-demo"}[provider]
        key_name = "GEMINI_API_KEY" if provider == "gemini" else "OPENAI_API_KEY"
        origins = [value.strip() for value in os.getenv("CORS_ORIGINS", "*").split(",") if value.strip()]
        return cls(
            provider=provider,
            model=os.getenv("AI_MODEL", default_model),
            api_key=os.getenv(key_name),
            base_url=os.getenv("AI_BASE_URL", "https://dseek.aikeji.vip/v1") if provider == "openai" else None,
            timeout_seconds=float(os.getenv("AI_TIMEOUT_SECONDS", "45")),
            cache_ttl_seconds=float(os.getenv("AI_CACHE_TTL_SECONDS", "300")),
            max_notes=int(os.getenv("AI_MAX_NOTES", "30")),
            max_context_chars=int(os.getenv("AI_MAX_CONTEXT_CHARS", "24000")),
            cors_origins=origins or ["*"],
        )

    @property
    def is_configured(self) -> bool:
        return self.provider == "fake" or bool(self.api_key)
