import { useState } from "react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { generationBasis, isResultStale } from "../store/overallResult";
import { MermaidViewer } from "./MermaidViewer";
import { useLayoutStore } from "../store/layoutStore";
import { GenerationInputs } from "./GenerationInputs";

export function OverallPreview({ streaming }: { streaming: string | null }) {
  const state = useWorkspaceStore();
  const result = state.overall;
  const basis = generationBasis(state);
  const stale = isResultStale(result, basis);
  const tab = useLayoutStore((state) => state.tab);
  const setTab = useLayoutStore((state) => state.setTab);
  const [editing, setEditing] = useState<{ id: string; code: string } | null>(null);
  const [architectureEdit, setArchitectureEdit] = useState<{ id: string; text: string } | null>(null);
  const editedCode = editing?.id === result?.id ? editing?.code : undefined;
  return (
    <section className="overall-preview" aria-label="Overall solution">
      <h2>Overall solution {result ? `· v${result.version}` : ""}</h2>
      <div className="preview-tabs" role="tablist" aria-label="Solution preview">
        <button role="tab" id="architecture-tab" aria-controls="architecture-panel" aria-selected={tab === "architecture"} onClick={() => setTab("architecture")}>Architecture</button>
        <button role="tab" id="diagram-tab" aria-controls="diagram-panel" aria-selected={tab === "diagram"} onClick={() => setTab("diagram")}>Diagram</button>
      </div>
      {result && <p role="status" className={`result-freshness ${stale ? "stale" : "current"}`}>
        {stale ? (result.basis ? "Out of date: confirmed decisions or project inputs changed. Generate again to update; the old architecture will not be reused." : "Original inputs are unknown. Generate again before reusing this architecture.") : "Up to date: this solution matches the current generation inputs."}
      </p>}
      <GenerationInputs basis={basis} label="Next generation inputs" />
      {result?.basis && <GenerationInputs basis={result.basis} label={`Inputs used for v${result.version}`} />}
      <p className="basis-help">Confirmed notes in Favorites are included. Draft and trashed notes are excluded.</p>
      {streaming !== null && <p role="status">Generating architecture… Previous results remain saved.</p>}
      <div role="tabpanel" id="architecture-panel" aria-labelledby="architecture-tab" hidden={tab !== "architecture"}>
      {result && streaming === null && <button onClick={() => setArchitectureEdit({ id: result.id, text: result.architecture })}>Edit architecture</button>}
      {architectureEdit?.id === result?.id && architectureEdit && streaming === null ? <>
        <textarea className="architecture-editor" aria-label="Architecture source" value={architectureEdit.text} onChange={(event) => setArchitectureEdit({ ...architectureEdit, text: event.target.value })} />
        <p>Saving creates a new version. Regenerate the diagram after changing the architecture.</p>
        <button onClick={() => {
          if (result && architectureEdit.text !== result.architecture) state.commitOverall({ ...result, architecture: architectureEdit.text, diagram: "", source: "edited" });
          setArchitectureEdit(null);
        }}>Save architecture changes</button>
        <button onClick={() => setArchitectureEdit(null)}>Cancel editing</button>
      </> :
      <pre className="overall-architecture">{streaming ?? result?.architecture ?? "Generate an architecture to get started."}</pre>
      }
      </div>
      <div role="tabpanel" id="diagram-panel" aria-labelledby="diagram-tab" hidden={tab !== "diagram"}>
      {!result?.diagram && <p>Generate a diagram to preview it here.</p>}
      {result?.diagram && <>
        <MermaidViewer key={result.id} code={editedCode ?? result.diagram} onChange={(code) => setEditing({ id: result.id, code })} />
        {editedCode !== undefined && editedCode !== result.diagram && <button onClick={() => {
          state.commitOverall({ ...result, diagram: editedCode, source: "edited" });
          setEditing(null);
        }}>Save diagram changes</button>}
      </>}
      </div>
      {state.resultHistory.length > 0 && <details>
        <summary>Previous versions ({state.resultHistory.length})</summary>
        {state.resultHistory.map((item) => <p key={item.id}>
          v{item.version} · {new Date(item.createdAt).toLocaleString()} {item.source === "legacy" ? "· Imported" : ""}{" "}
          <button onClick={() => state.restoreResult(item.id)}>Restore v{item.version}</button>
        </p>)}
      </details>}
      {state.legacyArchive.length > 0 && <details className="legacy-archive">
        <summary>Imported history ({state.legacyArchive.length})</summary>
        <p>Original results are retained here, separately from the last 10 versions. Their original generation inputs are unknown.</p>
        {state.legacyArchive.map((item) => <p key={item.id}>
          <strong>{item.title || "Untitled result"}</strong> · {new Date(item.result.createdAt).toLocaleString()}{" "}
          <button onClick={() => { state.restoreResult(item.id); setTab(item.result.diagram ? "diagram" : "architecture"); }}>Open result</button>
        </p>)}
      </details>}
    </section>
  );
}
