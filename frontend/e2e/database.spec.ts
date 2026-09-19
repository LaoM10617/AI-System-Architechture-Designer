import { expect, test } from "@playwright/test";

test("SQLite autosave, lost response retry, conflict, and fresh browser load", async ({ page, browser, request }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Save browser workspace as new project" }).click();
  const status = page.locator(".database-status");
  await expect(status).toContainText("Saved to SQLite");
  const id = await page.evaluate(() => localStorage.getItem("ai-architecture-designer-project"));
  await expect(page.getByTestId("project-identity")).toContainText("Existing project");
  await expect(page.getByTestId("project-identity")).toHaveAttribute("title", `Project ID: ${id}`);
  const note = page.locator('article[data-target-id="game-concept"] textarea');
  await note.fill("Durable SQLite note");
  await expect(status).toContainText("Saved to SQLite");
  let db = await (await request.get(`/api/projects/${id}/workspace`)).json();
  expect(db.snapshot.notes[0].content).toBe("Durable SQLite note");

  const ids: string[] = [];
  let dropResponse = true;
  await page.route(`**/api/projects/${id}/sync`, async (route) => {
    ids.push(route.request().postDataJSON().request_id);
    const response = await route.fetch();
    if (dropResponse) { dropResponse = false; await route.abort("failed"); }
    else await route.fulfill({ response });
  });
  await note.fill("Committed but response lost");
  await expect(status).toContainText("failed");
  await note.fill("Edited while save failed");
  await page.getByRole("button", { name: "Retry database" }).click();
  await expect(status).toContainText("Saved to SQLite");
  expect(ids[0]).toBe(ids[1]);
  expect(ids[2]).not.toBe(ids[0]);
  db = await (await request.get(`/api/projects/${id}/workspace`)).json();
  expect(db.snapshot.notes[0].content).toBe("Edited while save failed");
  expect(db.revision).toBe(3);
  await page.unroute(`**/api/projects/${id}/sync`);

  // Another page writes after this one loaded its revision.
  db.snapshot.notes[0].content = "Other page's saved note";
  const external = await request.put(`/api/projects/${id}/workspace`, { data: {
    request_id: crypto.randomUUID(), expected_revision: db.revision, schema_version: 3, snapshot: db.snapshot,
  } });
  expect(external.ok()).toBeTruthy();
  await note.fill("My conflicting draft");
  await expect(status).toContainText("Another page changed");
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem("ai-architecture-designer-workspace")!).state);
  expect(cached.notes[0].content).toBe("My conflicting draft");
  await page.getByRole("button", { name: "Load database: Existing project", exact: true }).click();
  await expect(status).toContainText("Saved to SQLite");
  await expect(note).toHaveValue("Other page's saved note");
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("ai-architecture-designer-backup-") && localStorage.getItem(key)!.includes("My conflicting draft")))).toBe(true);

  const fresh = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await fresh.addInitScript((id) => localStorage.setItem("ai-architecture-designer-project", id!), id);
  const newPage = await fresh.newPage();
  await newPage.goto("http://127.0.0.1:5173");
  await expect(newPage.locator('article[data-target-id="game-concept"] textarea')).toHaveValue("Other page's saved note");
  await expect(newPage.getByTestId("project-identity")).toContainText("Existing project");
  await expect(newPage.getByTestId("project-identity")).toHaveAttribute("title", `Project ID: ${id}`);
  await fresh.close();
});

test("startup failure blocks default writes and allows retry", async ({ page }) => {
  await page.route("**/api/projects", (route) => route.fulfill({ status: 503, json: { error: { message: "Database temporarily offline" } } }));
  await page.goto("/");
  await expect(page.locator(".database-status")).toContainText("failed");
  await expect(page.locator("article.note")).toHaveCount(0);
  await page.unroute("**/api/projects");
  await page.getByRole("button", { name: "Retry database" }).click();
  await expect(page.getByRole("button", { name: "Save browser workspace as new project" })).toBeVisible();
});

test("failed save survives closing the page and can be recovered", async ({ page, context, request }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Save browser workspace as new project" }).click();
  await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
  const id = await page.evaluate(() => localStorage.getItem("ai-architecture-designer-project"));
  await page.route(`**/api/projects/${id}/sync`, (route) => route.fulfill({ status: 503, json: { error: { message: "Disk temporarily unavailable" } } }));
  await page.locator('article[data-target-id="game-concept"] textarea').fill("Recover after closing the browser page");
  await expect(page.locator(".database-status")).toContainText("failed");
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("http://127.0.0.1:5173");
  await reopened.getByRole("button", { name: "Recover local changes" }).click();
  await expect(reopened.locator(".database-status")).toContainText("Saved to SQLite");
  await expect(reopened.locator('article[data-target-id="game-concept"] textarea')).toHaveValue("Recover after closing the browser page");
  const db = await (await request.get(`/api/projects/${id}/workspace`)).json();
  expect(db.snapshot.notes[0].content).toBe("Recover after closing the browser page");
});
