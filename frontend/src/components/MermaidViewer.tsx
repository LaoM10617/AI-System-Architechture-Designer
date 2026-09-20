import { useEffect, useId, useState } from "react";
import { mermaidReady, prepareDiagram } from "../api/mermaid";

interface Props {
  code: string;
  onChange: (code: string) => void;
}

export function MermaidViewer({ code, onChange }: Props) {
  const reactId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [repair, setRepair] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSvg(""); setError(""); setRepair(null);
    prepareDiagram(code)
      .then(async (result) => {
        if (!active) return null;
        if (result.error) throw new Error(result.error);
        setRepair(result.repaired ? result.code : null);
        const mermaid = await mermaidReady;
        return mermaid.render(`diagram-${reactId}-${Date.now()}`, result.code);
      })
      .then((result) => {
        if (active && result) { setSvg(result.svg); setError(""); }
      })
      .catch((reason: unknown) => {
        if (active) { setSvg(""); setError(reason instanceof Error ? reason.message : "Invalid Mermaid diagram"); setShowCode(true); }
      });
    return () => { active = false; };
  }, [code, reactId]);

  const download = () => {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "architecture-diagram.svg";
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderCanvas = () => (
    <div className="diagram-body">
      {error ? <div className="diagram-error">Mermaid could not render this code. Edit the source below to repair it.<pre>{error}</pre></div> : null}
      {repair && !error && <div role="status">Preview uses a validated syntax repair. Saved source is unchanged.
        <button onClick={() => onChange(repair)}>Use repaired source</button>
      </div>}
      {showCode ? (
        <textarea className="diagram-code diagram-editor" value={code} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
      ) : (
        <div className="diagram-svg" style={{ transform: `scale(${zoom})` }} dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );

  return (
    <>
      <div className="diagram-toolbar">
        <button onClick={() => setShowCode((value) => !value)}>{showCode ? "Render diagram" : "Edit source"}</button>
        <button onClick={() => setZoom((value) => Math.min(2, value + 0.15))}>＋</button>
        <button onClick={() => setZoom((value) => Math.max(0.5, value - 0.15))}>−</button>
        <button onClick={() => setFullscreen(true)}>Full screen</button>
        <button disabled={!svg} onClick={download}>Download SVG</button>
      </div>
      {renderCanvas()}
      {fullscreen ? (
        <div className="diagram-modal" role="dialog" aria-modal="true">
          <button className="modal-close" onClick={() => setFullscreen(false)}>×</button>
          {renderCanvas()}
        </div>
      ) : null}
    </>
  );
}
