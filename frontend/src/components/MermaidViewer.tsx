import { useEffect, useId, useState } from "react";

const mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
  return mermaid;
});

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

  useEffect(() => {
    let active = true;
    mermaidPromise
      .then((mermaid) => mermaid.render(`diagram-${reactId}-${Date.now()}`, code))
      .then(({ svg: rendered }) => {
        if (active) { setSvg(rendered); setError(""); }
      })
      .catch((reason: unknown) => {
        if (active) { setError(reason instanceof Error ? reason.message : "Invalid Mermaid diagram"); setShowCode(true); }
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
      {error ? <div className="diagram-error">Mermaid could not render this code. Edit the source below to repair it.</div> : null}
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
