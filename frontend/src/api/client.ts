import type { ProjectInput } from "../types/domain";
import { useProviderStore } from "../store/providerStore";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
const HEALTH_URL = API_BASE_URL.endsWith("/api") ? `${API_BASE_URL.slice(0, -4)}/health` : "/health";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code = "request_failed") { super(message); }
}

interface ErrorPayload { error?: { code?: string; message?: string }; }
interface ArchitectureResponse { architecture: string; }
interface DiagramResponse { diagram: string; architecture: string; }
interface MCQResponse { mcq: string; }
interface NoteSuggestionResponse { suggestion: string; }
export interface HealthResponse { status: string; provider: string; model: string; configured: boolean; }
export interface ProjectRequest { prompt: string; appType: string; features: string[]; userCount: string; notes: string[]; }

function projectRequest(project: ProjectInput, notes: string[]): ProjectRequest {
  return { prompt: project.prompt, appType: project.appType, features: project.features, userCount: project.userCount, notes };
}

async function parseError(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => ({})) as ErrorPayload;
  return new ApiError(payload.error?.message || `Request failed with status ${response.status}`, response.status, payload.error?.code);
}

export async function request<T>(path: string, options: RequestInit & { signal?: AbortSignal } = {}): Promise<T> {
  const selected = useProviderStore.getState().selected;
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (selected && /^\/(architecture|design|diagram|mcq|notes\/suggestion)(\/|$)/.test(path)) headers.set("X-AI-Provider", selected);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) throw await parseError(response);
  return response.json() as Promise<T>;
}

export const api = {
  health: async (signal?: AbortSignal): Promise<HealthResponse> => {
    const response = await fetch(HEALTH_URL, { signal });
    if (!response.ok) throw await parseError(response);
    return response.json() as Promise<HealthResponse>;
  },

  architecture: (project: ProjectInput, notes: string[], signal?: AbortSignal) =>
    request<ArchitectureResponse>("/architecture", { method: "POST", body: JSON.stringify(projectRequest(project, notes)), signal }),

  architectureStream: async (
    project: ProjectInput,
    notes: string[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ) => {
    const response = await fetch(`${API_BASE_URL}/architecture/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(useProviderStore.getState().selected ? { "X-AI-Provider": useProviderStore.getState().selected } : {}) },
      body: JSON.stringify(projectRequest(project, notes)),
      signal,
    });
    if (!response.ok) throw await parseError(response);
    if (!response.body) throw new ApiError("Streaming is unavailable in this browser", 500);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      result += chunk;
      onChunk(chunk);
    }
    return result;
  },

  diagram: (project: ProjectInput, notes: string[], architecture?: string, signal?: AbortSignal) =>
    request<DiagramResponse>("/diagram", { method: "POST", body: JSON.stringify({ ...projectRequest(project, notes), architecture: architecture || undefined }), signal }),

  mcq: (project: ProjectInput, notes: string[], signal?: AbortSignal) =>
    request<MCQResponse>("/mcq", { method: "POST", body: JSON.stringify({ ...projectRequest(project, notes), category: project.category }), signal }),

  noteSuggestion: (input: { existingNotes: string; title: string; content: string }, signal?: AbortSignal) =>
    request<NoteSuggestionResponse>("/notes/suggestion", { method: "POST", body: JSON.stringify(input), signal }),
};
