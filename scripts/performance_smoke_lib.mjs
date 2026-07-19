import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { closeBrowserProfile } from "./browser_profile_cleanup.mjs";

export const root = process.cwd();

export function parseArgs(argv = process.argv.slice(2)) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    args.set(key, inline ?? argv[index + 1] ?? "");
    if (inline == null && argv[index + 1] && !argv[index + 1].startsWith("--")) index += 1;
  }
  return args;
}

export function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export async function resolveBaseUrl(candidates, processes) {
  for (const candidate of candidates.filter(Boolean)) {
    const url = candidate.replace(/\/$/, "");
    if (await isHttpReady(url)) return url;
  }

  const devServer = spawn(npmCommand(), ["run", "dev"], {
    cwd: root,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  processes.push(devServer);
  devServer.stdout.on("data", (data) => process.stdout.write(`[dev] ${data}`));
  devServer.stderr.on("data", (data) => process.stderr.write(`[dev] ${data}`));

  const devUrl = "http://127.0.0.1:5178";
  await waitFor(async () => isHttpReady(devUrl), 30_000, "Timed out waiting for Vite dev server.");
  return devUrl;
}

export async function isHttpReady(url) {
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

export function createRunRoot(prefix = "performance") {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const dir = path.join(root, "tmp", "performance-smoke", `${prefix}-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadBudgets(file = path.join(root, "docs", "performance-budgets.json")) {
  return JSON.parse(fs.readFileSync(file, "utf8")).budgets;
}

export function projectUrl(baseUrl, projectFile) {
  if (projectFile.startsWith("http://") || projectFile.startsWith("https://")) return projectFile;
  const full = path.resolve(projectFile);
  const relative = path.relative(root, full).replace(/\\/g, "/");
  if (relative.startsWith("..")) throw new Error(`Project must be inside workspace for browser serving: ${full}`);
  return `${baseUrl}/${relative}`;
}

export function defaultProjectSpecs(explicitProjects = []) {
  const explicit = explicitProjects.filter(Boolean).map((file, index) => ({
    name: path.basename(path.dirname(file)) || `project-${index + 1}`,
    file,
    required: true
  }));
  if (explicit.length > 0) return explicit;
  return [
    {
      name: "Tutorial",
      file: findLatestProject(["Tutorial"], ["MapsAuthoring.providence", "ScriptsV2.providence", "TextAssets.providence"]),
      required: false
    },
    {
      name: "Destroy the Necronomicon",
      file: findLatestProject(["Destroy", "Necronomicon"], []),
      required: false
    }
  ];
}

export function findLatestProject(nameNeedles, pathNeedles, roots = defaultUiProjectRoots()) {
  const matches = [];
  for (const searchRoot of roots) visit(searchRoot);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.file ?? null;

  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name === "project.json" && projectMatches(full)) matches.push({ file: full, mtimeMs: fs.statSync(full).mtimeMs });
    }
  }

  function projectMatches(file) {
    const normalized = file.toLowerCase();
    const nameOk = nameNeedles.length === 0 || nameNeedles.some((needle) => normalized.includes(needle.toLowerCase()));
    const pathOk = pathNeedles.length === 0 || pathNeedles.some((needle) => normalized.includes(needle.toLowerCase()));
    return nameOk && pathOk;
  }
}

function defaultUiProjectRoots() {
  return [
    path.join(root, "tmp", "desktop-ui-harness"),
    path.join(root, "projects")
  ];
}

export function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Microsoft Edge was not found. Set EDGE_PATH to a Chromium-compatible browser.");
  return found;
}

export async function launchBrowser(processes, windowSize = "1500,1050") {
  const userDataDir = path.join(root, "tmp", "ui-performance-edge-profile", `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const port = 9451 + Math.floor(Math.random() * 300);
  const browserProcess = spawn(findEdge(), [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--disable-background-mode",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${windowSize}`
  ], { stdio: "ignore", windowsHide: true });
  processes.push(browserProcess);
  try {
    const targets = await waitFor(async () => {
      try {
        return await getJson(`http://127.0.0.1:${port}/json/list`);
      } catch {
        return null;
      }
    }, 20_000, "Timed out waiting for Edge debugging port.");
    const pageTarget = targets.find((target) => target.type === "page");
    if (!pageTarget) throw new Error("No Edge page target found.");
    return {
      client: await connectCdp(pageTarget.webSocketDebuggerUrl),
      processHandle: browserProcess,
      profileDir: userDataDir
    };
  } catch (error) {
    await closeBrowserProfile({ processHandle: browserProcess, profileDir: userDataDir });
    throw error;
  }
}

export async function preparePage(client, url) {
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable").catch(() => {});
  await client.send("Performance.enable").catch(() => {});
  client.clearEvents?.();
  await client.send("Page.navigate", { url });
  await waitFor(async () => await evalValue(client, "Boolean(document.body?.innerText.includes('Realmz Providence'))"), 45_000, "Timed out waiting for Providence shell.");
  await evalValue(client, LONG_TASK_OBSERVER_SOURCE);
}

export async function measureInteraction(client, label, budgetKey, budgets, actionExpression, settleExpression = "true", options = {}) {
  await evalValue(client, "__providencePerf.clearLongTasks()");
  const started = await evalValue(client, "performance.now()");
  const actionResult = await evalValue(client, actionExpression);
  const actionEnded = await evalValue(client, "performance.now()");
  if (actionResult === false) {
    return {
      label,
      budgetKey,
      durationMs: Math.round(actionEnded - started),
      status: "pass",
      actionResult,
      longTasks: [],
      maxLongTaskMs: 0,
      longTaskStatus: "pass"
    };
  }
  await waitFor(async () => await evalValue(client, `Boolean(${settleExpression})`), 20_000, `Timed out settling ${label}.`);
  const settled = await evalValue(client, "performance.now()");
  await settleFrames(client);
  const ended = await evalValue(client, "performance.now()");
  const longTasks = await evalValue(client, "__providencePerf.longTasks()");
  const durationMs = Math.round(ended - started);
  const phaseDurations = {
    actionMs: Math.round(actionEnded - started),
    settleMs: Math.round(settled - actionEnded),
    frameSettleMs: Math.round(ended - settled)
  };
  const budgetDurationKind = options.budgetDuration ?? "total";
  const budgetDurationMs = budgetDurationKind === "actionAndSettle"
    ? phaseDurations.actionMs + phaseDurations.settleMs
    : durationMs;
  const durationStatus = budgetStatus(budgetDurationMs, budgets[budgetKey]);
  const maxLongTaskMs = Math.round(Math.max(0, ...longTasks.map((task) => task.duration)));
  const longTaskStatus = budgetStatus(maxLongTaskMs, budgets.longTask);
  const status = worstBudgetStatus(durationStatus, longTaskStatus);
  return {
    label,
    budgetKey,
    durationMs,
    budgetDurationMs,
    budgetDurationKind,
    status,
    durationStatus,
    actionResult,
    phaseDurations,
    longTasks,
    maxLongTaskMs,
    longTaskStatus
  };
}

export async function clickSelector(client, selector) {
  const point = await evalValue(client, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      element.scrollIntoView({ block: "center", inline: "center" });
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()
  `);
  if (!point) return false;
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, button: "none" });
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
  return true;
}

export async function settleFrames(client) {
  await evalValue(client, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await evalValue(client, "new Promise((resolve) => setTimeout(resolve, 0))");
}

export function budgetStatus(durationMs, budget) {
  if (!budget) return "pass";
  if (durationMs >= budget.failMs) return "fail";
  if (durationMs >= budget.warnMs) return "warn";
  return "pass";
}

function worstBudgetStatus(...statuses) {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

export function summarizeReport(report) {
  const probes = report.scenarios.flatMap((scenario) => scenario.probes ?? []);
  const measured = probes.filter((probe) => !probe.skipped);
  const failed = measured.filter((probe) => probe.status === "fail" || probe.longTaskStatus === "fail");
  const failedSet = new Set(failed);
  const warned = measured.filter((probe) => !failedSet.has(probe) && (probe.status === "warn" || probe.longTaskStatus === "warn"));
  const classified = (classification) => measured.filter((probe) => probe.classification === classification).length;
  const summarizeDebug = (debug) => {
    if (!debug) return null;
    const { bodyPreview: _bodyPreview, ...summary } = debug;
    return summary;
  };
  return {
    ok: failed.length === 0,
    failed: failed.length,
    warned: warned.length,
    functionalFailures: classified("functional-failure"),
    performanceFailures: classified("performance-failure"),
    performanceWarnings: classified("performance-warning"),
    measured: measured.length,
    skipped: probes.length - measured.length + report.scenarios.filter((scenario) => scenario.skipped).length,
    failedProbes: failed.map((probe) => ({
      label: probe.label,
      budgetKey: probe.budgetKey,
      classification: probe.classification ?? "unclassified",
      durationMs: probe.durationMs,
      budgetDurationMs: probe.budgetDurationMs ?? null,
      durationStatus: probe.durationStatus ?? probe.status,
      maxLongTaskMs: probe.maxLongTaskMs ?? 0,
      longTaskStatus: probe.longTaskStatus ?? "pass",
      error: probe.error ?? null,
      debug: summarizeDebug(probe.debug)
    })),
    warnedProbes: warned.map((probe) => ({
      label: probe.label,
      budgetKey: probe.budgetKey,
      classification: probe.classification ?? "unclassified",
      durationMs: probe.durationMs,
      budgetDurationMs: probe.budgetDurationMs ?? null,
      durationStatus: probe.durationStatus ?? probe.status,
      maxLongTaskMs: probe.maxLongTaskMs ?? 0,
      longTaskStatus: probe.longTaskStatus ?? "pass",
      debug: summarizeDebug(probe.debug)
    }))
  };
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

export function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const events = [];
    const handlers = new Map();
    const client = {
      send(method, params = {}) {
        return new Promise((res, rej) => {
          const message = { id: ++id, method, params };
          pending.set(id, { res, rej });
          ws.send(JSON.stringify(message));
        });
      },
      on(method, handler) {
        const current = handlers.get(method) ?? [];
        current.push(handler);
        handlers.set(method, current);
      },
      events(methods = null) {
        if (!methods) return events.slice();
        const wanted = new Set(Array.isArray(methods) ? methods : [methods]);
        return events.filter((entry) => wanted.has(entry.method));
      },
      clearEvents() {
        events.length = 0;
      },
      close() {
        ws.close();
      }
    };
    ws.onopen = () => resolve(client);
    ws.onerror = reject;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        const entry = {
          method: message.method,
          params: message.params,
          receivedAt: new Date().toISOString()
        };
        events.push(entry);
        if (events.length > 300) events.shift();
        for (const handler of handlers.get(message.method) ?? []) handler(message.params, entry);
        return;
      }
      if (!pending.has(message.id)) return;
      const { res, rej } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rej(new Error(message.error.message));
      else res(message.result);
    };
  });
}

export async function evalValue(client, expression) {
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

export async function waitFor(check, timeoutMs, message) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(typeof message === "function" ? await message() : message);
}

const LONG_TASK_OBSERVER_SOURCE = `
  (() => {
    if (window.__providencePerf) return true;
    const longTasks = [];
    window.__providencePerf = {
      clearLongTasks() { longTasks.length = 0; },
      longTasks() { return longTasks.slice(); }
    };
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({
            name: entry.name,
            startTime: Math.round(entry.startTime),
            duration: Math.round(entry.duration)
          });
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // Long Task API is unavailable in some modes; duration probes still run.
    }
    return true;
  })()
`;
