import { test, expect } from "@playwright/test";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:net";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

test("real frontend/backend restart preserves imported workspace and recovers failed saves", async ({ browser, request }) => {
  const root = resolve(process.cwd(), "..");
  const directory = await mkdtemp(join(tmpdir(), "architecture-restart-"));
  const dbPath = join(directory, "workspace.sqlite3");
  const backendPort = await freePort();
  const frontendPort = await freePort();
  const backendURL = `http://127.0.0.1:${backendPort}`;
  const frontendURL = `http://127.0.0.1:${frontendPort}`;
  let backend: ChildProcess | undefined;
  let frontend: ChildProcess | undefined;
  let logs = "";
  const launch = (command: string, args: string[], env: NodeJS.ProcessEnv) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: "pipe" });
    child.stdout?.on("data", (chunk) => { logs += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { logs += chunk.toString(); });
    child.on("error", (error) => { logs += error.message; });
    return child;
  };
  const ready = async (url: string) => {
    await expect.poll(async () => {
      try { return (await request.get(url, { timeout: 1000 })).status(); } catch { return 0; }
    }, { timeout: 15000 }).toBe(200);
  };
  const start = async () => {
    backend = launch(join(root, ".venv", "Scripts", "python.exe"), ["-B", "-m", "uvicorn", "backend:app", "--host", "127.0.0.1", "--port", String(backendPort)], {
      AI_PROVIDER: "fake", DATABASE_PATH: dbPath, CORS_ORIGINS: frontendURL,
    });
    frontend = launch(process.execPath, [join(root, "frontend/node_modules/vite/bin/vite.js"), join(root, "frontend"), "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort"], {
      VITE_BACKEND_PROXY_TARGET: backendURL,
    });
    await ready(backendURL + "/health");
    await ready(frontendURL);
  };
  const stop = async (child?: ChildProcess) => {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((done) => child.once("exit", () => done()));
    // Only terminate process trees created and retained by this test.
    if (process.platform === "win32") await new Promise<void>((done, reject) => {
      execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, (error) => error && child.exitCode === null ? reject(error) : done());
    });
    else child.kill("SIGTERM");
    await exited;
  };
  const offline = async (url: string) => {
    await expect.poll(async () => {
      try { await request.get(url, { timeout: 500 }); return false; } catch { return true; }
    }).toBe(true);
  };

  try {
    await start();
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const legacy = {
      project: { appType: "Web Application", userCount: "100–1,000 users", features: [], prompt: "Local planning application", category: "Project Basics" },
      notes: [
        { id: "user-note", kind: "user", title: "Local requirement", content: "Original browser note", position: { x: 40, y: 70 }, size: { width: 280, height: 230 }, createdAt: "2026-09-01T00:00:00Z" },
        { id: "legacy-result", kind: "architecture", title: "Old architecture", content: "Imported architecture", position: { x: 350, y: 70 }, size: { width: 300, height: 240 }, createdAt: "2026-09-02T00:00:00Z" },
      ],
      diagrams: [], trash: [], favorites: [{ id: "old-favorite", targetId: "legacy-result", targetType: "note", title: "Old architecture", createdAt: "2026-09-02T00:00:00Z" }],
    };
    await context.addInitScript((state) => {
      if (!localStorage.getItem("ai-architecture-designer-workspace")) localStorage.setItem("ai-architecture-designer-workspace", JSON.stringify({ state, version: 1 }));
    }, legacy);
    const page = await context.newPage();
    await page.goto(frontendURL);
    await page.getByRole("button", { name: "Save browser workspace as new project" }).click();
    await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
    const id = await page.evaluate(() => localStorage.getItem("ai-architecture-designer-project"));
    const workspaceURL = `${backendURL}/api/projects/${id}/workspace`;
    const imported = await (await request.get(workspaceURL)).json();
    expect(imported.snapshot.legacyArchive).toHaveLength(1);
    expect(imported.snapshot.favorites).toEqual(legacy.favorites);
    expect(imported.overall.architecture).toBe("Imported architecture");
    expect(imported.snapshot.notes[0].decisionStatus).toBe("draft");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ai-architecture-designer-pre-database-backup")!).version)).toBe(1);

    await page.locator('article[data-target-id="user-note"] textarea').fill("Saved before stopping both services");
    await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
    await page.getByRole("button", { name: "Generate Architecture", exact: true }).click();
    await expect(page.locator(".overall-preview h2")).toContainText("v2");
    await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
    await page.getByText("Previous versions (1)", { exact: true }).click();
    await page.getByRole("button", { name: "Restore v1", exact: true }).click();
    await expect(page.locator(".overall-preview h2")).toContainText("v3");
    await expect(page.locator(".database-status")).toContainText("Saved to SQLite");
    const saved = await (await request.get(workspaceURL)).json();
    expect(saved.overall.architecture).toBe("Imported architecture");
    expect(saved.snapshot.notes[0].content).toBe("Saved before stopping both services");
    const previousPids = [backend!.pid, frontend!.pid];
    await context.close();
    await stop(frontend); await stop(backend);
    await offline(frontendURL); await offline(backendURL + "/health");
    await start();
    expect(backend!.pid).not.toBe(previousPids[0]);
    expect(frontend!.pid).not.toBe(previousPids[1]);

    // Empty browser context proves recovery is from SQLite, not a browser cache.
    const fresh = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    await fresh.addInitScript((id) => localStorage.setItem("ai-architecture-designer-project", id!), id);
    const loaded = await fresh.newPage();
    await loaded.goto(frontendURL);
    await expect(loaded.locator('article[data-target-id="user-note"] textarea')).toHaveValue("Saved before stopping both services");
    await expect(loaded.locator(".overall-architecture")).toHaveText("Imported architecture");
    expect(await (await request.get(workspaceURL)).json()).toEqual(saved);

    await stop(backend); await offline(backendURL + "/health");
    await loaded.locator('article[data-target-id="user-note"] textarea').fill("Unsaved input survives real backend shutdown");
    await expect(loaded.locator(".database-status")).toContainText("failed");
    await expect(loaded.locator('article[data-target-id="user-note"] textarea')).toHaveValue("Unsaved input survives real backend shutdown");
    await loaded.close();
    await stop(frontend);
    await start();
    const recovered = await fresh.newPage();
    await recovered.goto(frontendURL);
    await recovered.getByRole("button", { name: "Recover local changes" }).click();
    await expect(recovered.locator(".database-status")).toContainText("Saved to SQLite");
    await expect(recovered.locator('article[data-target-id="user-note"] textarea')).toHaveValue("Unsaved input survives real backend shutdown");
    const final = await (await request.get(workspaceURL)).json();
    expect(final.snapshot.notes[0].content).toBe("Unsaved input survives real backend shutdown");
    expect(final.overall).toEqual(saved.overall);
    expect(final.result_history).toEqual(saved.result_history);
    expect(final.snapshot.legacyArchive).toEqual(saved.snapshot.legacyArchive);
    expect(final.snapshot.favorites).toEqual(saved.snapshot.favorites);
    await fresh.close();
    console.log("PASS: legacy import, save, both-process restart, fresh-browser restore, version rollback, real outage recovery");
  } catch (error) {
    console.error(logs.slice(-5000));
    throw error;
  } finally {
    await stop(frontend); await stop(backend);
  }
});
