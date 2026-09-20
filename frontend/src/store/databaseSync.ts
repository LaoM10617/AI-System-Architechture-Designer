import { create } from "zustand";
import { createContext, useContext } from "react";
import { ApiError, request } from "../api/client";
import type { OverallResult, Workspace } from "../types/domain";
import type { WorkspaceInstance } from "./workspaceStore";

type Phase = "loading" | "choose" | "recovery" | "ready" | "dirty" | "saving" | "error" | "conflict";
type Snapshot = Omit<Workspace, "overall" | "resultHistory">;
interface Bundle { request_id: string; expected_revision: number; schema_version: number; snapshot: Snapshot; versions: OverallResult[]; current_version_id: string | null }
interface Receipt { project_id: string; revision: number }
interface DbVersion extends Omit<OverallResult, "createdAt"> { created_at: string }
export interface ProjectIdentity { id: string; name: string }
interface Loaded { project_id: string; project_record: ProjectIdentity; snapshot: Snapshot; revision: number; overall: DbVersion | null; result_history: DbVersion[] }
interface Pending { projectId: string; data: Workspace; revision: number; versions?: OverallResult[]; flight?: { path: string; method: string; body: unknown; data: Workspace } }
export function createDatabaseSync(useWorkspaceStore: WorkspaceInstance, initialId: string) {
const useDatabaseSync = create<{ phase: Phase; message: string; projects: ProjectIdentity[]; activeProject: ProjectIdentity | null; loaded: boolean }>(() => ({ phase: "loading", message: "Loading local database…", projects: [], activeProject: null, loaded: false }));
const set = useDatabaseSync.setState;
const CACHE = "ai-architecture-designer-workspace";
const PREFIX = "ai-architecture-designer-recovery-";
let tabId = sessionStorage.getItem("architecture-tab-id");
if (!tabId) { tabId = crypto.randomUUID(); sessionStorage.setItem("architecture-tab-id", tabId); }
const recoveryKey = PREFIX + tabId + "-" + (initialId || crypto.randomUUID());
let recoveredKey = recoveryKey;
let projectId = initialId;
let revision = 0;
let pending: Pending | null = null;
let saved = "";
let started = false;
let applying = false;
let busy = false;
let saving: Promise<void> | null = null;
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const versions = new Map<string, OverallResult>();

function data(): Workspace {
  const { project, notes, diagrams, favorites, trash, overall, resultHistory, legacyArchive } = useWorkspaceStore.getState();
  return JSON.parse(JSON.stringify({ project, notes, diagrams, favorites, trash, overall, resultHistory, legacyArchive }));
}
function bundle(value: Workspace): Bundle {
  const { overall, resultHistory, ...snapshot } = value;
  for (const item of [...resultHistory, ...(overall ? [overall] : [])]) versions.set(item.id, item);
  return { request_id: crypto.randomUUID(), expected_revision: revision, schema_version: 3, snapshot,
    versions: [...versions.values()], current_version_id: overall?.id ?? null };
}
function backup() {
  const original = localStorage.getItem(CACHE);
  const key = "ai-architecture-designer-pre-database-backup";
  if (original && !localStorage.getItem(key)) localStorage.setItem(key, original);
}
function persistPending() {
  if (pending) localStorage.setItem(recoveryKey, JSON.stringify(pending));
}
async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  return request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
}
function failed(error: unknown) {
  const conflict = error instanceof ApiError && error.status === 409;
  set({ phase: conflict ? "conflict" : "error", message: conflict
    ? "Another page changed this project. Your local changes are retained. Load the database copy or save your changes as a new project."
    : `Database save/load failed. Local changes are retained. ${error instanceof Error ? error.message : "Please retry."}` });
}
const convert = (item: DbVersion): OverallResult => ({ id: item.id, version: item.version, createdAt: item.created_at,
  architecture: item.architecture, diagram: item.diagram, basis: item.basis, source: item.source });

async function loadProject(id: string) {
  if (busy || disposed) return;
  if (projectId && projectId !== id) throw new Error("A project controller cannot load a different project");
  busy = true;
  clearTimeout(timer);
  set({ phase: "loading", message: "Loading database workspace…" });
  try {
    backup();
    const loaded = await call<Loaded>(`/projects/${id}/workspace`);
    if (loaded.project_id !== id || loaded.project_record.id !== id) throw new Error("Database returned a different project. Workspace was not replaced.");
    const value: Workspace = { ...loaded.snapshot, overall: loaded.overall ? convert(loaded.overall) : null, resultHistory: loaded.result_history.map(convert) };
    applying = true;
    useWorkspaceStore.persist.setOptions({ name: `ai-architecture-designer-workspace-${id}` });
    useWorkspaceStore.setState(value);
    applying = false;
    projectId = id; revision = loaded.revision; versions.clear();
    saved = JSON.stringify(data()); pending = null;
    for (const key of new Set([recoveryKey, recoveredKey])) {
      const draft = localStorage.getItem(key);
      if (draft) { localStorage.setItem(`ai-architecture-designer-backup-${crypto.randomUUID()}`, draft); localStorage.removeItem(key); }
    }
    // Recovery data is deliberately retained as a backup when choosing database data.
    set((state) => ({ phase: "ready", loaded: true, activeProject: loaded.project_record,
      projects: state.projects.map((item) => item.id === id ? loaded.project_record : item), message: "Saved to SQLite" }));
  } catch (error) { applying = false; failed(error); }
  finally { busy = false; }
}

async function importLocal(name = "Existing project") {
  if (busy) return;
  if (projectId) throw new Error("Import requires a new project controller");
  started = true;
  try {
    backup();
    const recovery = pending;
    if (recovery) localStorage.setItem(`ai-architecture-designer-backup-${crypto.randomUUID()}`, JSON.stringify(recovery));
    projectId = crypto.randomUUID(); revision = 0; versions.clear();
    useWorkspaceStore.persist.setOptions({ name: `ai-architecture-designer-workspace-${projectId}` });
    for (const item of recovery?.versions ?? []) versions.set(item.id, item);
    const value = pending?.data ?? data();
    applying = true; useWorkspaceStore.setState(value); applying = false;
    const body = { ...bundle(value), project_id: projectId, name };
    // Keep failed creations discoverable on refresh, even before the first receipt.
    set({ activeProject: { id: projectId, name } });
    const { expected_revision: _revision, ...creation } = body;
    pending = { projectId, data: value, revision, flight: { path: "/projects/import", method: "POST", body: creation, data: value } };
    persistPending();
    await flush();
  } catch (error) { failed(error); }
}

function flush(): Promise<void> {
  if (saving) return saving;
  if (busy || !pending || disposed) return Promise.resolve();
  // All callers, including close, await the same in-flight save and queued edits.
  saving = savePending().finally(() => { saving = null; });
  return saving;
}

async function renameProject(input: string) {
  const name = input.trim();
  if (!name || name.length > 200) throw new Error("Project name must contain 1–200 characters.");
  if (!useDatabaseSync.getState().loaded || disposed) throw new Error("Load the project before renaming it.");
  // Resolve any uncertain previous write with its original idempotency key first.
  await flush();
  if (busy || pending || useDatabaseSync.getState().phase !== "ready") throw new Error("Resolve the project's save or conflict before renaming.");
  if (useDatabaseSync.getState().activeProject?.name === name) return;
  const value = data();
  pending = { projectId, data: value, revision, flight: { path: `/projects/${projectId}`, method: "PATCH",
    body: { request_id: crypto.randomUUID(), expected_revision: revision, name }, data: value } };
  // The normal save loop persists/retries the rename and advances the same revision.
  await flush();
  if (useDatabaseSync.getState().phase !== "ready") throw new Error(useDatabaseSync.getState().message);
}

async function savePending() {
  busy = true;
  set({ phase: "saving", message: "Saving to SQLite…" });
  try {
    while (pending) {
      const sent = pending.flight?.data ?? pending.data;
      if (!pending.flight) pending.flight = { path: `/projects/${projectId}/sync`, method: "PUT", body: bundle(sent), data: sent };
      persistPending(); // Retain the exact request ID/payload across timeouts and reloads.
      const flight = pending.flight;
      const receipt = await call<Receipt>(flight.path, flight.method, flight.body);
      if (receipt.project_id !== projectId) throw new Error("Save response belongs to a different project");
      revision = receipt.revision;
      set((state) => {
        const creation = flight.body as { name?: string };
        const identity = creation.name ? { id: projectId, name: creation.name }
          : state.activeProject ?? state.projects.find((item) => item.id === projectId) ?? { id: projectId, name: "Existing project" };
        return { activeProject: identity, projects: state.projects.some((item) => item.id === projectId)
          ? state.projects.map((item) => item.id === projectId ? identity : item) : [identity, ...state.projects] };
      });
      saved = JSON.stringify(sent);
      pending.flight = undefined; pending.revision = revision;
      if (JSON.stringify(pending.data) === saved) {
        pending = null;
        localStorage.removeItem(recoveryKey);
        if (recoveredKey !== recoveryKey) localStorage.removeItem(recoveredKey);
        versions.clear();
      } else persistPending();
    }
    set({ phase: "ready", loaded: true, message: "Saved to SQLite" });
  } catch (error) { failed(error); }
  finally { busy = false; }
}

async function recoverLocal() {
  if (!pending || busy || disposed) return;
  projectId = pending.projectId; revision = pending.revision;
  useWorkspaceStore.persist.setOptions({ name: `ai-architecture-designer-workspace-${projectId}` });
  for (const item of pending.versions ?? []) versions.set(item.id, item);
  applying = true; useWorkspaceStore.setState(pending.data); applying = false;
  set({ loaded: true });
  await flush();
}

async function retryDatabase() {
  if (pending) { if (!useDatabaseSync.getState().loaded) await recoverLocal(); else await flush(); }
  else if (projectId) await loadProject(projectId);
  else { started = false; await startDatabase(); }
}

async function startDatabase() {
  if (started) return;
  started = true;
  try {
    // Inspect recovery before network access: an offline database must not hide drafts.
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(PREFIX));
    const key = localStorage.getItem(recoveryKey) ? recoveryKey : keys.find((key) => {
      try { return JSON.parse(localStorage.getItem(key)!).projectId === projectId || (!projectId && key === PREFIX + tabId); } catch { return false; }
    });
    if (key) {
      const candidate: Pending = JSON.parse(localStorage.getItem(key)!);
      if (!candidate || (projectId && candidate.projectId !== projectId) || !candidate.data || !Number.isInteger(candidate.revision)) throw new Error("Invalid project recovery record; original data retained.");
      const flight = candidate.flight;
      if (flight && !((flight.path === `/projects/${candidate.projectId}/sync` && flight.method === "PUT")
        || (flight.path === `/projects/${candidate.projectId}` && flight.method === "PATCH")
        || (flight.path === "/projects/import" && flight.method === "POST" && (flight.body as { project_id?: string }).project_id === candidate.projectId))) throw new Error("Recovery request does not belong to this project; original data retained.");
      pending = candidate; recoveredKey = key; projectId = candidate.projectId;
      const name = (flight?.body as { name?: string } | undefined)?.name ?? "Recovered project";
      set({ activeProject: { id: projectId, name } });
      set({ phase: "recovery", message: "Unsaved local changes were found. Recover them or load the database copy." });
    }
    const hadRecovery = !!pending;
    const projects = await call<ProjectIdentity[]>("/projects");
    if (disposed) return;
    set({ projects });
    if (hadRecovery) {
      const identity = projects.find((item) => item.id === projectId);
      if (identity) set({ activeProject: identity });
    } else if (projectId) await loadProject(projectId);
    else set({ phase: "choose", message: "Choose a saved project or import this browser's workspace into SQLite." });
  } catch (error) { failed(error); }
}

const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
  if (applying || !useDatabaseSync.getState().loaded) return;
  const value = data();
  if (!pending && JSON.stringify(value) === saved) return;
  const newVersion = state.overall?.id !== previous.overall?.id;
  for (const item of [...value.resultHistory, ...(value.overall ? [value.overall] : [])]) versions.set(item.id, item);
  pending = { projectId, revision, ...pending, data: value, versions: [...versions.values()] };
  try { persistPending(); } catch (error) { failed(error); return; }
  const phase = useDatabaseSync.getState().phase;
  if (["error", "conflict", "recovery"].includes(phase)) return;
  if (!busy) set({ phase: "dirty", message: "Unsaved changes — saving shortly…" });
  clearTimeout(timer);
  timer = setTimeout(() => { void flush(); }, newVersion ? 0 : 1000);
});
const beforeUnload = (event: BeforeUnloadEvent) => {
  const { overall, architectureEdit, previewEditing } = useWorkspaceStore.getState();
  if (pending || (overall && ((architectureEdit?.id === overall.id && architectureEdit.text !== overall.architecture)
    || (previewEditing?.id === overall.id && previewEditing.code !== overall.diagram)))) { event.preventDefault(); event.returnValue = ""; }
};
const pageHide = () => { if (pending) persistPending(); };
window.addEventListener("beforeunload", beforeUnload);
window.addEventListener("pagehide", pageHide);

return { store: useDatabaseSync, loadProject, importLocal, renameProject, flush, recoverLocal, retryDatabase, startDatabase,
  currentProjectId: () => projectId, data: () => pending?.data ?? data(),
  canClose: () => !busy && !pending && useDatabaseSync.getState().phase !== "recovery",
  dispose: () => { disposed = true; clearTimeout(timer); unsubscribe(); window.removeEventListener("beforeunload", beforeUnload); window.removeEventListener("pagehide", pageHide); },
};
}

export type DatabaseController = ReturnType<typeof createDatabaseSync>;
export const DatabaseContext = createContext<DatabaseController | null>(null);
export function useDatabaseController() {
  const controller = useContext(DatabaseContext);
  if (!controller) throw new Error("Database requires a project container");
  return controller;
}
