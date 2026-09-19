import { expect, test } from "./fixtures";

test("close awaits an in-flight save and cancels a late AI result", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
  expect(await page.evaluate(async () => {
    const path = "/src/store/requestStore.ts";
    const { createRequestStore } = await import(/* @vite-ignore */ path);
    const store = createRequestStore();
    const old = store.getState().begin();
    store.getState().cancel();
    const current = store.getState().begin();
    store.getState().finish(old);
    const intact = store.getState().pending === 1 && store.getState().controller?.signal === current;
    store.getState().cancel();
    return intact && current.aborted;
  })).toBe(true);
  const id = await page.evaluate(() => localStorage.getItem("ai-architecture-designer-project"));
  let releaseSave!: () => void;
  let saving = false;
  const heldSave = new Promise<void>((resolve) => { releaseSave = resolve; });
  await page.route(`**/api/projects/${id}/sync`, async (route) => { saving = true; await heldSave; await route.continue(); });
  await page.locator(".controls-section textarea").fill("Input preserved when closing during save");
  await expect.poll(() => saving).toBe(true);
  let releaseAI!: () => void;
  const heldAI = new Promise<void>((resolve) => { releaseAI = resolve; });
  let generating = false;
  await page.route("**/api/architecture/stream", async (route) => {
    generating = true; await heldAI;
    await route.fulfill({ contentType: "text/plain", body: "Must not be committed after close" }).catch(() => {});
  });
  await page.getByRole("button", { name: "Generate Architecture", exact: true }).click();
  await expect.poll(() => generating).toBe(true);
  await page.getByRole("button", { name: "Close Existing project" }).click();
  await expect(page.getByRole("tab", { name: /Existing project/ })).toContainText("Closing");
  releaseSave();
  await expect(page.getByRole("tab", { name: /Existing project/ })).toHaveCount(0);
  releaseAI();
  await page.getByRole("button", { name: "Project list", exact: true }).click();
  await page.getByRole("region", { name: "Saved projects" }).getByRole("button", { name: `Existing project · ${id!.slice(0, 8)}`, exact: true }).click();
  await expect(page.locator(".controls-section textarea")).toHaveValue("Input preserved when closing during save");
  const saved = await (await request.get(`/api/projects/${id}/workspace`)).json();
  expect(saved.overall).toBeNull();
});

test("refresh restores project tabs, result drafts and interrupted creation", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
  await page.getByRole("button", { name: "Generate Architecture", exact: true }).click();
  await expect(page.locator(".overall-preview h2")).toContainText("v1");
  await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
  await page.getByRole("button", { name: "Edit architecture", exact: true }).click();
  await page.getByRole("textbox", { name: "Architecture source" }).fill("Uncommitted A editor draft");
  await page.route("**/api/projects/import", (route) => route.fulfill({ status: 503, json: { error: { message: "Offline during creation" } } }));
  await page.getByRole("textbox", { name: "New project name" }).fill("Interrupted B");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(page.locator(".database-status")).toContainText("Offline during creation");
  const b = await page.evaluate(() => localStorage.getItem("ai-architecture-designer-project"));
  expect((await request.get(`/api/projects/${b}/workspace`)).status()).toBe(404);
  await page.unroute("**/api/projects/import");
  await page.reload();
  await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Interrupted B/ })).toHaveCount(1);
  await page.getByRole("tab", { name: /Existing project/ }).click();
  await expect(page.getByRole("textbox", { name: "Architecture source" })).toHaveValue("Uncommitted A editor draft");
  expect((await request.get(`/api/projects/${b}/workspace`)).ok()).toBe(true);
});
