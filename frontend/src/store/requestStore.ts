import { create } from "zustand";

interface RequestState {
  pending: number;
  controller: AbortController | null;
  begin: () => AbortSignal;
  finish: () => void;
  cancel: () => void;
}

export const useRequestStore = create<RequestState>((set, get) => ({
  pending: 0,
  controller: null,
  begin: () => {
    get().controller?.abort();
    const controller = new AbortController();
    set((state) => ({ pending: state.pending + 1, controller }));
    return controller.signal;
  },
  finish: () =>
    set((state) => ({
      pending: Math.max(0, state.pending - 1),
      controller: state.pending <= 1 ? null : state.controller,
    })),
  cancel: () => {
    get().controller?.abort();
    set({ pending: 0, controller: null });
  },
}));
