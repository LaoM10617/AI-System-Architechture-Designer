import { useEffect, useRef, useState } from "react";
import { api } from "./api/client";
import type { HealthResponse } from "./api/client";
import { ControlPanel } from "./components/ControlPanel";
import { GlobalLoading } from "./components/GlobalLoading";
import { Whiteboard } from "./components/Whiteboard";
import { OverallPreview } from "./components/OverallPreview";
import { WorkspaceLayout } from "./components/WorkspaceLayout";
import { useLayoutStore } from "./store/layoutStore";
import { generationBasis, isResultStale } from "./store/overallResult";
import { useRequestStore } from "./store/requestStore";
import { useProviderStore } from "./store/providerStore";
import { useWorkspaceStore, useWorkspaceInstance } from "./store/workspaceStore";
import type { MCQData, Note } from "./types/domain";
import { useToast } from "./ui/Toast";
import "./styles.css";

function parseMCQ(value: string): MCQData {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const options = lines.map((line) => line.match(/^([A-D])[.)]\s*(.+)$/i)).filter((match): match is RegExpMatchArray => Boolean(match)).map((match) => ({ key: match[1].toUpperCase(), label: match[2] }));
  const question = lines.find((line) => !/^[A-D][.)]\s*/i.test(line)) ?? "Choose an option";
  return { question, options: options.length ? options : ["A", "B", "C", "D"].map((key) => ({ key, label: key })) };
}

export default function App({ active = true }: { active?: boolean }) {
  const workspace = useWorkspaceInstance();
  const { showToast } = useToast();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const runSequence = useRef(0);
  const project = useWorkspaceStore((state) => state.project);
  const notes = useWorkspaceStore((state) => state.notes);
  const addNote = useWorkspaceStore((state) => state.addNote);
  const updateNote = useWorkspaceStore((state) => state.updateNote);
  const begin = useRequestStore((state) => state.begin);
  const finish = useRequestStore((state) => state.finish);
  const cancel = useRequestStore((state) => state.cancel);
  // Database recovery can unmount the workspace as well as explicit tab close.
  useEffect(() => () => cancel(), [cancel]);

  useEffect(() => {
    const controller = new AbortController();
    api.health(controller.signal).then((value) => { setHealth(value); setHealthFailed(false); }).catch(() => setHealthFailed(true));
    return () => controller.abort();
  }, []);

  const noteContext = (excludeId?: string) => notes.filter((note) => note.kind === "user" && note.id !== excludeId).map((note) => `${note.title}: ${note.content}`);

  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    const sequence = ++runSequence.current;
    const provider = useProviderStore.getState().selected;
    useProviderStore.getState().report(provider, "running");
    const signal = begin();
    retryRef.current = () => { void run(action); };
    setCanRetry(false);
    try {
      await action(signal);
      if (sequence !== runSequence.current) return;
      useProviderStore.getState().report(provider, "success");
      retryRef.current = null;
    } catch (error) {
      if (sequence !== runSequence.current) return;
      useProviderStore.getState().report(provider, error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failed");
      if (error instanceof DOMException && error.name === "AbortError") showToast("Request cancelled");
      else { showToast(error instanceof Error ? error.message : "Request failed", "error"); setCanRetry(true); }
    } finally { finish(signal); if (sequence === runSequence.current) setStreaming(null); }
  };

  const generateArchitecture = () => run(async (signal) => {
    useLayoutStore.getState().showResult("architecture");
    const state = workspace.getState();
    const basis = generationBasis(state);
    let content = "";
    setStreaming("");
      await api.architectureStream({ ...basis.project, category: state.project.category }, basis.decisions.map((note) => `${note.title}: ${note.content}`), (chunk) => {
        if (!signal.aborted) { content += chunk; setStreaming(content); }
      }, signal);
      signal.throwIfAborted();
      // A new architecture invalidates the previous diagram, even with identical inputs.
      state.commitOverall({ architecture: content, diagram: "", basis });
    showToast("Architecture generated", "success");
  });

  const generateDiagram = () => run(async (signal) => {
    useLayoutStore.getState().showResult("diagram");
    const state = workspace.getState();
    const basis = generationBasis(state);
    const existingArchitecture = !isResultStale(state.overall, basis) ? state.overall?.architecture : undefined;
    const result = await api.diagram({ ...basis.project, category: state.project.category }, basis.decisions.map((note) => `${note.title}: ${note.content}`), existingArchitecture, signal);
    signal.throwIfAborted();
    state.commitOverall({ architecture: result.architecture, diagram: result.diagram, basis });
    showToast(existingArchitecture ? "Diagram generated from the existing architecture" : "Architecture and diagram generated in one request", "success");
  });

  const generateMCQ = () => run(async (signal) => {
    const result = await api.mcq(project, noteContext(), signal);
    signal.throwIfAborted();
    addNote({ kind: "mcq", title: project.category, content: result.mcq, mcq: parseMCQ(result.mcq) });
    showToast("Question generated", "success");
  });

  const suggestNote = (note: Note) => run(async (signal) => {
    const result = await api.noteSuggestion({ existingNotes: noteContext(note.id).join("\n\n"), title: note.title, content: note.content }, signal);
    signal.throwIfAborted();
    updateNote(note.id, { content: note.content ? `${note.content}\n\n${result.suggestion}` : result.suggestion });
    showToast("Suggestion added", "success");
  });

  if (!active) return null;
  return (
    <div className="app-container">
      <header className="app-header">
        <div><span className="eyebrow">AI design workspace</span><h1>System Architecture Designer</h1><p>Turn product ideas into an explainable architecture and visual system map.</p></div>
        <span className="react-badge">React rebuild</span>
      </header>
      {healthFailed ? <div className="status-banner status-error">Backend is unavailable. Start it with <code>python run.py</code>.</div> : null}
      {health && !health.configured ? <div className="status-banner status-warning">AI provider is not configured. Add the provider API key to <code>api.env</code>.</div> : null}
      {health ? <div className="status-banner status-ok">Backend connected · Default provider: {health.provider}</div> : null}
      {canRetry ? <div className="retry-banner">The last AI request failed. Your inputs are unchanged.<button onClick={() => retryRef.current?.()}>Retry</button></div> : null}
      <WorkspaceLayout
        controls={<ControlPanel onArchitecture={generateArchitecture} onDiagram={generateDiagram} onMCQ={generateMCQ} onAddNote={() => addNote()} />}
        preview={<OverallPreview streaming={streaming} />}>
        <Whiteboard onSuggest={suggestNote} />
      </WorkspaceLayout>
      <GlobalLoading />
    </div>
  );
}
