import { expect, test } from "./fixtures";

test("draft -> confirmed -> stale -> regenerate -> save version -> reload", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const requests: { notes: string[]; architecture?: string }[] = [];
  await page.route("**/api/diagram", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({ json: {
      architecture: `Architecture based on: ${body.notes.join("; ") || "project only"}`,
      diagram: `graph TD; App-->Database${requests.length}`,
    } });
  });
  await page.goto("/");
  const note = page.locator('article[data-target-id="game-concept"]');
  const freshness = page.locator(".result-freshness");
  const heading = page.locator(".overall-preview h2");
  const generate = page.getByRole("button", { name: "Generate Diagram", exact: true });
  const snapshot = () => page.evaluate(() => JSON.parse(localStorage.getItem(`ai-architecture-designer-workspace-${localStorage.getItem("ai-architecture-designer-project")}`)!).state);

  await generate.click();
  await expect(heading).toContainText("v1");
  const baseline = (await snapshot()).overall;
  expect(requests[0].notes).toEqual([]);
  await note.locator("textarea").fill("Use PostgreSQL");
  await expect(freshness).toContainText("Up to date");
  expect((await snapshot()).overall).toEqual(baseline);
  expect(requests).toHaveLength(1);

  await note.getByRole("button", { name: "Confirm decision", exact: true }).click();
  await expect(freshness).toContainText("Out of date");
  expect(requests).toHaveLength(1);
  await generate.click();
  await expect(heading).toContainText("v2");
  await expect(freshness).toContainText("Up to date");
  expect(requests[1].notes).toEqual(["Game Concept: Use PostgreSQL"]);
  expect(requests[1].architecture).toBeUndefined();
  const confirmedResult = (await snapshot()).overall;

  await note.locator("textarea").fill("Use MongoDB");
  await expect(freshness).toContainText("Out of date");
  expect((await snapshot()).overall).toEqual(confirmedResult);
  const capturedBasis = page.locator(".overall-preview details").filter({ has: page.locator("summary", { hasText: "Inputs used for v2" }) });
  await capturedBasis.locator("summary").click();
  await expect(capturedBasis).toContainText("Use PostgreSQL");
  expect(requests).toHaveLength(2);
  await generate.click();
  await expect(heading).toContainText("v3");
  await expect(freshness).toContainText("Up to date");
  expect(requests[2].notes).toEqual(["Game Concept: Use MongoDB"]);
  expect(requests[2].architecture).toBeUndefined();

  // Explicit save creates a version, while successful generation is already autosaved.
  await page.getByRole("button", { name: "Edit source", exact: true }).click();
  const savedCode = "graph TD; App[Application] --> DB[MongoDB]";
  await page.locator(".diagram-editor").fill(savedCode);
  await page.getByRole("button", { name: "Save diagram changes" }).click();
  await expect(heading).toContainText("v4");
  const saved = await snapshot();
  expect(saved.overall.source).toBe("edited");
  expect(saved.overall.diagram).toBe(savedCode);
  expect(saved.overall.basis.decisions[0].content).toBe("Use MongoDB");
  expect(saved.resultHistory.map((item: { version: number }) => item.version)).toEqual([3, 2, 1]);

  await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
  await page.reload();
  await expect(heading).toContainText("v4");
  await expect(freshness).toContainText("Up to date");
  await expect(note.locator("textarea")).toHaveValue("Use MongoDB");
  await expect(note.getByRole("button", { name: "Revoke confirmed decision" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Download SVG" })).toBeEnabled();
  await page.getByRole("button", { name: "Edit source", exact: true }).click();
  await expect(page.locator(".diagram-editor")).toHaveValue(savedCode);
  const hydrated = await page.evaluate(async () => {
    const path = "/src/components/ProjectShell.tsx";
    const { getProjectWorkspace } = await import(/* @vite-ignore */ path);
    const useWorkspaceStore = getProjectWorkspace(localStorage.getItem("ai-architecture-designer-project"));
    const { overall, resultHistory, notes, project } = useWorkspaceStore.getState();
    return { overall, resultHistory, notes, project };
  });
  expect(hydrated).toEqual({ overall: saved.overall, resultHistory: saved.resultHistory, notes: saved.notes, project: saved.project });
  expect(requests).toHaveLength(3);

  await page.getByText("Previous versions (3)", { exact: true }).click();
  await page.getByRole("button", { name: "Restore v2", exact: true }).click();
  await expect(heading).toContainText("v5");
  await expect(freshness).toContainText("Out of date");
  await expect(note.locator("textarea")).toHaveValue("Use MongoDB");
  expect((await snapshot()).overall.architecture).toBe(confirmedResult.architecture);
  expect(requests).toHaveLength(3);
  expect(errors).toEqual([]);
});
