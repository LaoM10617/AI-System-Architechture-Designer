import { expect, test } from "./fixtures";

for (const version of [1, 2]) {
  test(`migrates local v${version} data without losing history or favorites`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
    await page.evaluate(async (version) => {
      const path = "/src/store/workspaceStore.ts";
      const { useWorkspaceStore } = await import(/* @vite-ignore */ path);
      const current = useWorkspaceStore.getState();
      const original = current.notes[0];
      const user = { ...original, id: "user", title: "My draft", decisionStatus: undefined };
      const history = Array.from({ length: 12 }, (_, i) => ({ ...original, id: `old-${i}`, kind: "architecture", title: `Old ${i}`, content: `Architecture ${i}`, createdAt: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00Z`, decisionStatus: undefined }));
      const diagram = { id: "diagram-old", title: "Old diagram", code: "graph TD; Old-->Result", architecture: "Paired architecture", createdAt: "2026-08-20T00:00:00Z" };
      const diagramNote = { ...original, id: "diagram-note", kind: "diagram", title: "Saved diagram", diagramId: diagram.id, content: diagram.code, createdAt: diagram.createdAt };
      const trashed = { ...original, id: "trashed", kind: "diagram", diagramId: "deleted-diagram", createdAt: "2026-09-01T00:00:00Z", decisionStatus: undefined };
      const overall = version === 2 ? { id: "current", version: 7, createdAt: "2026-09-01T00:00:00Z", architecture: "Independent current", diagram: "", basis: null, source: "generated" } : undefined;
      localStorage.setItem("ai-architecture-designer-workspace", JSON.stringify({ version, state: {
        project: current.project, notes: [diagramNote, ...history.reverse(), user],
        diagrams: [diagram, { ...diagram, id: "deleted-diagram", createdAt: trashed.createdAt }],
        favorites: [{ id: "fav-result", targetId: diagram.id, targetType: "diagram", title: "Saved diagram", createdAt: diagram.createdAt },
          { id: "fav-user", targetId: user.id, targetType: "note", title: user.title, createdAt: user.createdAt }],
        trash: [{ id: "trash-item", note: trashed, deletedAt: trashed.createdAt }], overall, resultHistory: [],
      } }));
      localStorage.removeItem("ai-architecture-designer-project");
    }, version);
    await page.reload();
    await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
    const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem("ai-architecture-designer-workspace")!));
    expect(migrated.version).toBe(3);
    expect(migrated.state.notes).toHaveLength(1);
    expect(migrated.state.notes[0].decisionStatus).toBe("draft");
    expect(migrated.state.trash[0].note.decisionStatus).toBe("draft");
    expect(migrated.state.legacyArchive).toHaveLength(13);
    expect(migrated.state.legacyArchive[0].result.architecture).toBe("Paired architecture");
    expect(migrated.state.legacyArchive[0].note.position).toEqual({ x: 55, y: 70 });
    expect(migrated.state.favorites).toHaveLength(2);
    expect(migrated.state.overall.architecture).toBe(version === 1 ? "Paired architecture" : "Independent current");
    await page.getByRole("button", { name: /Favorites/ }).click();
    await page.locator(".bin-popover").getByRole("button", { name: "Open result" }).click();
    await expect(page.getByRole("button", { name: "Edit source" })).toBeVisible();
    await page.evaluate(async () => {
      const path = "/src/store/workspaceStore.ts";
      const { useWorkspaceStore } = await import(/* @vite-ignore */ path);
      for (let i = 0; i < 12; i++) useWorkspaceStore.getState().commitOverall({ architecture: `New ${i}`, diagram: "", basis: null });
    });
    await page.reload();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("ai-architecture-designer-workspace")!).state);
    expect(saved.legacyArchive).toEqual(migrated.state.legacyArchive);
    expect(saved.favorites).toEqual(migrated.state.favorites);
    expect(saved.resultHistory).toHaveLength(10);
    expect(saved.trash).toEqual(migrated.state.trash);
  });
}
