import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
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

const explicitBaseUrl = args.get("base-url") ?? process.env.PROVIDENCE_UI_BASE_URL ?? "";
const shouldStartFreshServer = args.has("fresh-server") || args.has("fresh-dev-server") || !explicitBaseUrl;
const preferredBaseUrls = [
  explicitBaseUrl,
  "http://127.0.0.1:5178",
  "http://localhost:5178",
  "http://localhost:8789"
].filter(Boolean);
const keepBrowser = args.has("keep-browser");

let devServer = null;
let appServer = null;
let browserProcess = null;
let browserProfileDir = null;

try {
  const baseUrl = shouldStartFreshServer
    ? await startFreshServer(args.get("server-port") ?? args.get("dev-port"))
    : await resolveBaseUrl(preferredBaseUrls, args.get("server-port") ?? args.get("dev-port"));
  const projectUrl = resolveProjectUrl(baseUrl, args.get("project") ?? process.env.PROVIDENCE_UI_PROJECT);
  const result = await runMapPaintSmoke(baseUrl, projectUrl);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  if (!keepBrowser && browserProcess) browserProcess.kill();
  if (devServer) devServer.kill();
  if (appServer) await closeHttpServer(appServer);
  if (!keepBrowser && browserProfileDir) {
    try {
      fs.rmSync(browserProfileDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup; Edge may release profile locks shortly after exit.
    }
  }
}

async function resolveBaseUrl(candidates, devPort) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (await isHttpReady(candidate)) return candidate.replace(/\/$/, "");
  }

  return startFreshServer(devPort);
}

function startFreshServer(devPort) {
  if (args.has("fresh-dev-server") || args.has("vite-dev-server")) return startDevServer(devPort);
  return startBuiltAppServer(devPort);
}

async function startBuiltAppServer(devPort) {
  if (!args.has("skip-build")) await runViteBuild();

  const port = devPort ? parsePort(devPort) : await findOpenPort(8789);
  const devUrl = `http://127.0.0.1:${port}`;
  appServer = http.createServer(serveBuiltAppRequest);
  await new Promise((resolve, reject) => {
    appServer.once("error", reject);
    appServer.listen(port, "127.0.0.1", resolve);
  });
  return devUrl;
}

function runViteBuild() {
  return new Promise((resolve, reject) => {
    const build = spawn(process.execPath, [viteCliPath(), "build"], {
      cwd: root,
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    build.stdout.on("data", (data) => process.stdout.write(`[build] ${data}`));
    build.stderr.on("data", (data) => process.stderr.write(`[build] ${data}`));
    build.on("error", reject);
    build.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Vite build failed with exit code ${code}.`));
    });
  });
}

async function startDevServer(devPort) {
  const port = devPort ? parsePort(devPort) : await findOpenPort(8789);
  const devUrl = `http://127.0.0.1:${port}`;
  devServer = spawn(process.execPath, [viteCliPath(), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: root,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  devServer.stdout.on("data", (data) => process.stdout.write(`[dev] ${data}`));
  devServer.stderr.on("data", (data) => process.stderr.write(`[dev] ${data}`));

  await waitFor(async () => isHttpReady(devUrl), 30_000, "Timed out waiting for Vite dev server.");
  return devUrl;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid dev server port: ${value}`);
  }
  return port;
}

function findOpenPort(startPort) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const tryPort = () => {
      const server = net.createServer();
      server.unref();
      server.on("error", (error) => {
        if (error.code === "EADDRINUSE" && port < 65_535) {
          port += 1;
          tryPort();
        } else {
          reject(error);
        }
      });
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(port));
      });
    };
    tryPort();
  });
}

function serveBuiltAppRequest(request, response) {
  const distRoot = path.join(root, "dist");
  const indexFile = path.join(distRoot, "index.html");
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(requestUrl.pathname);
  const distCandidate = safeResolve(distRoot, pathname === "/" ? "/index.html" : pathname);
  const workspaceCandidate = safeResolve(root, pathname);
  const file =
    regularFile(distCandidate) ? distCandidate
      : regularFile(workspaceCandidate) ? workspaceCandidate
        : indexFile;

  if (!regularFile(file)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": contentType(file) });
  fs.createReadStream(file).pipe(response);
}

function safeResolve(baseDir, requestPath) {
  const normalized = path.normalize(`.${requestPath}`);
  const candidate = path.resolve(baseDir, normalized);
  const relative = path.relative(baseDir, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return candidate;
}

function regularFile(file) {
  if (!file) return false;
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function contentType(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".wasm") return "application/wasm";
  return "application/octet-stream";
}

function closeHttpServer(server) {
  return new Promise((resolve) => server.close(resolve));
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
  const userDataDir = path.join(root, "tmp", `ui-smoke-edge-profile-${process.pid}-${Date.now()}`);
  browserProfileDir = userDataDir;
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

  const pageEvents = { console: [], exceptions: [] };
  client.on("Runtime.consoleAPICalled", (event) => {
    const text = event.args?.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ") ?? event.type;
    pageEvents.console.push(String(text).slice(0, 500));
    pageEvents.console = pageEvents.console.slice(-5);
  });
  client.on("Runtime.exceptionThrown", (event) => {
    const detail = event.exceptionDetails?.exception?.description
      ?? event.exceptionDetails?.text
      ?? "Runtime exception";
    pageEvents.exceptions.push(String(detail).slice(0, 500));
    pageEvents.exceptions = pageEvents.exceptions.slice(-5);
  });

  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Page.navigate", { url: `${baseUrl}/?benchmarkProject=${encodeURIComponent(projectUrl)}` });
  await waitFor(async () => {
    const value = await evalValue(client, "document.body.innerText.includes('Realmz Providence')");
    return value === true;
  }, 30_000, async () => `Timed out waiting for Providence shell. ${await pageDiagnostic(client)} ${JSON.stringify(pageEvents)}`);
  await waitFor(async () => {
    const value = await evalValue(client, "Boolean(document.querySelector('nav.domain-rail button.domain-maps'))");
    return value === true;
  }, 30_000, async () => `Timed out waiting for benchmark project. ${await pageDiagnostic(client)}`);

  await evalValue(client, `
    (() => {
      localStorage.setItem("providence.mapWorkbenchMode.v1", "canvas");
      const map = document.querySelector("nav.domain-rail button.domain-maps")
        ?? [...document.querySelectorAll("button")]
          .find((button) => button.textContent && button.textContent.trim().startsWith("Maps"));
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

function viteCliPath() {
  const candidate = path.join(root, "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(candidate)) {
    throw new Error("Local Vite CLI was not found. Run `npm install` before using the map paint UI smoke.");
  }
  return candidate;
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
    const listeners = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const message = { id: ++id, method, params };
          pending.set(id, { res, rej });
          ws.send(JSON.stringify(message));
        });
      },
      on(method, handler) {
        const current = listeners.get(method) ?? [];
        current.push(handler);
        listeners.set(method, current);
      },
      close() {
        ws.close();
      }
    });
    ws.onerror = reject;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.method) {
        for (const listener of listeners.get(message.method) ?? []) listener(message.params ?? {});
      }
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
      const href = window.location.href;
      const readyState = document.readyState;
      const title = document.title;
      const text = document.body.innerText.slice(0, 240).replace(/\\s+/g, " ");
      const html = document.documentElement.outerHTML.slice(0, 240).replace(/\\s+/g, " ");
      return JSON.stringify({ href, readyState, title, activeRail, hasCanvas, text, html });
    })()
  `);
}
