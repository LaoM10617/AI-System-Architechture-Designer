import { create } from "zustand";
import { persist } from "zustand/middleware";

type Side = "left" | "right";
interface LayoutState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  tab: "architecture" | "diagram";
  resize: (side: Side, width: number) => void;
  toggle: (side: Side) => void;
  showResult: (tab: "architecture" | "diagram") => void;
  setTab: (tab: "architecture" | "diagram") => void;
}
const narrow = () => window.matchMedia("(max-width: 1000px)").matches;
export const useLayoutStore = create<LayoutState>()(persist((set) => ({
  leftWidth: 300, rightWidth: 380,
  leftCollapsed: false, rightCollapsed: false, tab: "architecture",
  resize: (side, width) => set({ [side === "left" ? "leftWidth" : "rightWidth"]: Math.max(260, Math.min(680, width)) }),
  toggle: (side) => set((state) => {
    const key = side === "left" ? "leftCollapsed" : "rightCollapsed";
    return { [key]: !state[key], ...(narrow() ? { [side === "left" ? "rightCollapsed" : "leftCollapsed"]: true } : {}) };
  }),
  showResult: (tab) => set({ tab, rightCollapsed: false, ...(narrow() ? { leftCollapsed: true } : {}) }),
  setTab: (tab) => set({ tab }),
}), { name: "ai-architecture-designer-layout", version: 1 }));
