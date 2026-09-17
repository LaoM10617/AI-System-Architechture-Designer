import { expect, test } from "@playwright/test";

test("demo path reaches architecture and diagram results", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
  await expect(page.getByText(/Connected to fake/)).toBeVisible();

  const notes = page.locator("article.note");
  await expect(notes).toHaveCount(3);
  await page.getByRole("button", { name: /Add Sticky Note/ }).click();
  await expect(notes).toHaveCount(4);

  await page.getByRole("button", { name: "Generate Architecture" }).click();
  await expect(page.getByText("AI Architecture Proposal", { exact: true })).toBeVisible();
  await expect(notes).toHaveCount(5);

  await page.getByRole("button", { name: "Generate Diagram" }).click();
  await expect(page.getByText("Mermaid Diagram", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit source" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});
