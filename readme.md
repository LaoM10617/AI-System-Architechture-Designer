# AI System Architecture Designer

An AI-assisted workspace for turning requirements into explicit decisions, architecture proposals, and editable system diagrams. Built for local, single-user exploration and live demonstrations, it combines a brainstorming whiteboard with project-isolated persistence and a reviewable AI generation workflow.

**React + TypeScript + Zustand · FastAPI + Pydantic · SQLite · Gemini / Groq · Mermaid · Playwright**

The goal is not simply to generate a picture: it is to help users explore an idea, decide which inputs should influence the design, inspect the result, and continue without losing their work.

## What the demo can do today

- Create independent projects, switch between tabs, reopen saved projects, and double-click a tab to rename it.
- Use a three-column workspace: project controls, a note whiteboard, and an overall architecture/diagram preview. Side panels collapse and resize.
- Edit, move, resize, minimize, favorite, trash, and restore notes. Favoriting removes a note from the visible whiteboard without discarding it.
- Explore a note with AI suggestions, or generate multiple-choice clarification questions.
- Mark notes as draft or confirmed decisions. Only confirmed notes join the project settings as inputs to overall generation.
- Stream architecture text; generate, edit, zoom, fullscreen, and export Mermaid diagrams as SVG.
- Track generation inputs, detect outdated results, save result versions, and restore earlier results without reverting requirements.
- Autosave each project to SQLite, retain failed writes locally, and recover after refresh or service restart.
- Manually switch between configured Gemini and Groq providers; use a fake provider for repeatable, quota-free demonstrations.

## Technical architecture

### 1. Presentation and project-scoped state

React 19 renders the interface; TypeScript defines the domain contracts. Vite serves the frontend and proxies API requests during local development. Zustand owns workspace state; the DOM is a rendering surface, not a persistence format.

`ProjectShell` manages open projects. Each project receives its own workspace store, request controller, and database synchronization controller through React context. Switching tabs changes the visible workspace rather than overwriting one global store with another project's data. Only the active workspace renders its UI; inactive project controllers remain available for in-flight work.

The domain includes project inputs, notes, decisions, diagrams, favorites, trash, overall results, and version history. Overall results are separate from notes. Layout preferences and the default provider selection are application-level preferences; project content, save revisions, and request ownership are project-scoped.

### 2. API and AI orchestration

FastAPI exposes typed endpoints for generation and persistence. Pydantic validates request/response contracts, while error responses use a consistent `error.code` / `error.message` shape.

`AIService` owns prompt construction, bounded note context, timeouts, result reuse, and an in-memory request cache. Provider adapters implement completion, streaming, and structured generation using the Google Gen AI SDK or the OpenAI-compatible client. Gemini and Groq have separate service/cache instances; `X-AI-Provider` selects the provider for an AI request. Keys stay on the backend.

Architecture text is streamed through fetch with a text response, not SSE. A diagram request either converts a reusable architecture or obtains architecture plus Mermaid source in one structured model call. Generated Mermaid is rendered in the browser with strict security mode; invalid source exposes an editing path rather than crashing the workspace.

### 3. Persistence and recovery

Python's SQLite driver provides local storage, with short-lived connections, foreign keys, WAL mode, and transactional writes. Storage endpoints execute in FastAPI's thread pool rather than blocking the asynchronous AI path.

The data model is intentionally small:

- `projects`: stable identity, display name, creation/update timestamps.
- `workspaces`: one structured snapshot and revision per project, plus its current result pointer.
- `solution_versions`: immutable saved architecture/diagram results, their generation basis, and version metadata.
- `write_requests`: project-scoped idempotency receipts for safe retries.

SQLite is the durable source of saved project data. Browser storage supplements it with project-scoped caches, unfinished writes, and uncommitted result-editor drafts. The application does not depend on a last-second network save when the browser closes.

## Deliberate design choices

### Separate exploration from accepted decisions

Draft notes do not affect the overall diagram. Confirmed notes do, including confirmed notes stored in Favorites; trashed notes do not. Each generated result stores a snapshot of its generation basis. Changes to relevant inputs trigger an out-of-date indication, and outdated architecture is not silently reused for diagram generation.

This makes the AI input boundary visible and gives the user control over when an exploratory idea becomes a design constraint. Note suggestions and MCQ generation have their own context paths; the confirmed-only rule applies to overall architecture/diagram generation.

### Keep asynchronous work attached to its project

An AI request captures the originating project's store and input basis. Switching to project B does not redirect a response started in A. Cancellation is checked before applying results; completion of an older cancelled request cannot clear a newer request's controller.

Closing a project cancels its AI request and waits for pending saves. Failed saves keep the tab open. A closed project is not a deleted project: it remains available in SQLite and the project list.

### Make retries safe, not just convenient

Writes include an expected revision and a request ID. The backend rejects stale revisions and scopes duplicate-request protection to the project. If a write succeeds but its response is lost, retrying the original request returns its receipt instead of creating another version.

Rename uses the same save queue and revision sequence as content changes: pending writes finish first, the name is committed, and subsequent autosaves use the new revision. A result restore creates a new current version; it does not overwrite historical results or roll back notes.

Workspace snapshots keep the local persistence implementation compact. This is not event sourcing or a per-keystroke history system; the explicitly versioned artifacts are the overall design results.

### Reduce unnecessary model work

- Reuse current architecture when its generation basis still matches.
- Generate architecture and diagram together when no reusable architecture exists.
- Stream text to reduce perceived waiting, without claiming streaming reduces total inference time.
- Limit note context and cache identical serialized request inputs for a configurable TTL.
- Use asynchronous provider calls and bounded timeouts.
- Offer manual provider switching and a fake provider rather than silently making another external request.

Provider status reports configuration and request outcomes, not remaining quota. Timing headers aid request diagnostics; they are not an end-to-end streaming benchmark.

### Test the failure boundaries that matter for a demo

Playwright exercises project switching during AI generation, save failures, cancellation, rename conflicts, legacy import, and reopening projects. A separate restart scenario stops its own frontend/backend processes, restarts them against the same temporary SQLite file, and restores two projects in a fresh browser context. Backend tests cover transaction rollback, revisions, idempotency, and project isolation.

These checks target data loss and cross-project contamination rather than relying only on a successful generation screenshot.

## Repository guide

```text
.
├── backend.py                       # Current FastAPI entry point
├── run.py                           # Start frontend and backend together
├── backend_app/
│   ├── app.py                       # Routes, provider selection, errors, timing
│   ├── config.py                    # Environment and provider configuration
│   ├── schemas.py                   # AI request/response contracts
│   ├── providers.py                 # Gemini, Groq, compatible and fake adapters
│   ├── service.py                   # Prompts, streaming, reuse, cache, timeouts
│   ├── storage.py                   # SQLite transactions and version operations
│   ├── storage_models.py            # Persistence contracts
│   └── storage_routes.py            # Project-scoped persistence API
├── frontend/
│   ├── src/
│   │   ├── main.tsx                 # Application bootstrap and providers
│   │   ├── App.tsx                  # Project AI workflows
│   │   ├── api/client.ts            # Shared API client and streaming fetch
│   │   ├── components/
│   │   │   ├── ProjectShell.tsx     # Tabs, creation, opening, closing, rename
│   │   │   ├── DatabaseGate.tsx     # Loading, recovery and conflict boundaries
│   │   │   ├── WorkspaceLayout.tsx  # Resizable three-column layout
│   │   │   ├── Whiteboard.tsx       # Notes and decision stamps
│   │   │   ├── OverallPreview.tsx   # Overall result, editing and versions
│   │   │   └── MermaidViewer.tsx    # Rendering, source editing and SVG export
│   │   ├── store/
│   │   │   ├── workspaceStore.ts    # Project store factory and domain actions
│   │   │   ├── databaseSync.ts      # Save queue, revisions, retry and recovery
│   │   │   ├── requestStore.ts      # Per-project request ownership/cancellation
│   │   │   └── overallResult.ts     # Generation basis, freshness and migration
│   │   ├── types/domain.ts          # Workspace domain types
│   │   └── ui/                     # Error boundary and toast feedback
│   ├── e2e/                        # Browser workflow and failure-path tests
│   ├── restart-tests/              # Real frontend/backend restart acceptance
│   └── playwright*.config.ts       # Isolated browser test configurations
├── tests/                          # Backend persistence and provider tests
├── data/                           # Local SQLite and backups; Git-ignored
├── api.env.example                 # Safe configuration template
├── requirements.txt                # Python dependencies
├── docs/                           # Existing demo assets
├── index.html, script.js, style.css # Historical vanilla frontend
├── js/, old versions/              # Historical implementations
└── backend_Gemini.py                # Historical backend implementation
```

The active application is `frontend/` + `backend_app/`, launched through `backend.py` / `run.py`. Historical files are retained for reference; they are not the current startup path. Collaboration rooms and multi-user synchronization are outside the active workflow.

## Local setup

Use Python 3.12+, Node.js 22.12+, and pnpm. Run commands from the repository root. On Windows, invoking the virtual environment's Python directly avoids needing to activate it.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
pnpm --dir frontend install
```

If pnpm is missing, install it with `npm install -g pnpm` and reopen the terminal if necessary. Python virtual-environment activation does not install or expose Node.js/pnpm.

Copy the configuration template **only on first setup**; do not overwrite an existing private configuration:

```powershell
Copy-Item api.env.example api.env
```

For a reliable offline demo, set `AI_PROVIDER=fake` in `api.env`. The fake provider returns demonstration data without consuming API quota.

For real AI, set `AI_PROVIDER=gemini` and replace `GEMINI_API_KEY` with your key. The template supplies the project's configured model; model selection can be overridden for your account. Optionally configure `GROQ_API_KEY` and `GROQ_MODEL` for manual backup-provider selection in the left panel. Alternatively, `GROQ_API_KEY_FILE` can point to a private local text file.

Start both services:

```powershell
.\.venv\Scripts\python.exe run.py
```

Open [the workspace](http://127.0.0.1:5173). [API documentation](http://127.0.0.1:8000/docs) and [health status](http://127.0.0.1:8000/health) are served by FastAPI. Stop the launcher with `Ctrl+C`. The launcher starts local development servers, not a production deployment.

### Configuration and data

- `DATABASE_PATH` selects the SQLite file; the template uses `data/workspace.sqlite3`. Tables are initialized at backend startup.
- `AI_PROVIDER` selects `gemini`, `groq`, `openai` (compatible endpoint), or `fake`. Follow the template for the intended Gemini default.
- Provider-specific model variables such as `GROQ_MODEL` take precedence; `AI_MODEL` applies to the configured default provider.
- For an OpenAI-compatible service, explicitly configure `OPENAI_API_KEY`, `AI_MODEL`, and `AI_BASE_URL` for the intended endpoint.
- `AI_TIMEOUT_SECONDS`, `AI_CACHE_TTL_SECONDS`, `AI_MAX_NOTES`, and `AI_MAX_CONTEXT_CHARS` tune generation behavior.
- `CORS_ORIGINS` controls allowed origins. The normal frontend path uses Vite's `/api` proxy; see `frontend/vite.config.ts` and `frontend/.env.example` for frontend overrides.

Private environment files, key files, SQLite data, and local milestone logs are excluded from Git. Cloning the repository does not copy your keys or saved projects. Back up SQLite separately using a consistent SQLite backup, or stop the application before copying its database files. Uncommitted editor drafts remain browser-local until explicitly saved as a result version.

## API and validation entry points

AI routes include `/api/architecture`, `/api/architecture/stream`, `/api/design`, `/api/diagram`, `/api/mcq`, and `/api/notes/suggestion`. `/api/providers` returns safe provider metadata. Project list/create/import live under `/api/projects`; rename, workspace synchronization, and version operations use explicit project IDs. Swagger documents the exact schemas.

```powershell
# Production frontend compilation
pnpm --dir frontend build

# Backend tests: temporary databases and fake providers
.\.venv\Scripts\python.exe -B -m unittest discover -s tests -v

# First-time browser installation
pnpm --dir frontend exec playwright install chromium

# Focused multi-project acceptance
pnpm --dir frontend exec playwright test e2e/projects.spec.ts e2e/project-lifecycle.spec.ts e2e/rename.spec.ts

# Actual service stop/restart with a temporary database
pnpm --dir frontend exec playwright test --config playwright.restart.config.ts
```

Stop ordinary development servers before the default browser suite: it reserves ports 8000/5173 and refuses an existing backend. The restart suite uses test-owned processes and temporary ports. The Windows restart harness expects `.venv/Scripts/python.exe`.

## Next steps: from one overall diagram to connected architectural views

**Proposed direction, not implemented functionality.** Early hands-on use has made note-level AI exploration especially useful. It has also exposed a modeling issue: business structure, implementation details, and failure scenarios should not all compete for space in the same overall diagram. Adding more prompt text does not resolve that mismatch.

A better direction is **multiple scoped views over related decisions**, not one increasingly large diagram. Hierarchy is useful but insufficient: C4 distinguishes structural abstraction levels and supporting dynamic/deployment views, while arc42 separately treats structure, runtime behavior, deployment, decisions, and crosscutting concepts. These are reference points for the roadmap, not frameworks the current implementation claims to implement. [C4 diagrams](https://c4model.com/diagrams), [arc42 overview](https://arc42.org/overview/).

### 1. Smallest useful increment: a diagram for one note

Keep the existing **AI suggestion** action unchanged. Add a separate **Generate local diagram** action that uses the note's current text, an explicit diagram purpose, and only selected supporting context. Return an editable Mermaid diagram card linked to the source note; do not replace the note or overwrite the overall result.

For example, a note about payment retries could produce a sequence or state diagram, while the overall view continues to show the main business systems. Store the source note ID and input snapshot so edits can mark the local result stale. Reuse existing Mermaid rendering/export and project persistence; no full drawing editor is required for this increment.

Acceptance: creating or regenerating a local diagram changes neither the overall result nor its generation basis.

### 2. Separate approval from scope

Today, “confirmed” means inclusion in overall generation. Extend that into two independent concepts: **decision status** and **where the decision applies**. A confirmed retry policy may belong to a payment scenario, not the business overview.

Give each view an explicit purpose, scope, and selected input set. Start with a few useful view types rather than a rigid universal hierarchy: overview, component structure, interaction/failure scenario, deployment, and data/state view. Existing confirmed decisions should retain their current overall scope during migration.

Promotion to the overview should be explicit: a user approves a concise summary of a local decision, rather than automatically injecting the entire discussion or diagram into the global prompt.

### 3. Link and expand before merging

Initially connect artifacts with explicit references such as “explains,” “refines,” or “depends on.” Opening a linked detail view provides useful drill-down without changing either diagram. Record relationships using stable artifact IDs, not positions on the whiteboard or labels embedded in SVG.

Only later introduce reviewed merge proposals: show what would change, allow acceptance/rejection, and create a new version. Do not concatenate Mermaid sources or merge SVG graphics as if they were a shared semantic model. If cross-view editing becomes central, introduce stable architecture-entity IDs and relationships before attempting automatic synchronization.

### 4. Add evidence and evaluation as the workflow grows

Record lightweight decision rationale, alternatives, source references, and affected views. Invalidate only views whose inputs changed. Add a small evaluation set spanning overview diagrams, failure scenarios, and deployment views, then measure output validity, relevance, latency, and token usage per task.

The intended evolution is incremental: **note exploration → scoped local diagram → linked views → reviewed changes across views**. This preserves the fast brainstorming loop while making architectural depth navigable instead of forcing it into one picture.
