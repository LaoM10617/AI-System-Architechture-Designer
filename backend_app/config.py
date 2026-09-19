import os
from pathlib import Path
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
        if provider not in {"openai", "gemini", "groq", "fake"}:
            raise ValueError("Unknown AI provider")
        default_model = {"openai": "deepseek-chat", "gemini": "gemini-3.5-flash-lite", "groq": "openai/gpt-oss-120b", "fake": "fake-demo"}[provider]
        key_name = f"{provider.upper()}_API_KEY"
        api_key = os.getenv(key_name)
        key_file = os.getenv(f"{key_name}_FILE")
        if not api_key and key_file:
            try:
                api_key = Path(key_file).read_text(encoding="utf-8-sig").strip()
            except OSError:
                api_key = None
        model = os.getenv(f"{provider.upper()}_MODEL") or (os.getenv("AI_MODEL") if provider == os.getenv("AI_PROVIDER", "openai").lower() else None) or default_model
        origins = [value.strip() for value in os.getenv("CORS_ORIGINS", "*").split(",") if value.strip()]
        return cls(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1" if provider == "groq" else os.getenv("AI_BASE_URL", "https://dseek.aikeji.vip/v1") if provider == "openai" else None,
            timeout_seconds=float(os.getenv("AI_TIMEOUT_SECONDS", "45")),
            cache_ttl_seconds=float(os.getenv("AI_CACHE_TTL_SECONDS", "300")),
            max_notes=int(os.getenv("AI_MAX_NOTES", "30")),
            max_context_chars=int(os.getenv("AI_MAX_CONTEXT_CHARS", "24000")),
            cors_origins=origins or ["*"],
        )

    @property
    def is_configured(self) -> bool:
        return self.provider == "fake" or bool(self.api_key)
