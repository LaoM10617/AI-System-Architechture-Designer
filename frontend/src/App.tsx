import { useEffect, useRef, useState } from "react";
import { api } from "./api/client";
import type { HealthResponse } from "./api/client";
import { ControlPanel } from "./components/ControlPanel";
import { GlobalLoading } from "./components/GlobalLoading";
import { Whiteboard } from "./components/Whiteboard";
import { useRequestStore } from "./store/requestStore";
import { useWorkspaceStore } from "./store/workspaceStore";
import type { MCQData, Note } from "./types/domain";
import { useToast } from "./ui/Toast";
import "./styles.css";

function parseMCQ(value: string): MCQData {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const options = lines.map((line) => line.match(/^([A-D])[.)]\s*(.+)$/i)).filter((match): match is RegExpMatchArray => Boolean(match)).map((match) => ({ key: match[1].toUpperCase(), label: match[2] }));
  const question = lines.find((line) => !/^[A-D][.)]\s*/i.test(line)) ?? "Choose an option";
  return { question, options: options.length ? options : ["A", "B", "C", "D"].map((key) => ({ key, label: key })) };
}

export default function App() {
  const { showToast } = useToast();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const retryRef = useRef<(() => void) | null>(null);
  const project = useWorkspaceStore((state) => state.project);
  const notes = useWorkspaceStore((state) => state.notes);
  const addNote = useWorkspaceStore((state) => state.addNote);
  const updateNote = useWorkspaceStore((state) => state.updateNote);
  const addDiagram = useWorkspaceStore((state) => state.addDiagram);
  const begin = useRequestStore((state) => state.begin);
  const finish = useRequestStore((state) => state.finish);

  useEffect(() => {
    const controller = new AbortController();
    api.health(controller.signal).then((value) => { setHealth(value); setHealthFailed(false); }).catch(() => setHealthFailed(true));
    return () => controller.abort();
  }, []);

  const noteContext = (excludeId?: string) => notes.filter((note) => note.kind === "user" && note.id !== excludeId).map((note) => `${note.title}: ${note.content}`);

  const run = async (action: (signal: AbortSignal) => Promise<void>) => {
    const signal = begin();
    retryRef.current = () => { void run(action); };
    setCanRetry(false);
    try {
      await action(signal);
      retryRef.current = null;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") showToast("Request cancelled");
      else { showToast(error instanceof Error ? error.message : "Request failed", "error"); setCanRetry(true); }
    } finally { finish(); }
  };

  const generateArchitecture = () => run(async (signal) => {
    const noteId = addNote({ kind: "architecture", title: "AI Architecture Proposal", content: "" });
    let content = "";
    await api.architectureStream(project, noteContext(), (chunk) => { content += chunk; updateNote(noteId, { content }); }, signal);
    showToast("Architecture generated", "success");
  });

  const generateDiagram = () => run(async (signal) => {
    const existingArchitecture = [...notes].reverse().find((note) => note.kind === "architecture" && note.content)?.content;
    const result = await api.diagram(project, noteContext(), existingArchitecture, signal);
    const diagramId = addDiagram({ title: "System Diagram", code: result.diagram, architecture: result.architecture });
    addNote({ kind: "diagram", title: "Mermaid Diagram", content: result.diagram, diagramId });
    showToast(existingArchitecture ? "Diagram generated from the existing architecture" : "Architecture and diagram generated in one request", "success");
  });

  const generateMCQ = () => run(async (signal) => {
    const result = await api.mcq(project, noteContext(), signal);
    addNote({ kind: "mcq", title: project.category, content: result.mcq, mcq: parseMCQ(result.mcq) });
    showToast("Question generated", "success");
  });

  const suggestNote = (note: Note) => run(async (signal) => {
    const result = await api.noteSuggestion({ existingNotes: noteContext(note.id).join("\n\n"), title: note.title, content: note.content }, signal);
    updateNote(note.id, { content: note.content ? `${note.content}\n\n${result.suggestion}` : result.suggestion });
    showToast("Suggestion added", "success");
  });

  return (
    <div className="app-container">
      <header className="app-header">
        <div><span className="eyebrow">AI design workspace</span><h1>System Architecture Designer</h1><p>Turn product ideas into an explainable architecture and visual system map.</p></div>
        <span className="react-badge">React rebuild</span>
      </header>
      {healthFailed ? <div className="status-banner status-error">Backend is unavailable. Start it with <code>python run.py</code>.</div> : null}
      {health && !health.configured ? <div className="status-banner status-warning">AI provider is not configured. Add the provider API key to <code>api.env</code>.</div> : null}
      {health?.configured ? <div className="status-banner status-ok">Connected to {health.provider} · {health.model}</div> : null}
      {canRetry ? <div className="retry-banner">The last AI request failed. Your inputs are unchanged.<button onClick={() => retryRef.current?.()}>Retry</button></div> : null}
      <main className="main-content">
        <ControlPanel onArchitecture={generateArchitecture} onDiagram={generateDiagram} onMCQ={generateMCQ} onAddNote={() => addNote()} />
        <Whiteboard onSuggest={suggestNote} />
      </main>
      <GlobalLoading />
    </div>
  );
}
