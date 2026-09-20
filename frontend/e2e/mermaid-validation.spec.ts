import { expect, test } from "./fixtures";

const broken = 'graph TD\n  UI[""UI Layer (React & Tailwind)""]\n  DB[""Storage<br/>(SQLite)""]\n  UI --> DB';

test("conservative Mermaid repair preserves valid text and rejects ambiguous syntax", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
  const results = await page.evaluate(async (broken) => {
    const path = "/src/api/mermaid.ts";
    const { prepareDiagram, mermaidReady } = await import(/* @vite-ignore */ path);
    const mermaid = await mermaidReady;
    const valid = 'graph TD\n A["Invoice &quot;draft&quot; (PDF)"] --> B["Quote #quot; / end"]';
    const other = 'sequenceDiagram\n Alice->>Bob: Say ""hello""';
    const bad = 'graph TD\n A[""first "embedded" quote""] --> B[';
    const fixed = await prepareDiagram(broken);
    const svg = await mermaid.render("repair-regression", fixed.code);
    return { fixed, rendered: svg.svg.includes("<svg"), valid, checkedValid: await prepareDiagram(valid),
      other, checkedOther: await prepareDiagram(other), bad, checkedBad: await prepareDiagram(bad),
      fenced: await prepareDiagram('```mermaid\n' + broken + '\n```') };
  }, broken);
  expect(results.fixed.repaired).toBe(true);
  expect(results.rendered).toBe(true);
  expect(results.checkedValid).toEqual({ code: results.valid, repaired: false });
  expect(results.checkedOther).toEqual({ code: results.other, repaired: false });
  expect(results.checkedBad.code).toBe(results.bad);
  expect(results.checkedBad.error).toBeTruthy();
  expect(results.fenced.code).toBe(results.fixed.code);
});

test("generated diagrams validate before commit; legacy repair is explicit; invalid drafts keep prior result", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "System Architecture Designer" })).toBeVisible();
  const id = await page.evaluate(() => localStorage.getItem("ai-architecture-designer-project"));
  await page.route("**/api/diagram", (route) => route.fulfill({ json: { architecture: "Test architecture", diagram: broken } }));
  await page.getByRole("button", { name: "Generate Diagram", exact: true }).click();
  await expect(page.locator(".overall-preview h2")).toContainText("v1");
  await expect(page.getByRole("button", { name: "Download SVG" })).toBeEnabled();
  await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
  const before = await (await request.get(`/api/projects/${id}/workspace`)).json();
  expect(before.overall.diagram).not.toContain('[""');
  await page.unroute("**/api/diagram");
  await page.route("**/api/diagram", (route) => route.fulfill({ json: { architecture: "Rejected architecture", diagram: "graph TD\n A[" } }));
  await page.getByRole("button", { name: "Generate Diagram", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Rejected Mermaid source" })).toHaveValue("graph TD\n A[");
  await expect(page.locator(".overall-preview h2")).toContainText("v1");
  expect((await (await request.get(`/api/projects/${id}/workspace`)).json()).overall).toEqual(before.overall);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Rejected Mermaid source" })).toHaveValue("graph TD\n A[");
  await page.getByRole("textbox", { name: "Rejected Mermaid source" }).fill('graph TD\n A["Manually fixed"]');
  await page.getByRole("button", { name: "Validate and save diagram" }).click();
  await expect(page.locator(".overall-preview h2")).toContainText("v2");
  // Simulate an old saved malformed result without rewriting its historical record.
  await page.evaluate(async (broken) => {
    const path = "/src/components/ProjectShell.tsx";
    const { getProjectWorkspace } = await import(/* @vite-ignore */ path);
    getProjectWorkspace(localStorage.getItem("ai-architecture-designer-project")).getState().commitOverall({ architecture: "Legacy", diagram: broken, basis: null });
  }, broken);
  await expect(page.getByRole("button", { name: "Use repaired source" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download SVG" })).toBeEnabled();
  await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
  expect((await (await request.get(`/api/projects/${id}/workspace`)).json()).overall.diagram).toBe(broken);
  await page.getByRole("button", { name: "Use repaired source" }).click();
  await page.getByRole("button", { name: "Save diagram changes" }).click();
  await expect(page.locator(".overall-preview h2")).toContainText("v4");
  await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
  const saved = await (await request.get(`/api/projects/${id}/workspace`)).json();
  expect(saved.overall.diagram).not.toContain('[""');
  expect(saved.result_history.find((item: { version: number }) => item.version === 3).diagram).toBe(broken);
});
