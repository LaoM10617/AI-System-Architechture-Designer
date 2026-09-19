import type { GenerationBasis } from "../types/domain";

export function GenerationInputs({ basis, label }: { basis: GenerationBasis; label: string }) {
  return <details className="generation-inputs">
    <summary>{label} · {basis.decisions.length} confirmed decisions</summary>
    <p><strong>{basis.project.appType}</strong> · {basis.project.userCount}</p>
    <p>Features: {basis.project.features.join(", ") || "None selected"}</p>
    <p className="basis-description">{basis.project.prompt || "No project description"}</p>
    {basis.decisions.length ? <ul>{basis.decisions.map((note) => <li key={note.id}>
      <strong>{note.title || "Untitled note"}</strong><p className="basis-description">{note.content}</p>
    </li>)}</ul> : <p>Only project settings and description will be used. Draft notes are excluded.</p>}
  </details>;
}
