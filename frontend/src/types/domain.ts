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
}
