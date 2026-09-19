import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useWorkspaceStore } from "../store/workspaceStore";
import type { Note } from "../types/domain";
import { MermaidViewer } from "./MermaidViewer";
import { WorkspaceBins } from "./WorkspaceBins";

interface NoteProps {
  note: Note;
  onSuggest: (note: Note) => void;
}

function NoteCard({ note, onSuggest }: NoteProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const updateNote = useWorkspaceStore((state) => state.updateNote);
  const setDecisionStatus = useWorkspaceStore((state) => state.setDecisionStatus);
  const confirmed = note.decisionStatus === "confirmed";
  const stamp = (compact = false) => <button
    className={`decision-stamp${confirmed ? " confirmed" : ""}${compact ? " compact" : ""}`}
    aria-label={confirmed ? "Revoke confirmed decision" : "Confirm decision"}
    aria-pressed={confirmed}
    title={confirmed ? "Included in overall generation. Click to return to draft." : "Draft: excluded from overall generation. Click to confirm."}
    onClick={() => setDecisionStatus(note.id, confirmed ? "draft" : "confirmed")}
  >{compact ? (confirmed ? "✓" : "○") : (confirmed ? "✓ Confirmed decision" : "○ Draft · Confirm decision")}</button>;
  const moveToTrash = useWorkspaceStore((state) => state.moveToTrash);
  const toggleFavorite = useWorkspaceStore((state) => state.toggleFavorite);
  const updateDiagram = useWorkspaceStore((state) => state.updateDiagram);
  const favorites = useWorkspaceStore((state) => state.favorites);
  const diagrams = useWorkspaceStore((state) => state.diagrams);
  const favoriteTarget = note.diagramId ?? note.id;
  const isFavorite = favorites.some((item) => item.targetId === favoriteTarget);
  const diagram = note.diagramId ? diagrams.find((item) => item.id === note.diagramId) : undefined;

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button,input,textarea,label,.resize-handle")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = { x: event.clientX, y: event.clientY };
    const position = note.position;
    const move = (moveEvent: PointerEvent) => updateNote(note.id, {
      position: {
        x: Math.max(0, position.x + moveEvent.clientX - pointer.x),
        y: Math.max(0, position.y + moveEvent.clientY - pointer.y),
      },
    });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = note.size;
    const move = (moveEvent: PointerEvent) => updateNote(note.id, {
      size: {
        width: Math.max(220, startSize.width + moveEvent.clientX - startX),
        height: Math.max(150, startSize.height + moveEvent.clientY - startY),
      },
    });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  return (
    <article
      className={`note note-${note.kind}${note.minimized ? " note-minimized" : ""}`}
      data-target-id={favoriteTarget}
      style={{ left: note.position.x, top: note.position.y, width: note.size.width, height: note.minimized ? 46 : note.size.height }}
    >
      <header className="note-header" onPointerDown={startDrag}>
        {editingTitle ? (
          <input
            autoFocus
            aria-label="Note title"
            value={note.title}
            onChange={(event) => updateNote(note.id, { title: event.target.value })}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(event) => { if (event.key === "Enter") setEditingTitle(false); }}
          />
        ) : <button className="note-title" title="Edit title" onClick={() => setEditingTitle(true)}>{note.title || "Untitled note"}</button>}
        <div className="note-actions">
          {note.minimized && stamp(true)}
          {note.kind === "user" ? <button title="AI suggestion" onClick={() => onSuggest(note)}>✦</button> : null}
          <button title={note.minimized ? "Expand note" : "Minimize note"} onClick={() => updateNote(note.id, { minimized: !note.minimized })}>{note.minimized ? "□" : "−"}</button>
          <button title="Favorite" className={isFavorite ? "active" : ""} onClick={() => toggleFavorite(note.id)}>★</button>
          <button title="Move to trash" onClick={() => moveToTrash(note.id)}>×</button>
        </div>
      </header>

      {!note.minimized && (note.kind === "diagram" && diagram ? <MermaidViewer code={diagram.code} onChange={(code) => updateDiagram(diagram.id, code)} /> : note.kind === "mcq" && note.mcq ? (
        <div className="note-content mcq-content">
          <strong>{note.mcq.question}</strong>
          {note.mcq.options.map((option) => (
            <label key={option.key}>
              <input
                type="radio"
                name={`mcq-${note.id}`}
                checked={note.mcq?.selected === option.key}
                onChange={() => updateNote(note.id, { mcq: { ...note.mcq!, selected: option.key } })}
              />
              <span>{option.key}. {option.label}</span>
            </label>
          ))}
        </div>
      ) : (
        <textarea
          className="note-content note-editor"
          value={note.content}
          onChange={(event) => updateNote(note.id, { content: event.target.value })}
        />
      ))}
      {!note.minimized && <footer className="note-decision">{stamp()}</footer>}
      {!note.minimized && <button className="resize-handle" aria-label={`Resize ${note.title}`} onPointerDown={startResize} />}
    </article>
  );
}

export function Whiteboard({ onSuggest }: { onSuggest: (note: Note) => void }) {
  const notes = useWorkspaceStore((state) => state.notes);
  const favorites = useWorkspaceStore((state) => state.favorites);
  return (
    <section className="workspace-shell">
      <div className="whiteboard" aria-label="Architecture whiteboard">
        <div className="grid-lines" />
        {notes.filter((note) => !favorites.some((item) => item.targetId === (note.diagramId ?? note.id))).map((note) => <NoteCard note={note} onSuggest={onSuggest} key={note.id} />)}
      </div>
      <WorkspaceBins />
    </section>
  );
}
