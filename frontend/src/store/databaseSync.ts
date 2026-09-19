import { create } from "zustand";
import { ApiError, request } from "../api/client";
import type { OverallResult, Workspace } from "../types/domain";
import { useWorkspaceStore } from "./workspaceStore";

type Phase = "loading" | "choose" | "recovery" | "ready" | "dirty" | "saving" | "error" | "conflict";
type Snapshot = Omit<Workspace, "overall" | "resultHistory">;
interface Bundle { request_id: string; expected_revision: number; schema_version: number; snapshot: Snapshot; versions: OverallResult[]; current_version_id: string | null }
interface Receipt { project_id: string; revision: number }
interface DbVersion extends Omit<OverallResult, "createdAt"> { created_at: string }
interface ProjectIdentity { id: string; name: string }
interface Loaded { project_id: string; project_record: ProjectIdentity; snapshot: Snapshot; revision: number; overall: DbVersion | null; result_history: DbVersion[] }
interface Pending { projectId: string; data: Workspace; revision: number; versions?: OverallResult[]; flight?: { path: string; method: string; body: unknown; data: Workspace } }
export const useDatabaseSync = create<{ phase: Phase; message: string; projects: ProjectIdentity[]; activeProject: ProjectIdentity | null; loaded: boolean }>(() => ({ phase: "loading", message: "Loading local database…", projects: [], activeProject: null, loaded: false }));
const set = useDatabaseSync.setState;
const CACHE = "ai-architecture-designer-workspace";
const BINDING = "ai-architecture-designer-project";
const PREFIX = "ai-architecture-designer-recovery-";
let tabId = sessionStorage.getItem("architecture-tab-id");
if (!tabId) { tabId = crypto.randomUUID(); sessionStorage.setItem("architecture-tab-id", tabId); }
const recoveryKey = PREFIX + tabId;
let recoveredKey = recoveryKey;
let projectId = localStorage.getItem(BINDING) ?? "";
let revision = 0;
let pending: Pending | null = null;
let saved = "";
let started = false;
let applying = false;
let busy = false;
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

export async function loadProject(id: string) {
  if (busy) return;
  set({ phase: "loading", message: "Loading database workspace…" });
  try {
    backup();
    const loaded = await call<Loaded>(`/projects/${id}/workspace`);
    if (loaded.project_id !== id || loaded.project_record.id !== id) throw new Error("Database returned a different project. Workspace was not replaced.");
    const value: Workspace = { ...loaded.snapshot, overall: loaded.overall ? convert(loaded.overall) : null, resultHistory: loaded.result_history.map(convert) };
    applying = true;
    useWorkspaceStore.setState(value);
    applying = false;
    projectId = id; revision = loaded.revision; versions.clear();
    saved = JSON.stringify(data()); pending = null;
    for (const key of new Set([recoveryKey, recoveredKey])) {
      const draft = localStorage.getItem(key);
      if (draft) { localStorage.setItem(`ai-architecture-designer-backup-${crypto.randomUUID()}`, draft); localStorage.removeItem(key); }
    }
    localStorage.setItem(BINDING, id);
    // Recovery data is deliberately retained as a backup when choosing database data.
    set({ phase: "ready", loaded: true, activeProject: loaded.project_record, message: "Saved to SQLite" });
  } catch (error) { applying = false; failed(error); }
}

export async function importLocal() {
  if (busy) return;
  try {
    backup();
    const recovery = pending;
    if (recovery) localStorage.setItem(`ai-architecture-designer-backup-${crypto.randomUUID()}`, JSON.stringify(recovery));
    projectId = crypto.randomUUID(); revision = 0; versions.clear();
    for (const item of recovery?.versions ?? []) versions.set(item.id, item);
    const value = pending?.data ?? data();
    applying = true; useWorkspaceStore.setState(value); applying = false;
    const body = { ...bundle(value), project_id: projectId, name: "Existing project" };
    const { expected_revision: _revision, ...creation } = body;
    pending = { projectId, data: value, revision, flight: { path: "/projects/import", method: "POST", body: creation, data: value } };
    persistPending();
    localStorage.setItem(BINDING, projectId);
    await flush();
  } catch (error) { failed(error); }
}

export async function flush() {
  if (busy || !pending) return;
  busy = true;
  set({ phase: "saving", message: "Saving to SQLite…" });
  try {
    while (pending) {
      const sent = pending.flight?.data ?? pending.data;
      if (!pending.flight) pending.flight = { path: `/projects/${projectId}/sync`, method: "PUT", body: bundle(sent), data: sent };
      persistPending(); // Retain the exact request ID/payload across timeouts and reloads.
      const flight = pending.flight;
      const receipt = await call<Receipt>(flight.path, flight.method, flight.body);
      revision = receipt.revision; projectId = receipt.project_id;
      localStorage.setItem(BINDING, projectId);
      set((state) => {
        const creation = flight.body as { name?: string };
        const identity = state.projects.find((item) => item.id === projectId)
          ?? { id: projectId, name: creation.name ?? "Existing project" };
        return { activeProject: identity, projects: state.projects.some((item) => item.id === projectId) ? state.projects : [identity, ...state.projects] };
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

export async function recoverLocal() {
  if (!pending) return;
  projectId = pending.projectId; revision = pending.revision;
  for (const item of pending.versions ?? []) versions.set(item.id, item);
  applying = true; useWorkspaceStore.setState(pending.data); applying = false;
  set({ loaded: true });
  await flush();
}

export async function retryDatabase() {
  if (pending) await flush();
  else if (projectId) await loadProject(projectId);
  else { started = false; await startDatabase(); }
}

export async function startDatabase() {
  if (started) return;
  started = true;
  try {
    const projects = await call<{ id: string; name: string }[]>("/projects");
    set({ projects });
    // Prefer this tab's recovery. Other tabs' records remain separately preserved.
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(PREFIX));
    const key = localStorage.getItem(recoveryKey) ? recoveryKey : keys.find((key) => {
      try { return JSON.parse(localStorage.getItem(key)!).projectId === projectId; } catch { return false; }
    });
    if (key) {
      pending = JSON.parse(localStorage.getItem(key)!); recoveredKey = key;
      set({ phase: "recovery", message: "Unsaved local changes were found. Recover them or load the database copy." });
    } else if (projectId && projects.some((item) => item.id === projectId)) await loadProject(projectId);
    else set({ phase: "choose", message: "Choose a saved project or import this browser's workspace into SQLite." });
  } catch (error) { failed(error); }
}

useWorkspaceStore.subscribe((state, previous) => {
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
window.addEventListener("beforeunload", (event) => {
  if (pending) { event.preventDefault(); event.returnValue = ""; }
});
window.addEventListener("pagehide", () => { if (pending) persistPending(); });

export function currentProjectId() { return projectId; }
