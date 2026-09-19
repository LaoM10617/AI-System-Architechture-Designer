import { expect, test } from "./fixtures";

test("manual provider switching, remembered selection and request status", async ({ page }) => {
  const selected: string[] = [];
  await page.route("**/api/providers", (route) => route.fulfill({ json: {
    default: "fake", providers: [
      { id: "fake", model: "fake-demo", configured: true },
      { id: "groq", model: "openai/gpt-oss-120b", configured: true },
      { id: "gemini", model: "gemini-test", configured: false },
    ],
  } }));
  let fail = false;
  await page.route("**/api/architecture/stream", async (route) => {
    selected.push(route.request().headers()["x-ai-provider"]);
    if (fail) await route.fulfill({ status: 503, json: { error: { message: "Provider request failed" } } });
    else await route.fulfill({ contentType: "text/plain", body: "Test architecture" });
  });
  await page.goto("/");
  const selector = page.getByLabel("Provider", { exact: true });
  await expect(selector).toHaveValue("fake");
  await expect(selector.locator('option[value="gemini"]')).toBeDisabled();
  await selector.selectOption("groq");
  await expect(page.locator(".provider-status")).toContainText("openai/gpt-oss-120b");
  await page.getByRole("button", { name: "Generate Architecture", exact: true }).click();
  await expect(page.locator(".provider-status")).toContainText("Last request succeeded");
  expect(selected).toEqual(["groq"]);
  await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
  await page.reload();
  await expect(selector).toHaveValue("groq");
  await expect(page.locator(".provider-status")).toContainText("Not tested this session");
  fail = true;
  await page.getByRole("button", { name: "Generate Architecture", exact: true }).click();
  await expect(page.locator(".provider-status")).toContainText("Last request failed");
  await expect(page.locator(".overall-architecture")).toHaveText("Test architecture");
  fail = false;
  await selector.selectOption("fake");
  await page.locator(".retry-banner").getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".provider-status")).toContainText("Last request succeeded");
  expect(selected).toEqual(["groq", "groq", "fake"]);
});
