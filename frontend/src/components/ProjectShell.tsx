import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import App from "../App";
import { request } from "../api/client";
import { createWorkspaceStore, WorkspaceContext } from "../store/workspaceStore";
import { createRequestStore, RequestContext } from "../store/requestStore";
import { createDatabaseSync, DatabaseContext } from "../store/databaseSync";
import type { ProjectIdentity } from "../store/databaseSync";
import { DatabaseGate } from "./DatabaseGate";

const BINDING = "ai-architecture-designer-project";
const OPEN = "ai-architecture-designer-open-projects";
function recoveryProjects(): ProjectIdentity[] {
  return Object.keys(localStorage).filter((key) => key.startsWith("ai-architecture-designer-recovery-")).flatMap((key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key)!);
      return typeof value.projectId === "string" && value.data ? [{ id: value.projectId, name: value.flight?.body?.name ?? "Unsaved project" }] : [];
    } catch { return []; }
  });
}
function session(id: string, legacy = false) {
  const key = crypto.randomUUID();
  const workspace = createWorkspaceStore(legacy ? "ai-architecture-designer-workspace" : `ai-architecture-designer-workspace-${id || key}`, !legacy);
  return { key, workspace, requests: createRequestStore(), database: createDatabaseSync(workspace, id) };
}
type Session = ReturnType<typeof session>;
const lastId = localStorage.getItem(BINDING);
let openIds: string[] = [];
try {
  const stored = JSON.parse(sessionStorage.getItem(OPEN) ?? "null");
  if (lastId && Array.isArray(stored)) openIds = stored.filter((id): id is string => typeof id === "string" && !!id);
} catch { /* Old or malformed UI preferences must not block database recovery. */ }
const initial = lastId ? [...new Set([...openIds, lastId])].map((id) => session(id))
  : sessionStorage.getItem(OPEN) === "[]" ? [] : [session("", true)];
const useSessions = create<{ sessions: Session[]; active: string; closing: string[] }>(() => ({ sessions: initial,
  active: initial.find((value) => value.database.currentProjectId() === lastId)?.key ?? initial[0]?.key ?? "", closing: [] }));
function rememberOpen() {
  sessionStorage.setItem(OPEN, JSON.stringify(useSessions.getState().sessions.map((value) => value.database.currentProjectId()).filter(Boolean)));
}

export function getProjectWorkspace(id: string) {
  const value = useSessions.getState().sessions.find((item) => item.database.currentProjectId() === id);
  if (!value) throw new Error("Project is not open");
  return value.workspace;
}

function activate(value: Session) {
  useSessions.setState({ active: value.key });
  const id = value.database.currentProjectId();
  if (id) localStorage.setItem(BINDING, id);
  rememberOpen();
}
function open(id: string) {
  const found = useSessions.getState().sessions.find((item) => item.database.currentProjectId() === id);
  if (found) { activate(found); return; }
  const value = session(id);
  useSessions.setState((state) => ({ sessions: [...state.sessions, value] }));
  activate(value);
}

function ProjectTab({ value, active, closing, onClose, onRenamed }: { value: Session; active: boolean; closing: boolean; onClose: () => void; onRenamed: (identity: ProjectIdentity) => void }) {
  const { activeProject, phase, loaded } = value.database.store();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState("");
  const startRename = () => {
    if (closing || !loaded || !["ready", "dirty", "saving"].includes(phase)) return;
    setName(activeProject?.name ?? ""); setError(""); setEditing(true);
  };
  const submit = async () => {
    if (renaming) return;
    setRenaming(true); setError("");
    try { await value.database.renameProject(name); setEditing(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Rename failed. Please retry."); }
    finally { setRenaming(false); }
  };
  const pending = value.requests((state) => state.pending);
  // Also synchronize list names after recovery/retry outside the rename form.
  useEffect(() => { if (activeProject) onRenamed(activeProject); }, [activeProject, onRenamed]);
  // Background saves must never change which project opens on the next visit.
  useEffect(() => { if (active && activeProject) localStorage.setItem(BINDING, activeProject.id); if (activeProject) rememberOpen(); }, [active, activeProject]);
  return <div className="project-tab">
    <button role="tab" aria-selected={active} title="Double-click to rename (or press F2)" onDoubleClick={startRename}
      onKeyDown={(event) => { if (event.key === "F2") { event.preventDefault(); startRename(); } }} onClick={() => activate(value)}>
      {activeProject?.name ?? "Workspace"} <small>{closing ? "Closing…" : pending ? "AI running" : phase}</small>
    </button>
    {editing && <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <input autoFocus aria-label="Rename project" maxLength={200} value={name} disabled={renaming}
        onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && !renaming) setEditing(false); }} />
      <button type="submit" disabled={renaming || !name.trim()}>Save name</button>
      <button type="button" disabled={renaming} onClick={() => setEditing(false)}>Cancel rename</button>
      {error && <span role="alert">{error}</span>}
    </form>}
    <button disabled={closing || renaming} aria-label={`Close ${activeProject?.name ?? "workspace"}`} onClick={onClose}>×</button>
  </div>;
}

export function ProjectShell() {
  const { sessions, active, closing } = useSessions();
  const [projects, setProjects] = useState<ProjectIdentity[]>([]);
  const syncName = useCallback((identity: ProjectIdentity) => {
    setProjects((items) => items.map((item) => item.id === identity.id ? identity : item));
  }, []);
  const [listOpen, setListOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const refresh = async () => {
    try {
      const saved = await request<ProjectIdentity[]>("/projects");
      setProjects([...saved, ...recoveryProjects().filter((item) => !saved.some((project) => project.id === item.id))].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)); setError("");
    }
    catch (failure) { setProjects(recoveryProjects()); setError(failure instanceof Error ? failure.message : "Could not load projects"); }
  };
  const add = async (source?: Session) => {
    if (creating) return;
    setCreating(true); setError("");
    try {
      const value = source && !source.database.currentProjectId() ? source : session("");
      if (source && value !== source) value.workspace.setState(source.database.data());
      if (!useSessions.getState().sessions.includes(value)) useSessions.setState((state) => ({ sessions: [...state.sessions, value] }));
      activate(value);
      await value.database.importLocal(source ? "Existing project" : name.trim() || "Untitled project");
      setName("");
      await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not create project"); }
    finally { setCreating(false); }
  };
  const close = async (value: Session) => {
    if (useSessions.getState().closing.includes(value.key)) return;
    const { overall, previewEditing, architectureEdit } = value.workspace.getState();
    if (overall && ((previewEditing?.id === overall.id && previewEditing.code !== overall.diagram)
      || (architectureEdit?.id === overall.id && architectureEdit.text !== overall.architecture))) {
      activate(value); setError("Save or discard the result edits before closing this project."); return;
    }
    useSessions.setState((state) => ({ closing: [...state.closing, value.key] }));
    try {
    value.requests.getState().cancel();
    await value.database.flush();
    if (!value.database.canClose()) { activate(value); setError("This project still has unsaved changes or recovery pending. Retry its save before closing."); return; }
    value.database.dispose();
    const remaining = useSessions.getState().sessions.filter((item) => item !== value);
    useSessions.setState((state) => ({ sessions: remaining, active: state.active === value.key ? remaining[0]?.key ?? "" : state.active }));
    const selected = remaining.find((item) => item.key === useSessions.getState().active);
    if (selected) activate(selected); else localStorage.removeItem(BINDING);
    rememberOpen();
    setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not close project. Your changes are retained."); }
    finally { useSessions.setState((state) => ({ closing: state.closing.filter((key) => key !== value.key) })); }
  };
  return <>
    <nav className="project-bar" aria-label="Projects">
      <div role="tablist" aria-label="Open projects" className="project-tabs">
        {sessions.map((value) => <ProjectTab key={value.key} value={value} active={value.key === active} closing={closing.includes(value.key)} onClose={() => void close(value)}
          onRenamed={syncName} />)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void add(); }}>
        <input aria-label="New project name" maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" />
        <button disabled={creating} type="submit">New project</button>
      </form>
      <button onClick={() => { setListOpen(!listOpen); void refresh(); }}>Project list</button>
    </nav>
    {error && <div className="status-banner status-error" role="alert">{error}</div>}
    {listOpen && <section className="project-list" aria-label="Saved projects">
      <button onClick={() => void refresh()}>Refresh projects</button>
      {projects.map((item) => <button key={item.id} onClick={() => { open(item.id); setListOpen(false); }}>{item.name} · {item.id.slice(0, 8)}</button>)}
      {!projects.length && <p>No saved projects found.</p>}
    </section>}
    {sessions.map((value) => <WorkspaceContext.Provider key={value.key} value={value.workspace}>
      <RequestContext.Provider value={value.requests}>
        <DatabaseContext.Provider value={value.database}>
          <DatabaseGate active={value.key === active} onOpen={open} onImport={() => void add(value)}>
            <div inert={closing.includes(value.key)}><App active={value.key === active} /></div>
          </DatabaseGate>
        </DatabaseContext.Provider>
      </RequestContext.Provider>
    </WorkspaceContext.Provider>)}
    {!sessions.length && <div className="database-wait">Open a saved project from Project list, or create a new project.</div>}
  </>;
}
