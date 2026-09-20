import { expect, test } from "@playwright/test";

test("double-click rename syncs SQLite, retries exact request and preserves autosave revision", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Save browser workspace as new project" }).click();
  await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
  const id = await page.evaluate(() => localStorage.getItem("ai-architecture-designer-project"));
  const url = `/api/projects/${id}`;
  await page.locator(".controls-section textarea").fill("Draft before rename");
  const ids: string[] = [];
  let lost = true;
  await page.route(`**${url}`, async (route) => {
    ids.push(route.request().postDataJSON().request_id);
    const response = await route.fetch();
    if (lost) { lost = false; await route.abort("failed"); }
    else await route.fulfill({ response });
  });
  await page.getByRole("tab", { name: /Existing project/ }).dblclick();
  await page.getByRole("textbox", { name: "Rename project" }).fill("  My renamed project  ");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator(".project-tab [role=alert]")).toContainText("failed");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Rename project" })).toHaveCount(0);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await expect(page.getByRole("tab", { name: /My renamed project/ })).toBeVisible();
  let saved = await (await request.get(url + "/workspace")).json();
  expect(saved.project_record.name).toBe("My renamed project");
  expect(saved.snapshot.project.prompt).toBe("Draft before rename");
  await page.locator(".controls-section textarea").fill("Edit after rename");
  await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
  await page.reload();
  await expect(page.getByRole("tab", { name: /My renamed project/ })).toBeVisible();
  await expect(page.locator(".controls-section textarea")).toHaveValue("Edit after rename");
  await page.getByRole("button", { name: "Project list", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved projects" })).toContainText("My renamed project");
  // Another browser advances the revision: this page must not overwrite its name.
  saved = await (await request.get(url + "/workspace")).json();
  const external = await request.patch(url, { data: { request_id: crypto.randomUUID(), expected_revision: saved.revision, name: "Renamed elsewhere" } });
  expect(external.ok()).toBe(true);
  await page.getByRole("tab", { name: /My renamed project/ }).dblclick();
  await page.getByRole("textbox", { name: "Rename project" }).fill("Conflicting rename");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator(".database-status")).toContainText("Another page changed");
  await expect(page.getByRole("textbox", { name: "Rename project" })).toHaveValue("Conflicting rename");
  const after = await (await request.get(url + "/workspace")).json();
  expect(after.project_record.name).toBe("Renamed elsewhere");
  expect(after.snapshot).toEqual(saved.snapshot);
});
