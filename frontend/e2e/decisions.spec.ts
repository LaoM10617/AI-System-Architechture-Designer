import { expect, test } from "./fixtures";

test("decision stamps filter requests and invalidate architecture reuse", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const requests: { notes: string[]; architecture?: string }[] = [];
  await page.route("**/api/architecture/stream", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "text/plain", body: "Current architecture" });
  });
  await page.route("**/api/diagram", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({ json: { architecture: body.architecture ?? "Updated architecture", diagram: "graph TD; A-->B" } });
  });
  await page.goto("/");
  const note = page.locator('article[data-target-id="game-concept"]');
  const freshness = page.locator(".result-freshness");
  await page.getByRole("button", { name: "Generate Architecture", exact: true }).click();
  await expect(freshness).toContainText("Up to date");
  expect(requests.at(-1)?.notes).toEqual([]);
  await note.locator("textarea").fill("Use PostgreSQL");
  await expect(freshness).toContainText("Up to date");
  await note.getByRole("button", { name: "Confirm decision", exact: true }).click();
  await expect(freshness).toContainText("Out of date");
  await page.getByRole("button", { name: "Generate Diagram", exact: true }).click();
  await expect(freshness).toContainText("Up to date");
  expect(requests.at(-1)?.architecture).toBeUndefined();
  expect(requests.at(-1)?.notes).toEqual(["Game Concept: Use PostgreSQL"]);
  await note.getByTitle("Minimize note", { exact: true }).click();
  await expect(note.getByRole("button", { name: "Revoke confirmed decision" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(note.getByRole("button", { name: "Revoke confirmed decision" })).toBeVisible();
  await note.getByTitle("Favorite", { exact: true }).click();
  await expect(freshness).toContainText("Up to date");
  await page.getByRole("button", { name: "Generate Diagram", exact: true }).click();
  await expect(page.locator(".overall-preview h2")).toContainText("v3");
  expect(requests.at(-1)?.architecture).toBe("Updated architecture");
  expect(requests.at(-1)?.notes).toEqual(["Game Concept: Use PostgreSQL"]);
  await page.getByRole("button", { name: /Favorites/ }).click();
  await page.locator(".bin-popover").getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: /Favorites/ }).click();
  await note.getByRole("button", { name: "Revoke confirmed decision" }).click();
  await expect(freshness).toContainText("Out of date");
  await page.getByRole("button", { name: "Generate Diagram", exact: true }).click();
  await expect(page.locator(".overall-preview h2")).toContainText("v4");
  expect(requests.at(-1)?.notes).toEqual([]);
  expect(requests.at(-1)?.architecture).toBeUndefined();
  await expect(freshness).toContainText("Up to date");
});
