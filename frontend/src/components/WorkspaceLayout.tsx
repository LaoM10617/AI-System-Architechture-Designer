import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, PointerEvent } from "react";
import { useLayoutStore } from "../store/layoutStore";

export function WorkspaceLayout({ controls, children, preview }: { controls: ReactNode; children: ReactNode; preview: ReactNode }) {
  const layout = useLayoutStore();
  const root = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(window.innerWidth - 32);
  const drag = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (root.current) observer.observe(root.current);
    const media = window.matchMedia("(max-width: 1000px)");
    const adapt = () => {
      if (media.matches) useLayoutStore.setState({ leftCollapsed: true, rightCollapsed: true });
    };
    adapt();
    media.addEventListener("change", adapt);
    return () => { observer.disconnect(); media.removeEventListener("change", adapt); };
  }, []);
  const available = Math.max(520, width - 340 - 20);
  const leftRequested = layout.leftCollapsed ? 44 : layout.leftWidth;
  const rightRequested = layout.rightCollapsed ? 44 : layout.rightWidth;
  const excess = Math.max(0, leftRequested + rightRequested - available);
  const left = layout.leftCollapsed ? 44 : Math.max(260, leftRequested - excess * (layout.rightCollapsed ? 1 : .5));
  const right = layout.rightCollapsed ? 44 : Math.max(260, Math.min(rightRequested, available - left));

  const separator = (side: "left" | "right", value: number, collapsed: boolean) => (
    <div className={`panel-separator${collapsed ? " disabled" : ""}`} role="separator" aria-label={`Resize ${side} panel`}
      aria-orientation="vertical" aria-valuenow={Math.round(value)} aria-valuemin={260} aria-valuemax={680} tabIndex={collapsed ? -1 : 0}
      onKeyDown={(event) => {
        if (!collapsed && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? 20 : -20;
          layout.resize(side, value + (side === "left" ? delta : -delta));
        }
      }}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (collapsed) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width: value };
      }}
      onPointerMove={(event) => {
        if (drag.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
          const other = side === "left" ? right : left;
          const desired = drag.current.width + (event.clientX - drag.current.x) * (side === "left" ? 1 : -1);
          layout.resize(side, Math.min(desired, width - other - 360));
        }
      }}
      onPointerUp={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} />
  );
  return <main ref={root} className="main-content three-column" style={{ "--left-width": `${left}px`, "--right-width": `${right}px` } as CSSProperties}>
    <div className={`side-panel left-panel${layout.leftCollapsed ? " collapsed" : ""}`}>
      <button className="panel-toggle" aria-label={layout.leftCollapsed ? "Expand project panel" : "Collapse project panel"} aria-expanded={!layout.leftCollapsed} onClick={() => layout.toggle("left")}>{layout.leftCollapsed ? "› Project" : "‹ Collapse project"}</button>
      <div className="panel-content" hidden={layout.leftCollapsed}>{controls}</div>
    </div>
    {separator("left", left, layout.leftCollapsed)}
    {children}
    {separator("right", right, layout.rightCollapsed)}
    <div className={`side-panel right-panel${layout.rightCollapsed ? " collapsed" : ""}`}>
      <button className="panel-toggle" aria-label={layout.rightCollapsed ? "Expand solution panel" : "Collapse solution panel"} aria-expanded={!layout.rightCollapsed} onClick={() => layout.toggle("right")}>{layout.rightCollapsed ? "‹ Solution" : "Collapse solution ›"}</button>
      <div className="panel-content" hidden={layout.rightCollapsed}>{preview}</div>
    </div>
  </main>;
}
