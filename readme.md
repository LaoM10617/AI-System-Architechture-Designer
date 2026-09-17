# AI System Architecture Designer

AI System Architecture Designer is an AI-assisted workspace for product ideation and system design demonstrations. It allows users to organize requirements on a visual whiteboard, generate system architecture proposals, create Mermaid diagrams, clarify requirements with multiple-choice questions, and request AI-powered note suggestions. Generated results can be edited, favorited, restored, or exported as part of the design workflow.

The frontend is built with React and TypeScript, while FastAPI provides a unified backend API. Gemini is the default AI provider. The project also supports OpenAI-compatible endpoints and a local fake provider that does not require an API key.

## Core Features

- Generate system architecture proposals from the application type, expected scale, core features, and project description
- Add, edit, move, and resize notes on a visual whiteboard
- Generate additional requirement notes and AI-powered note suggestions
- Generate Mermaid architecture diagrams from the current architecture proposal
- View, edit, and render Mermaid source code
- Zoom diagrams, open them in fullscreen, and download them as SVG files
- Generate multiple-choice questions to clarify project requirements
- Save architecture and diagram results as favorites
- Delete, restore, or permanently remove notes
- Stream architecture responses and cancel or retry AI requests

## Technology Stack

### Frontend

- React 19
- TypeScript
- Vite
- Zustand
- Mermaid
- Playwright

### Backend

- Python 3.12+
- FastAPI
- Pydantic
- Google Gen AI SDK
- OpenAI Python SDK

## Project Structure

```text
.
├── backend_app/          # FastAPI routes, schemas, AI providers, and services
├── frontend/             # React and TypeScript frontend
│   ├── src/              # Pages, components, state management, and API client
│   └── e2e/              # Playwright demo-flow test
├── backend.py            # FastAPI application entry point
├── run.py                # Unified frontend and backend launcher
├── requirements.txt      # Python dependencies
└── api.env.example       # Environment configuration example
```

## Requirements

- Python 3.12 or later
- Node.js 20 or later
- pnpm
- A Gemini API key when using the real Gemini service

Install pnpm if it is not already available:

```powershell
npm install -g pnpm
```

## Installation and Startup

Run the following commands from the project root directory.

### 1. Create a Python virtual environment

```powershell
python -m venv .venv
```

### 2. Install the backend dependencies

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 3. Install the frontend dependencies

```powershell
pnpm --dir frontend install
```

### 4. Configure the AI service

Copy the environment configuration example:

```powershell
Copy-Item api.env.example api.env
```

Open `api.env` and add your Gemini API key:

```dotenv
AI_PROVIDER=gemini
AI_MODEL=gemini-3.5-flash-lite
GEMINI_API_KEY=your_gemini_api_key
```

The `api.env` file is excluded from Git and should never be committed with a real API key.

### 5. Start the application

```powershell
.\.venv\Scripts\python.exe run.py
```

This command starts both the React development server and the FastAPI backend:

- Frontend: http://127.0.0.1:5173
- Backend: http://127.0.0.1:8000
- API documentation: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

Press `Ctrl+C` in the terminal to stop both services.

## Running Without an API Key

To explore the interface and demo workflow without calling an external AI service, configure the fake provider in `api.env`:

```dotenv
AI_PROVIDER=fake
AI_MODEL=fake-model
```

The fake provider returns predefined demonstration data and does not consume external API quota.

## Recommended Demo Flow

1. Select the application type, expected user scale, and core features in the control panel.
2. Edit the project description and add or update requirement notes on the whiteboard.
3. Generate an architecture proposal and watch the result stream into a new note.
4. Generate a Mermaid diagram from the architecture proposal.
5. Switch between rendered and source modes to edit, zoom, view, or download the diagram.
6. Generate a multiple-choice question to clarify an unresolved requirement.
7. Favorite useful results or use the trash to delete and restore notes.

## Configuration

Runtime configuration is loaded from the `api.env` file in the project root.

| Variable | Description | Default |
| --- | --- | --- |
| `AI_PROVIDER` | AI provider: `gemini`, `openai`, or `fake` | `gemini` |
| `AI_MODEL` | Model name used by the selected provider | `gemini-3.5-flash-lite` |
| `GEMINI_API_KEY` | Gemini API key | Empty |
| `OPENAI_API_KEY` | API key for OpenAI or an OpenAI-compatible service | Empty |
| `AI_BASE_URL` | Base URL for an OpenAI-compatible service | Empty |
| `AI_TIMEOUT_SECONDS` | Timeout for upstream AI requests | `45` |
| `AI_CACHE_TTL_SECONDS` | In-memory cache duration for identical requests | `300` |
| `AI_MAX_NOTES` | Maximum number of notes sent in one AI request | `30` |
| `AI_MAX_CONTEXT_CHARS` | Maximum context length sent in one AI request | `24000` |
| `CORS_ORIGINS` | Comma-separated frontend origins allowed to access the API | `http://127.0.0.1:5173` |

## API Overview

- `GET /health` — Check the service, provider, and model configuration
- `POST /api/architecture` — Generate a complete architecture proposal
- `POST /api/architecture/stream` — Stream an architecture proposal
- `POST /api/design` — Generate an architecture proposal and Mermaid diagram in one request
- `POST /api/diagram` — Generate a Mermaid diagram from an existing architecture or project requirements
- `POST /api/mcq` — Generate a requirement-clarification question
- `POST /api/notes/suggestion` — Generate a note suggestion

After starting the application, visit http://127.0.0.1:8000/docs for the complete Swagger API documentation and request schemas.

## Build and Test

Create a production frontend build:

```powershell
pnpm --dir frontend build
```

Run the Playwright demo-flow test:

```powershell
pnpm --dir frontend test:e2e
```
