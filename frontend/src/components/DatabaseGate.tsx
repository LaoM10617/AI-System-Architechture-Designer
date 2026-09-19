import { useEffect } from "react";
import type { ReactNode } from "react";
import { useDatabaseController } from "../store/databaseSync";

export function DatabaseGate({ children, active, onOpen, onImport }: { children: ReactNode; active: boolean; onOpen: (id: string) => void; onImport: () => void }) {
  const controller = useDatabaseController();
  const { phase, message, projects, activeProject, loaded } = controller.store();
  useEffect(() => { void controller.startDatabase(); }, [controller]);
  const blocked = !loaded || ["loading", "choose", "recovery", "conflict"].includes(phase);
  return <>
    {active && <div className={`database-status status-${phase === "error" || phase === "conflict" ? "error" : "ok"}`} role="status">
      {activeProject && <span data-testid="project-identity" title={`Project ID: ${activeProject.id}`}>Project: {activeProject.name} · {activeProject.id.slice(0, 8)}</span>}
      <span>{message}</span>
      {phase === "error" && <button onClick={() => void controller.retryDatabase()}>Retry database</button>}
      {phase === "recovery" && <button onClick={() => void controller.recoverLocal()}>Recover local changes</button>}
      {(phase === "choose" || phase === "conflict" || phase === "recovery") && <>
        <button onClick={onImport}>Save browser workspace as new project</button>
        {(phase === "choose" ? projects : projects.filter((item) => item.id === controller.currentProjectId())).map((item) =>
          <button key={item.id} onClick={() => item.id === controller.currentProjectId() ? void controller.loadProject(item.id) : onOpen(item.id)}>Load database: {item.name}</button>)}
      </>}
    </div>}
    {blocked ? active && <div className="database-wait">The workspace will open after database loading or recovery completes. Existing browser data is retained.</div> : children}
  </>;
}
