import { expect, test } from "./fixtures";

test("domain migration, decision basis, and isolated rollback", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
  const result = await page.evaluate(async () => {
    const storePath = "/src/store/workspaceStore.ts";
    const helpersPath = "/src/store/overallResult.ts";
    const { useWorkspaceStore: store } = await import(/* @vite-ignore */ storePath);
    const { generationBasis, isResultStale, migrateWorkspace } = await import(/* @vite-ignore */ helpersPath);
    const s = () => store.getState();
    const initialBasis = generationBasis(s());
    const id = s().addNote({ title: "Database", content: "PostgreSQL" });
    s().setDecisionStatus(id, "confirmed");
    const basis = generationBasis(s());
    s().commitOverall({ architecture: "A", diagram: "graph TD; A-->B", basis });
    const first = s().overall;
    s().toggleFavorite(id);
    const favoriteChangesBasis = isResultStale(first, generationBasis(s()));
    s().moveToTrash(id);
    const trashChangesBasis = isResultStale(first, generationBasis(s()));
    s().restoreFromTrash(s().trash[0].id);
    s().updateNote(id, { content: "MongoDB" });
    const editedIsStale = isResultStale(first, generationBasis(s()));
    s().commitOverall({ architecture: "B", diagram: "", basis: generationBasis(s()) });
    const inputsBefore = JSON.stringify({ notes: s().notes, project: s().project, trash: s().trash, favorites: s().favorites });
    s().restoreResult(first.id);
    const rollback = {
      architecture: s().overall.architecture,
      version: s().overall.version,
      stale: isResultStale(s().overall, generationBasis(s())),
      inputsUnchanged: inputsBefore === JSON.stringify({ notes: s().notes, project: s().project, trash: s().trash, favorites: s().favorites }),
    };
    const legacyNote = { ...s().notes[0], id: "old-result", kind: "architecture", content: "Legacy architecture" };
    const legacy = { ...s(), notes: [legacyNote], overall: undefined, resultHistory: undefined };
    const migrated = migrateWorkspace(legacy);
    return {
      initialDecisions: initialBasis.decisions.length,
      confirmedDecisions: basis.decisions.length,
      favoriteChangesBasis, trashChangesBasis, editedIsStale, rollback,
      migration: { content: migrated.overall.architecture, basis: migrated.overall.basis, notePreserved: migrated.legacyArchive[0].note.content === legacyNote.content },
    };
  });
  expect(result).toEqual({
    initialDecisions: 0, confirmedDecisions: 1,
    favoriteChangesBasis: false, trashChangesBasis: true, editedIsStale: true,
    rollback: { architecture: "A", version: 3, stale: true, inputsUnchanged: true },
    migration: { content: "Legacy architecture", basis: null, notePreserved: true },
  });
  await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
  await page.reload();
  await expect(page.locator(".overall-preview h2")).toContainText("v3");
  await expect(page.locator(".overall-architecture")).toHaveText("A");
});
