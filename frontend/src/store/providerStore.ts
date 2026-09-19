import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ProviderOption { id: string; model: string; configured: boolean }
type Outcome = "idle" | "running" | "success" | "failed" | "cancelled";
export const useProviderStore = create<{
  selected: string;
  options: ProviderOption[];
  outcomes: Record<string, Outcome>;
  choose: (id: string) => void;
  report: (id: string, status: Outcome) => void;
}>()(persist((set) => ({
  selected: "", options: [], outcomes: {},
  choose: (selected) => set({ selected }),
  report: (id, status) => set((state) => ({ outcomes: { ...state.outcomes, [id]: status } })),
}), { name: "ai-architecture-designer-provider", partialize: ({ selected }) => ({ selected }) }));
