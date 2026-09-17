import uvicorn

from backend_app import create_app

app = create_app("gemini")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
