import { useState } from "react";
import { useWorkspaceStore } from "../store/workspaceStore";

export function WorkspaceBins() {
  const [open, setOpen] = useState<"favorites" | "trash" | null>(null);
  const favorites = useWorkspaceStore((state) => state.favorites);
  const trash = useWorkspaceStore((state) => state.trash);
  const restore = useWorkspaceStore((state) => state.restoreFromTrash);
  const deleteForever = useWorkspaceStore((state) => state.deleteForever);
  const clearTrash = useWorkspaceStore((state) => state.clearTrash);

  const focusFavorite = (targetId: string) => {
    const element = document.querySelector<HTMLElement>(`[data-target-id="${targetId}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    element?.classList.add("note-highlight");
    window.setTimeout(() => element?.classList.remove("note-highlight"), 1200);
    setOpen(null);
  };

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
            favorites.length ? favorites.map((item) => (
              <button className="bin-row" key={item.id} onClick={() => focusFavorite(item.targetId)}>{item.title}</button>
            )) : <p>Nothing saved yet.</p>
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
