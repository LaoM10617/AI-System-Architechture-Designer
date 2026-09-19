import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Diagram, GenerationBasis, MCQData, Note, OverallResult, ProjectInput, Workspace } from "../types/domain";
import { HISTORY_LIMIT, migrateWorkspace } from "./overallResult";

const now = () => new Date().toISOString();
const makeId = () => crypto.randomUUID();

// Preserve the original serialized data before Zustand applies any migration.
const originalLocalWorkspace = localStorage.getItem("ai-architecture-designer-workspace");
if (originalLocalWorkspace && !localStorage.getItem("ai-architecture-designer-pre-database-backup")) {
  localStorage.setItem("ai-architecture-designer-pre-database-backup", originalLocalWorkspace);
}

type NewNoteInput = Partial<Pick<Note, "kind" | "title" | "content" | "diagramId">> & {
  mcq?: MCQData;
};

const initialNotes: Note[] = [
  {
    id: "game-concept",
    kind: "user",
    title: "Game Concept",
    content: "Multiplayer Tetris with real-time 1v1 and 2v2 battles, global leaderboards, spectator mode, customizable themes, cross-platform play, and skill-based matchmaking.",
    position: { x: 55, y: 70 },
    size: { width: 270, height: 220 },
    createdAt: now(),
  },
  {
    id: "technical-requirements",
    kind: "user",
    title: "Technical Requirements",
    content: "Low latency gameplay (<100ms), 5,000+ concurrent users, real-time synchronization, account statistics, anti-cheat controls, and scalable infrastructure.",
    position: { x: 355, y: 70 },
    size: { width: 270, height: 220 },
    createdAt: now(),
  },
  {
    id: "target-audience",
    kind: "user",
    title: "Target Audience",
    content: "Casual gamers, competitive puzzle players, esports enthusiasts, nostalgia players, social gamers, and cross-platform users.",
    position: { x: 655, y: 70 },
    size: { width: 270, height: 220 },
    createdAt: now(),
  },
];

const initialProject: ProjectInput = {
  appType: "Mobile App",
  userCount: "1,000–10,000 users",
  features: ["Multiplayer Mode", "Real-time Gameplay", "Leaderboards", "User Profiles", "Spectator Mode", "Cross-platform"],
  prompt: "We are building a multiplayer online Tetris game that allows players to compete in real-time. The game should support 1v1 and 2v2 modes, global leaderboards, user profiles, and 5,000+ concurrent users.",
  category: "Project Basics",
};

interface WorkspaceActions {
  setDecisionStatus: (id: string, status: "draft" | "confirmed") => void;
  commitOverall: (result: { architecture: string; diagram: string; basis: GenerationBasis | null; source?: OverallResult["source"] }) => void;
  restoreResult: (id: string) => void;
  updateProject: (patch: Partial<ProjectInput>) => void;
  toggleFeature: (feature: string) => void;
  addNote: (input?: NewNoteInput) => string;
  updateNote: (id: string, patch: Partial<Note>) => void;
  moveToTrash: (id: string) => void;
  restoreFromTrash: (id: string) => void;
  deleteForever: (id: string) => void;
  clearTrash: () => void;
  addDiagram: (diagram: Omit<Diagram, "id" | "createdAt">) => string;
  updateDiagram: (id: string, code: string) => void;
  toggleFavorite: (noteId: string) => void;
}

type WorkspaceStore = Workspace & WorkspaceActions;

export const useWorkspaceStore = create<WorkspaceStore>()(persist((set, get) => ({
  project: initialProject,
  notes: initialNotes.map((note) => ({ ...note, decisionStatus: "draft" })),
  diagrams: [],
  favorites: [],
  trash: [],
  overall: null,
  resultHistory: [],
  legacyArchive: [],

  setDecisionStatus: (id, decisionStatus) => set((state) => ({
    notes: state.notes.map((note) => note.id === id ? { ...note, decisionStatus } : note),
  })),
  commitOverall: (result) => set((state) => ({
    overall: {
      ...structuredClone(result), source: result.source ?? "generated",
      id: makeId(), createdAt: now(),
      version: Math.max(state.overall?.version ?? 0, ...state.resultHistory.map((item) => item.version)) + 1,
    },
    resultHistory: state.overall ? [structuredClone(state.overall), ...state.resultHistory].slice(0, HISTORY_LIMIT) : state.resultHistory,
  })),
  // Rollback switches results only, never project inputs, notes, or collections.
  restoreResult: (id) => {
    const result = get().resultHistory.find((item) => item.id === id) ?? get().legacyArchive.find((item) => item.id === id)?.result;
    if (result) get().commitOverall(result);
  },

  updateProject: (patch) => set((state) => ({ project: { ...state.project, ...patch } })),
  toggleFeature: (feature) => set((state) => ({
    project: {
      ...state.project,
      features: state.project.features.includes(feature)
        ? state.project.features.filter((item) => item !== feature)
        : [...state.project.features, feature],
    },
  })),

  addNote: (input = {}) => {
    const id = makeId();
    const offset = get().notes.length * 31;
    const note: Note = {
      id,
      kind: input.kind ?? "user",
      title: input.title ?? `Note #${get().notes.length + 1}`,
      content: input.content ?? "Double-click to edit this note...",
      position: { x: 75 + (offset % 430), y: 330 + (offset % 240) },
      size: { width: input.kind === "diagram" ? 420 : 290, height: input.kind === "diagram" ? 300 : 210 },
      createdAt: now(),
      diagramId: input.diagramId,
      mcq: input.mcq,
      decisionStatus: "draft",
    };
    set((state) => ({ notes: [...state.notes, note] }));
    return id;
  },

  updateNote: (id, patch) => set((state) => ({
    notes: state.notes.map((note) => note.id === id ? { ...note, ...patch } : note),
  })),

  moveToTrash: (id) => set((state) => {
    const note = state.notes.find((item) => item.id === id);
    if (!note) return state;
    return {
      notes: state.notes.filter((item) => item.id !== id),
      favorites: state.favorites.filter((item) => item.targetId !== id && item.targetId !== note.diagramId),
      trash: [...state.trash, { id: makeId(), note, deletedAt: now() }],
    };
  }),

  restoreFromTrash: (id) => set((state) => {
    const item = state.trash.find((candidate) => candidate.id === id);
    if (!item) return state;
    return {
      notes: [...state.notes, item.note],
      trash: state.trash.filter((candidate) => candidate.id !== id),
    };
  }),

  deleteForever: (id) => set((state) => ({ trash: state.trash.filter((item) => item.id !== id) })),
  clearTrash: () => set({ trash: [] }),

  addDiagram: (input) => {
    const id = makeId();
    set((state) => ({ diagrams: [...state.diagrams, { ...input, id, createdAt: now() }] }));
    return id;
  },

  updateDiagram: (id, code) => set((state) => ({
    diagrams: state.diagrams.map((diagram) => diagram.id === id ? { ...diagram, code } : diagram),
    notes: state.notes.map((note) => note.diagramId === id ? { ...note, content: code } : note),
  })),

  toggleFavorite: (noteId) => set((state) => {
    const note = state.notes.find((item) => item.id === noteId);
    if (!note) return state;
    const targetId = note.diagramId ?? note.id;
    const exists = state.favorites.some((item) => item.targetId === targetId);
    return {
      favorites: exists
        ? state.favorites.filter((item) => item.targetId !== targetId)
        : [...state.favorites, {
            id: makeId(),
            targetId,
            targetType: note.diagramId ? "diagram" : "note",
            title: note.title,
            createdAt: now(),
          }],
    };
  }),
}), {
  name: "ai-architecture-designer-workspace",
  version: 3,
  migrate: migrateWorkspace,
  storage: createJSONStorage(() => localStorage),
  // Persist domain data only; request controllers and transient UI stay in memory.
  partialize: ({ project, notes, diagrams, favorites, trash, overall, resultHistory, legacyArchive }) => ({
    project, notes, diagrams, favorites, trash, overall, resultHistory, legacyArchive,
  }),
}));
