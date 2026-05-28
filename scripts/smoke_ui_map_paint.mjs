import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = process.cwd();
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith("--")) continue;
  const [key, inline] = value.slice(2).split("=", 2);
  args.set(key, inline ?? process.argv[index + 1]);
  if (inline == null) index += 1;
}

const preferredBaseUrls = [
  args.get("base-url"),
  process.env.PROVIDENCE_UI_BASE_URL,
  "http://127.0.0.1:5178",
  "http://localhost:5178",
  "http://localhost:8789"
].filter(Boolean);
const keepBrowser = args.has("keep-browser");

let devServer = null;
let browserProcess = null;

try {
  const baseUrl = await resolveBaseUrl(preferredBaseUrls);
  const projectUrl = resolveProjectUrl(baseUrl, args.get("project") ?? process.env.PROVIDENCE_UI_PROJECT);
  const result = await runMapPaintSmoke(baseUrl, projectUrl);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  if (!keepBrowser && browserProcess) browserProcess.kill();
  if (devServer) devServer.kill();
}

async function resolveBaseUrl(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (await isHttpReady(candidate)) return candidate.replace(/\/$/, "");
  }

  devServer = spawn(npmCommand(), ["run", "dev"], {
    cwd: root,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  devServer.stdout.on("data", (data) => process.stdout.write(`[dev] ${data}`));
  devServer.stderr.on("data", (data) => process.stderr.write(`[dev] ${data}`));

  const devUrl = "http://127.0.0.1:5178";
  await waitFor(async () => isHttpReady(devUrl), 30_000, "Timed out waiting for Vite dev server.");
  return devUrl;
}

function resolveProjectUrl(baseUrl, requestedProject) {
  if (requestedProject?.startsWith("http://") || requestedProject?.startsWith("https://")) return requestedProject;
  const projectPath = requestedProject ? path.resolve(requestedProject) : findLatestMapProject();
  if (!projectPath) {
    throw new Error("No map benchmark project found. Run `npm run smoke:editor:maps -- -KeepArtifacts` once, or pass --project <project.json>.");
  }
  const relative = path.relative(root, projectPath).replace(/\\/g, "/");
  if (relative.startsWith("..")) throw new Error(`Project must be inside workspace for browser serving: ${projectPath}`);
  return `${baseUrl}/${relative}`;
}

function findLatestMapProject() {
  const runRoot = path.join(root, "tmp", "editor-smoke-runs");
  const matches = [];
  visit(runRoot);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.file ?? null;

  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (entry.name === "project.json" && full.includes("MapsAuthoring.providence")) {
        matches.push({ file: full, mtimeMs: fs.statSync(full).mtimeMs });
      }
    }
  }
}

async function runMapPaintSmoke(baseUrl, projectUrl) {
  const edge = findEdge();
  const userDataDir = path.join(root, "tmp", "ui-smoke-edge-profile");
  fs.mkdirSync(userDataDir, { recursive: true });
  const port = 9351 + Math.floor(Math.random() * 400);
  browserProcess = spawn(edge, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1400,1000",
    "about:blank"
  ], { stdio: "ignore", windowsHide: true });

  const targets = await waitFor(async () => {
    try {
      return await getJson(`http://127.0.0.1:${port}/json/list`);
    } catch {
      return null;
    }
  }, 20_000, "Timed out waiting for Edge debugging port.");
  const pageTarget = targets.find((target) => target.type === "page");
  if (!pageTarget) throw new Error("No Edge page target found.");
  const client = await connectCdp(pageTarget.webSocketDebuggerUrl);

  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Page.navigate", { url: `${baseUrl}/?benchmarkProject=${encodeURIComponent(projectUrl)}` });
  await waitFor(async () => {
    const value = await evalValue(client, "document.body.innerText.includes('Realmz Providence')");
    return value === true;
  }, 30_000, "Timed out waiting for Providence shell.");
  await waitFor(async () => {
    const value = await evalValue(client, "document.body.innerText.includes('Action Point Hub') || document.body.innerText.includes('Scenario Maps')");
    return value === true;
  }, 30_000, async () => `Timed out waiting for benchmark project. ${await pageDiagnostic(client)}`);

  await evalValue(client, `
    (() => {
      localStorage.setItem("providence.mapWorkbenchMode.v1", "canvas");
      const map = document.querySelector("button.domain-maps");
      map?.click();
      return Boolean(map);
    })()
  `);
  await waitFor(async () => {
    const value = await evalValue(client, "document.body.innerText.toLowerCase().includes('scenario maps')");
    return value === true;
  }, 30_000, async () => `Timed out waiting for Maps workbench. ${await pageDiagnostic(client)}`);
  await evalValue(client, `
    (() => {
      const canvas = [...document.querySelectorAll("button")]
        .find((button) => button.textContent && button.textContent.trim() === "Canvas");
      canvas?.click();
      return Boolean(canvas);
    })()
  `);
  await waitFor(async () => {
    const value = await evalValue(client, "Boolean(document.querySelector('.room-canvas-overlay'))");
    return value === true;
  }, 30_000, async () => `Timed out waiting for map canvas. ${await pageDiagnostic(client)}`);

  const cursorTarget = await evalValue(client, `
    (() => {
      const paint = [...document.querySelectorAll("button")]
        .find((button) => button.textContent && button.textContent.trim() === "Paint");
      paint?.click();
      const canvas = document.querySelector(".room-canvas-overlay");
      if (!canvas) return null;
      canvas.scrollIntoView({ block: "center", inline: "center" });
      const rect = canvas.getBoundingClientRect();
      const clientX = rect.left + Math.min(240, rect.width / 2);
      const clientY = rect.top + Math.min(240, rect.height / 2);
      return {
        clientX,
        clientY,
        paintActive: paint?.classList.contains("active") ?? false
      };
    })()
  `);
  if (!cursorTarget) return { ok: false, reason: "no canvas", baseUrl, projectUrl };

  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: cursorTarget.clientX,
    y: cursorTarget.clientY,
    button: "none"
  });
  await new Promise((resolve) => setTimeout(resolve, 80));

  const result = await evalValue(client, `
    (() => new Promise((resolve) => requestAnimationFrame(() => {
      const canvas = document.querySelector(".room-canvas-overlay");
      if (!canvas) {
        resolve({ ok: false, reason: "no canvas" });
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const clientX = ${JSON.stringify(cursorTarget.clientX)};
      const clientY = ${JSON.stringify(cursorTarget.clientY)};
      const sampleX = Math.floor(canvas.width * (clientX - rect.left) / rect.width);
      const sampleY = Math.floor(canvas.height * (clientY - rect.top) / rect.height);
      const radius = 20;
      const left = Math.max(0, sampleX - radius);
      const top = Math.max(0, sampleY - radius);
      const width = Math.min(canvas.width - left, radius * 2 + 1);
      const height = Math.min(canvas.height - top, radius * 2 + 1);
      const pixels = canvas.getContext("2d").getImageData(left, top, width, height).data;
      let maxAlpha = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > maxAlpha) maxAlpha = pixels[index];
      }
      const paint = [...document.querySelectorAll("button")]
        .find((button) => button.textContent && button.textContent.trim() === "Paint");
      resolve({
        ok: getComputedStyle(canvas).cursor === "none" && maxAlpha > 0,
        cursor: getComputedStyle(canvas).cursor,
        overlayAlpha: maxAlpha,
        canvasSize: [canvas.width, canvas.height],
        paintActive: paint?.classList.contains("active") ?? false
      });
    })))()
  `);
  client.close();
  return { ...result, baseUrl, projectUrl };
}

function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Microsoft Edge was not found. Set EDGE_PATH to a Chromium-compatible browser.");
  return found;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function isHttpReady(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const message = { id: ++id, method, params };
          pending.set(id, { res, rej });
          ws.send(JSON.stringify(message));
        });
      },
      close() {
        ws.close();
      }
    });
    ws.onerror = reject;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { res, rej } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rej(new Error(message.error.message));
      else res(message.result);
    };
  });
}

async function evalValue(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const details = result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.exception?.value
      ?? result.exceptionDetails.text
      ?? "Runtime evaluation failed.";
    throw new Error(details);
  }
  return result.result.value;
}

async function waitFor(check, timeoutMs, message) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(typeof message === "function" ? await message() : message);
}

async function pageDiagnostic(client) {
  return evalValue(client, `
    (() => {
      const activeRail = document.querySelector(".rail-tool.active")?.textContent?.trim();
      const hasCanvas = Boolean(document.querySelector(".room-canvas-overlay"));
      const text = document.body.innerText.slice(0, 240).replace(/\\s+/g, " ");
      return JSON.stringify({ activeRail, hasCanvas, text });
    })()
  `);
}
