import { useState } from "react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useLayoutStore } from "../store/layoutStore";

export function WorkspaceBins() {
  const [open, setOpen] = useState<"favorites" | "trash" | null>(null);
  const favorites = useWorkspaceStore((state) => state.favorites);
  const notes = useWorkspaceStore((state) => state.notes);
  const archive = useWorkspaceStore((state) => state.legacyArchive);
  const restoreResult = useWorkspaceStore((state) => state.restoreResult);
  const toggleFavorite = useWorkspaceStore((state) => state.toggleFavorite);
  const trash = useWorkspaceStore((state) => state.trash);
  const restore = useWorkspaceStore((state) => state.restoreFromTrash);
  const deleteForever = useWorkspaceStore((state) => state.deleteForever);
  const clearTrash = useWorkspaceStore((state) => state.clearTrash);

  return (
    <div className="workspace-bins" aria-label="Workspace collections">
      <button onClick={() => setOpen(open === "favorites" ? null : "favorites")}>☆ Favorites <b>{favorites.length}</b></button>
      <button onClick={() => setOpen(open === "trash" ? null : "trash")}>♲ Trash <b>{trash.length}</b></button>
      {open ? (
        <aside className="bin-popover">
          <header>
            <strong>{open === "favorites" ? "Favorites" : "Trash"}</strong>
            <button onClick={() => setOpen(null)}>×</button>
          </header>
          {open === "favorites" ? (
            favorites.length ? favorites.map((item) => {
              const archived = archive.find((entry) => entry.targetId === item.targetId || entry.note?.id === item.targetId);
              const note = notes.find((note) => (note.diagramId ?? note.id) === item.targetId);
              return (
              <div className="bin-row trash-row" key={item.id}>
                <span>{notes.find((note) => (note.diagramId ?? note.id) === item.targetId)?.title ?? item.title}</span>
                <button disabled={!note && !archived} onClick={() => {
                  if (archived) {
                    restoreResult(archived.id);
                    useLayoutStore.getState().showResult(archived.result.diagram ? "diagram" : "architecture");
                    setOpen(null);
                  } else if (note) toggleFavorite(note.id);
                }}>{archived ? "Open result" : note ? "Restore" : "Source unavailable"}</button>
              </div>
            ); }) : <p>Nothing saved yet.</p>
          ) : (
            <>
              {trash.length ? trash.map((item) => (
                <div className="bin-row trash-row" key={item.id}>
                  <span>{item.note.title}</span>
                  <button onClick={() => restore(item.id)}>Restore</button>
                  <button className="danger" onClick={() => deleteForever(item.id)}>Delete</button>
                </div>
              )) : <p>Trash is empty.</p>}
              {trash.length ? <button className="clear-trash" onClick={clearTrash}>Clear all permanently</button> : null}
            </>
          )}
        </aside>
      ) : null}
    </div>
  );
}
