import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const previewTopic = args.get("preview-topic");
const outputDir = path.resolve(args.get("out") ?? (previewTopic ? "tmp/manual-preview" : "public/manual/gallery"));
const requested = new Set((args.get("capture") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
const galleryCaptures = [
  { preset: "scenario", file: "scenario-shell.png", selector: ".scenario-workbench" },
  { preset: "maps", file: "land-dungeon-maps.png", selector: ".room-canvas-overlay", ready: "!document.body.innerText.includes('Landlook atlas is unavailable')" },
  { preset: "player-maps", file: "player-maps.png", selector: ".player-maps-panel", waitMs: 3500 },
  { preset: "scripts", file: "action-points.png", selector: ".scripts-workbench" },
  { preset: "text", file: "strings-text.png", selector: ".text-workbench" },
  { preset: "encounters", file: "complex-encounters.png", selector: ".complex-encounter-authoring" },
  { preset: "combat", file: "combat.png", selector: ".combat-workbench", ready: "Boolean(document.querySelector('[data-combat-preview-ready=\"true\"]'))", waitMs: 2500 },
  { preset: "economy", file: "economy-treasure.png", selector: ".treasure-workbench" },
  { preset: "rules", file: "rules-castes.png", selector: ".rules-workbench" },
  { preset: "assets", file: "assets.png", selector: ".asset-workbench", waitMs: 2500 },
  { preset: "export", file: "export.png", selector: ".export-workbench" }
];
const captures = previewTopic
  ? [{
      preset: "workspace",
      file: `documents-${safeFilePart(previewTopic)}.png`,
      selector: ".workbench-topbar",
      documentTopic: previewTopic
    }]
  : galleryCaptures.filter((capture) => requested.size === 0 || requested.has(capture.preset));

if (captures.length === 0) throw new Error("No matching capture presets were requested.");

const projectPath = resolveProjectPath(args.get("project") ?? process.env.PROVIDENCE_MANUAL_PROJECT);
let server;
let browser;
let profileDir;

try {
  if (!args.has("skip-build")) await runBuild();
  const port = await findOpenPort(Number(args.get("port") ?? 8797));
  server = await startServer(port);
  const baseUrl = `http://127.0.0.1:${port}`;
  const projectUrl = `${baseUrl}/${workspacePath(projectPath)}`;
  fs.mkdirSync(outputDir, { recursive: true });

  const launched = await launchBrowser();
  browser = launched.process;
  profileDir = launched.profileDir;
  const client = launched.client;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: Number(args.get("width") ?? 1600),
    height: Number(args.get("height") ?? 1000),
    deviceScaleFactor: 1,
    mobile: false
  });

  const written = [];
  for (const capture of captures) {
    process.stdout.write(`[manual-gallery] ${capture.preset}... `);
    const url = `${baseUrl}/?benchmarkProject=${encodeURIComponent(projectUrl)}&manualCapture=${capture.preset}`;
    await client.send("Page.navigate", { url });
    await waitFor(async () => {
      const ready = await evaluate(client, `document.documentElement.dataset.manualCapture === ${JSON.stringify(capture.preset)} && Boolean(document.querySelector(${JSON.stringify(capture.selector)}))`);
      return ready === true;
    }, 45_000, `Timed out waiting for ${capture.preset} (${capture.selector}).`);
    if (capture.documentTopic) {
      await evaluate(client, `
        [...document.querySelectorAll("button")]
          .find((button) => button.textContent?.trim() === "Documents")
          ?.click()
      `);
      await waitFor(async () => await evaluate(client, "Boolean(document.querySelector('.documents-panel'))") === true, 15_000, "Timed out opening Documents.");
      const topicSelector = `[data-document-topic=${JSON.stringify(capture.documentTopic)}]`;
      const selected = await evaluate(client, `
        (() => {
          const button = document.querySelector(${JSON.stringify(topicSelector)});
          if (!(button instanceof HTMLButtonElement)) return false;
          button.click();
          return true;
        })()
      `);
      if (!selected) throw new Error(`Unknown manual topic: ${capture.documentTopic}`);
      await waitFor(
        async () => await evaluate(client, `document.querySelector("[data-active-document-topic]")?.getAttribute("data-active-document-topic") === ${JSON.stringify(capture.documentTopic)}`) === true,
        10_000,
        `Timed out selecting manual topic ${capture.documentTopic}.`
      );
    }
    if (capture.ready) {
      await waitFor(async () => await evaluate(client, capture.ready) === true, 30_000, `Timed out waiting for ${capture.preset} assets.`);
    }
    await evaluate(client, `
      (() => {
        document.documentElement.dataset.tutorial = "off";
        const style = document.createElement("style");
        style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
        document.head.appendChild(style);
        return document.fonts?.ready ?? Promise.resolve();
      })()
    `);
    await delay(capture.waitMs ?? 800);
    const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
    const outputPath = path.join(outputDir, capture.file);
    fs.writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
    written.push(path.relative(root, outputPath).replace(/\\/g, "/"));
    process.stdout.write(`${written.at(-1)}\n`);
  }
  client.close();
  console.log(JSON.stringify({ project: workspacePath(projectPath), captures: written }, null, 2));
} finally {
  if (browser) browser.kill();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (profileDir) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // Edge can hold profile locks briefly after exit.
    }
  }
}

function parseArgs(values) {
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    if (inline != null) parsed.set(key, inline);
    else if (values[index + 1] && !values[index + 1].startsWith("--")) parsed.set(key, values[++index]);
    else parsed.set(key, "true");
  }
  return parsed;
}

function safeFilePart(value) {
  const safe = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!safe) throw new Error("--preview-topic must contain at least one letter or number.");
  return safe;
}

function resolveProjectPath(requested) {
  const candidates = [
    requested,
    "tmp/browser-desktop-scenario-parity/city-of-bywater-project/project.json"
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Pass --project <project.json> or set PROVIDENCE_MANUAL_PROJECT to a project inside this workspace.");
  const relative = path.relative(root, found);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("The capture project must be inside the Providence workspace.");
  return found;
}

function workspacePath(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build"], {
      cwd: root,
      env: { ...process.env, BROWSER: "none" },
      stdio: "inherit",
      windowsHide: true
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Vite build failed with exit code ${code}.`)));
  });
}

async function startServer(port) {
  const appServer = http.createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const distRoot = path.join(root, "dist");
    const candidates = [
      safeResolve(distRoot, pathname === "/" ? "/index.html" : pathname),
      safeResolve(root, pathname),
      path.join(distRoot, "index.html")
    ];
    const file = candidates.find(isFile);
    if (!file) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => {
    appServer.once("error", reject);
    appServer.listen(port, "127.0.0.1", resolve);
  });
  return appServer;
}

function safeResolve(base, requestPath) {
  const candidate = path.resolve(base, path.normalize(`.${requestPath}`));
  const relative = path.relative(base, candidate);
  return relative.startsWith("..") || path.isAbsolute(relative) ? null : candidate;
}

function isFile(file) {
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
  if ([".js", ".mjs"].includes(extension)) return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".png") return "image/png";
  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".wasm") return "application/wasm";
  return "application/octet-stream";
}

function findOpenPort(start) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const probe = net.createServer();
      probe.unref();
      probe.once("error", (error) => error.code === "EADDRINUSE" ? tryPort(port + 1) : reject(error));
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(port)));
    };
    tryPort(start);
  });
}

async function launchBrowser() {
  const edge = [
    process.env.EDGE_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ].find((candidate) => candidate && fs.existsSync(candidate));
  if (!edge) throw new Error("Microsoft Edge was not found. Set EDGE_PATH to a Chromium-compatible browser.");
  const profile = path.join(root, "tmp", `manual-gallery-edge-${process.pid}-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });
  const port = await findOpenPort(9450);
  const processHandle = spawn(edge, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ], { stdio: "ignore", windowsHide: true });
  const targets = await waitFor(async () => {
    try {
      return await getJson(`http://127.0.0.1:${port}/json/list`);
    } catch {
      return null;
    }
  }, 20_000, "Timed out waiting for Edge debugging port.");
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("No Edge page target found.");
  return { process: processHandle, profileDir: profile, client: await connectCdp(page.webSocketDebuggerUrl) };
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

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();
    socket.onopen = () => resolve({
      send(method, params = {}) {
        return new Promise((accept, decline) => {
          const id = ++nextId;
          pending.set(id, { accept, decline });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
      close() { socket.close(); }
    });
    socket.onerror = reject;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.error) waiting.decline(new Error(message.error.message));
      else waiting.accept(message.result);
    };
  });
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime evaluation failed.");
  return result.result.value;
}

async function waitFor(check, timeoutMs, message) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await delay(200);
  }
  throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
