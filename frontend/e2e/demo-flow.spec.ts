import { expect, test } from "./fixtures";

test("demo path reaches architecture and diagram results", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
  await expect(page.getByText(/Default provider: fake/)).toBeVisible();

  const notes = page.locator("article.note");
  await expect(notes).toHaveCount(3);
  await page.getByRole("button", { name: /Add Sticky Note/ }).click();
  await expect(notes).toHaveCount(4);

  await page.getByRole("button", { name: "Generate Architecture" }).click();
  await expect(page.locator(".overall-preview h2")).toContainText("v1");
  await expect(notes).toHaveCount(4);

  await page.getByRole("button", { name: "Generate Diagram" }).click();
  await expect(page.locator(".overall-preview h2")).toContainText("v2");
  await expect(page.getByRole("button", { name: "Edit source" })).toBeVisible();

  // Save edits, generated results, favorites, and trash across a page reload.
  const userNote = page.locator('article[data-target-id="game-concept"]');
  await userNote.locator("textarea").fill("Persist this project requirement");
  await userNote.getByTitle("Edit title", { exact: true }).click();
  await userNote.getByRole("textbox", { name: "Note title" }).fill("My renamed note");
  await userNote.getByRole("textbox", { name: "Note title" }).press("Enter");
  await userNote.getByTitle("Minimize note", { exact: true }).click();
  await expect(userNote.locator("textarea")).toHaveCount(0);
  expect((await userNote.boundingBox())!.height).toBeLessThan(55);
  await page.locator('article[data-target-id="target-audience"]').getByTitle("Favorite", { exact: true }).click();
  await page.locator('article[data-target-id="technical-requirements"]').getByTitle("Move to trash").click();
  const saved = await page.evaluate(() => {
    const { previewEditing: _diagramDraft, architectureEdit: _architectureDraft, diagramIssue: _rejected, ...domain } = JSON.parse(localStorage.getItem(`ai-architecture-designer-workspace-${localStorage.getItem("ai-architecture-designer-project")}`)!).state;
    return domain;
  });
  expect(saved.diagrams).toHaveLength(0);
  expect(saved.overall.diagram).toBeTruthy();
  expect(saved.overall.basis.decisions).toEqual([]);
  expect(saved.resultHistory).toHaveLength(1);
  expect(saved.favorites).toHaveLength(1);
  expect(saved.trash).toHaveLength(1);
  await page.reload();
  await expect(notes).toHaveCount(2);
  await expect(userNote.getByTitle("Edit title", { exact: true })).toHaveText("My renamed note");
  await expect(userNote.getByTitle("Expand note", { exact: true })).toBeVisible();
  await expect(page.locator("article.note-architecture")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit source" })).toBeVisible();
  const restored = await page.evaluate(async () => {
    // Read the live store to verify hydration, not just the saved JSON.
    const path = "/src/components/ProjectShell.tsx";
    const { getProjectWorkspace } = await import(/* @vite-ignore */ path);
    const useWorkspaceStore = getProjectWorkspace(localStorage.getItem("ai-architecture-designer-project"));
    const { project, notes, diagrams, favorites, trash, overall, resultHistory, legacyArchive } = useWorkspaceStore.getState();
    return { project, notes, diagrams, favorites, trash, overall, resultHistory, legacyArchive };
  });
  expect(restored).toEqual(saved);
  await userNote.getByTitle("Expand note", { exact: true }).click();
  await expect(userNote.locator("textarea")).toHaveValue("Persist this project requirement");
  await page.getByRole("button", { name: /Favorites/ }).click();
  await page.locator(".bin-popover").getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator('article[data-target-id="target-audience"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Favorites/ })).toContainText("0");
  await page.getByRole("button", { name: /Favorites/ }).click();
  await userNote.getByTitle("Favorite", { exact: true }).click();
  await expect(userNote).toHaveCount(0);
  await page.getByRole("button", { name: /Favorites/ }).click();
  await expect(page.locator(".bin-popover")).toContainText("My renamed note");
  await page.locator(".bin-popover").getByRole("button", { name: "Restore", exact: true }).click();
  await expect(userNote.locator("textarea")).toHaveValue("Persist this project requirement");
  expect(browserErrors).toEqual([]);
});
