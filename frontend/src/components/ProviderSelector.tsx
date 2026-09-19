import { useEffect, useState } from "react";
import { request } from "../api/client";
import { useProviderStore } from "../store/providerStore";
import type { ProviderOption } from "../store/providerStore";
import { useRequestStore } from "../store/requestStore";

export function ProviderSelector() {
  const { selected, options, outcomes, choose } = useProviderStore();
  const pending = useRequestStore((state) => state.pending);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    request<{ default: string; providers: ProviderOption[] }>("/providers", { signal: controller.signal }).then((result) => {
      const previous = useProviderStore.getState().selected;
      useProviderStore.setState({ options: result.providers, selected: result.providers.some((item) => item.id === previous) ? previous : result.default });
      setFailed(false);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt]);
  const current = options.find((item) => item.id === selected);
  const labels = { idle: "Not tested this session", running: "Request in progress…", success: "Last request succeeded", failed: "Last request failed — retry or switch provider", cancelled: "Last request cancelled" };
  return <section className="control-group provider-selector">
    <h2>AI service</h2>
    <label htmlFor="ai-provider">Provider</label>
    <select id="ai-provider" value={selected} disabled={pending > 0 || !options.length} onChange={(event) => choose(event.target.value)}>
      {!options.length && <option value="">Loading…</option>}
      {options.map((item) => <option key={item.id} value={item.id} disabled={!item.configured}>
        {item.id === "groq" ? "Groq · Backup" : item.id === "gemini" ? "Gemini · Primary" : item.id}{!item.configured ? " · Not configured" : ""}
      </option>)}
    </select>
    {current && <div className="provider-status" role="status">
      <div>{current.model}</div>
      <div>{current.configured ? "Key configured" : "Key not configured"} · {labels[outcomes[selected] ?? "idle"]}</div>
    </div>}
    {failed && <p>Could not load AI services. <button onClick={() => setAttempt((value) => value + 1)}>Retry service list</button></p>}
    <small>Switching applies to the next request. Keys remain on the backend.</small>
  </section>;
}
