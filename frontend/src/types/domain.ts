export type NoteKind = "user" | "architecture" | "mcq" | "diagram";

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface MCQOption {
  key: string;
  label: string;
}

export interface MCQData {
  question: string;
  options: MCQOption[];
  selected?: string;
}

export interface Note {
  id: string;
  kind: NoteKind;
  title: string;
  content: string;
  position: Position;
  size: Size;
  createdAt: string;
  diagramId?: string;
  mcq?: MCQData;
  minimized?: boolean;
  decisionStatus?: "draft" | "confirmed";
}

export interface Diagram {
  id: string;
  title: string;
  code: string;
  architecture: string;
  createdAt: string;
}

export interface Favorite {
  id: string;
  targetId: string;
  targetType: "note" | "diagram";
  title: string;
  createdAt: string;
}

export interface TrashItem {
  id: string;
  note: Note;
  deletedAt: string;
}

export interface ProjectInput {
  appType: string;
  userCount: string;
  features: string[];
  prompt: string;
  category: string;
}

export interface Workspace {
  project: ProjectInput;
  notes: Note[];
  diagrams: Diagram[];
  favorites: Favorite[];
  trash: TrashItem[];
  overall: OverallResult | null;
  resultHistory: OverallResult[];
  legacyArchive: LegacyResult[];
}

export interface LegacyResult {
  id: string;
  title: string;
  targetId: string;
  result: OverallResult;
  // Retain original layout, content, and state even after leaving the whiteboard.
  note?: Note;
}

export interface GenerationBasis {
  project: Omit<ProjectInput, "category">;
  decisions: { id: string; title: string; content: string }[];
}

export interface OverallResult {
  id: string;
  version: number;
  createdAt: string;
  architecture: string;
  diagram: string;
  // Null for imported legacy results: their actual generation inputs are unknown.
  basis: GenerationBasis | null;
  source: "generated" | "edited" | "legacy" | "restored";
}
