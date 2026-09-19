import { test as base, expect } from "@playwright/test";

// Existing UI tests each import a fresh isolated project into the temporary DB.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addLocatorHandler(page.getByRole("button", { name: "Save browser workspace as new project" }), async () => {
      await page.getByRole("button", { name: "Save browser workspace as new project" }).click();
      await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
    });
    await page.addLocatorHandler(page.getByRole("button", { name: "Recover local changes" }), async () => {
      await page.getByRole("button", { name: "Recover local changes" }).click();
      await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
    });
    await use(page);
  },
});
export { expect };
