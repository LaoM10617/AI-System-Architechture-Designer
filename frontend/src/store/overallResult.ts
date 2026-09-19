import type { GenerationBasis, LegacyResult, Note, OverallResult, Workspace } from "../types/domain";

export const HISTORY_LIMIT = 10;

export function generationBasis(workspace: Pick<Workspace, "project" | "notes">): GenerationBasis {
  const { prompt, appType, userCount, features } = workspace.project;
  return {
    project: { prompt, appType, userCount, features: [...features] },
    // Favorited notes remain in notes. Trashed notes do not.
    decisions: workspace.notes.filter((note) => note.decisionStatus === "confirmed")
      .map((note) => ({ id: note.id, title: note.title, content: note.mcq
        ? `${note.mcq.question}\n${note.mcq.options.map((option) => `${option.key}. ${option.label}`).join("\n")}\nSelected: ${note.mcq.selected ?? "None"}`
        : note.content })),
  };
}

export function basisKey(basis: GenerationBasis): string {
  return JSON.stringify({
    project: { prompt: basis.project.prompt, appType: basis.project.appType, userCount: basis.project.userCount, features: [...basis.project.features].sort() },
    decisions: [...basis.decisions].sort((a, b) => a.id.localeCompare(b.id)).map(({ id, title, content }) => ({ id, title, content })),
  });
}

export function isResultStale(result: OverallResult | null, basis: GenerationBasis): boolean {
  return !!result && (!result.basis || basisKey(result.basis) !== basisKey(basis));
}

export function migrateWorkspace(value: unknown): Workspace {
  const old = value as Workspace;
  const draftDefault = (note: Note): Note => ({ ...note, decisionStatus: note.decisionStatus ?? "draft" });
  const notes = (old.notes ?? []).map(draftDefault);
  const trash = (old.trash ?? []).map((item) => ({ ...item, note: draftDefault(item.note) }));
  const diagrams = old.diagrams ?? [];
  const legacyArchive: LegacyResult[] = [...(old.legacyArchive ?? [])];
  const add = (entry: LegacyResult) => {
    if (!legacyArchive.some((item) => item.id === entry.id)) legacyArchive.push(entry);
  };
  for (const note of notes) {
    if (note.kind !== "architecture" && note.kind !== "diagram") continue;
    const diagram = diagrams.find((item) => item.id === note.diagramId);
    const id = `legacy-${note.id}`;
    add({ id, title: note.title, targetId: note.diagramId ?? note.id, note,
      result: { id, version: 1, createdAt: note.createdAt,
        architecture: note.kind === "architecture" ? note.content : diagram?.architecture ?? "",
        diagram: note.kind === "diagram" ? diagram?.code ?? note.content : "",
        basis: null, source: "legacy" },
    });
  }
  // Retain diagram records without notes, but never resurrect trashed diagrams.
  const referenced = new Set([...notes, ...trash.map((item) => item.note)].map((note) => note.diagramId));
  for (const diagram of diagrams) {
    if (referenced.has(diagram.id) || legacyArchive.some((item) => item.targetId === diagram.id)) continue;
    const id = `legacy-diagram-${diagram.id}`;
    add({ id, title: diagram.title, targetId: diagram.id,
      result: { id, version: 1, createdAt: diagram.createdAt, architecture: diagram.architecture,
        diagram: diagram.code, basis: null, source: "legacy" },
    });
  }
  const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
  legacyArchive.sort((a, b) => timestamp(b.result.createdAt) - timestamp(a.result.createdAt));
  // Preserve an existing independent solution, except the automatic legacy import
  // from v2 which chose by array position instead of creation time.
  const overall = old.overall && !(old.overall.source === "legacy" && old.overall.version === 1 && old.overall.id.startsWith("legacy-")) ? old.overall
    : legacyArchive[0]?.result ?? old.overall ?? null;
  return { ...old, notes: notes.filter((note) => note.kind !== "architecture" && note.kind !== "diagram"),
    diagrams, favorites: old.favorites ?? [], trash, overall,
    resultHistory: old.resultHistory ?? [], legacyArchive };
}
