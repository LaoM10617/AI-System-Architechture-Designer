import { useRequestStore } from "../store/requestStore";

export function GlobalLoading() {
  const pending = useRequestStore((state) => state.pending);
  const cancel = useRequestStore((state) => state.cancel);
  if (!pending) return null;

  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-card">
        <span className="spinner" />
        <span>Generating with AI…</span>
        <button onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
}
