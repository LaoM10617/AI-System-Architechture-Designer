import { create } from "zustand";
import { createContext, useContext } from "react";

interface RequestState {
  pending: number;
  controller: AbortController | null;
  begin: () => AbortSignal;
  finish: (signal: AbortSignal) => void;
  cancel: () => void;
}

export const createRequestStore = () => create<RequestState>((set, get) => ({
  pending: 0,
  controller: null,
  begin: () => {
    get().controller?.abort();
    const controller = new AbortController();
    set({ pending: 1, controller });
    return controller.signal;
  },
  finish: (signal) => {
    // An aborted old request may settle after a replacement has started.
    if (get().controller?.signal === signal) set({ pending: 0, controller: null });
  },
  cancel: () => {
    get().controller?.abort();
    set({ pending: 0, controller: null });
  },
}));

export const RequestContext = createContext<ReturnType<typeof createRequestStore> | null>(null);
export function useRequestStore<T>(selector: (state: RequestState) => T): T {
  const store = useContext(RequestContext);
  if (!store) throw new Error("Requests require a project container");
  return store(selector);
}
