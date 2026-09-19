import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend_app.app import create_app
from backend_app.providers import FakeProvider


class ProviderSelectionTests(unittest.TestCase):
    def test_request_selection_and_cache_isolation(self):
        calls = []
        class TaggedProvider(FakeProvider):
            def __init__(self, name):
                self.name = name
            async def complete(self, *args, **kwargs):
                calls.append(self.name)
                return f"Architecture from {self.name}"
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"GROQ_API_KEY": "test-only-groq", "GEMINI_API_KEY": "test-only-gemini"}), patch("backend_app.app.build_provider", side_effect=lambda settings: TaggedProvider(settings.provider)):
            with TestClient(create_app("fake", Path(directory) / "test.sqlite3")) as client:
                metadata = client.get("/api/providers")
                self.assertEqual(metadata.status_code, 200)
                self.assertNotIn("test-only", metadata.text)
                self.assertNotIn("api_key", metadata.text)
                payload = {"prompt": "Notes app", "appType": "Web", "userCount": "100", "features": [], "notes": []}
                for name in ["fake", "groq", "gemini", "groq"]:
                    response = client.post("/api/architecture", json=payload, headers={"X-AI-Provider": name})
                    self.assertEqual(response.json()["architecture"], f"Architecture from {name}")
                self.assertEqual(calls, ["fake", "groq", "gemini"])
                self.assertEqual(client.post("/api/architecture", json=payload).json()["architecture"], "Architecture from fake")
                streamed = client.post("/api/architecture/stream", json=payload, headers={"X-AI-Provider": "groq"})
                self.assertEqual(streamed.text, "Architecture from groq")
                self.assertEqual(client.post("/api/architecture", json=payload, headers={"X-AI-Provider": "unknown"}).status_code, 503)


if __name__ == "__main__":
    unittest.main()
