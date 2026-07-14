import os from "node:os";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import {
  createRunRoot,
  defaultProjectSpecs,
  evalValue,
  launchBrowser,
  loadBudgets,
  measureInteraction,
  preparePage,
  resolveBaseUrl,
  root,
  summarizeReport,
  waitFor,
  writeJson
} from "./performance_smoke_lib.mjs";

const args = parseArgs(process.argv.slice(2));
const processes = [];
const projectServers = [];
const keepBrowser = args.has("keep-browser");
const baseUrlCandidates = [
  args.get("base-url"),
  process.env.PROVIDENCE_UI_BASE_URL,
  "http://127.0.0.1:5178",
  "http://localhost:5178",
  "http://localhost:8789"
].filter(Boolean);

try {
  const baseUrl = await resolveBaseUrl(baseUrlCandidates, processes);
  const budgets = loadBudgets(args.get("budget") || path.join(root, "docs", "performance-budgets.json"));
  let explicitProjects = splitProjects(args.get("project") || process.env.PROVIDENCE_UI_PROJECT || "");
  const importedCombatBenchmark = args.has("combat-imported-benchmark");
  const combatBenchmark = args.has("combat-benchmark");
  if (importedCombatBenchmark) {
    const sourceProject = explicitProjects[0] || findImportedCombatBenchmarkSourceProject() || findCombatBenchmarkSourceProject();
    explicitProjects = [prepareCombatImportedBenchmarkProject(sourceProject)];
  } else if (combatBenchmark) {
    const sourceProject = explicitProjects[0] || findCombatBenchmarkSourceProject();
    explicitProjects = [prepareCombatBenchmarkProject(sourceProject)];
  }
  const projectSpecs = defaultProjectSpecs(explicitProjects).map((spec) => ({
    ...spec,
    combatOnly: importedCombatBenchmark || combatBenchmark,
    importedCombatBenchmark
  }));
  const runRoot = createRunRoot("ui");
  const report = {
    version: 1,
    startedAt: new Date().toISOString(),
    host: os.hostname(),
    baseUrl,
    budgets,
    scenarios: []
  };

  for (const spec of projectSpecs) {
    if (!spec.file) {
      report.scenarios.push({
        name: spec.name,
        skipped: true,
        reason: "No benchmark project found. Pass --project <project.json> or generate smoke artifacts first."
      });
      continue;
    }
    const scenario = await runScenario({ baseUrl, budgets, spec, projectServers });
    report.scenarios.push(scenario);
  }

  report.summary = summarizeReport(report);
  const reportPath = path.join(runRoot, "ui-performance-report.json");
  writeJson(reportPath, report);
  console.log(JSON.stringify({ ...report.summary, reportPath }, null, 2));
  if (!report.summary.ok) process.exitCode = 1;
} finally {
  for (const proc of processes) {
    const args = proc.spawnargs?.join(" ") ?? "";
    if (keepBrowser && args.includes("remote-debugging-port")) continue;
    try {
      proc.kill();
    } catch {
      // Process may already have exited.
    }
  }
  for (const server of projectServers) {
    await new Promise((resolve) => server.close(resolve));
  }
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    if (inline != null) {
      parsed.set(key, inline);
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      parsed.set(key, argv[index + 1]);
      index += 1;
    } else {
      parsed.set(key, "");
    }
  }
  return parsed;
}

function splitProjects(value) {
  return value
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function runScenario({ baseUrl, budgets, spec, projectServers }) {
  const client = await launchBrowser(processes);
  const benchmarkProjectUrl = await servedBenchmarkProjectUrl(spec.file, projectServers);
  const scenario = {
    name: spec.name,
    project: spec.file,
    projectUrl: benchmarkProjectUrl,
    probes: []
  };
  const url = `${baseUrl}/?benchmarkProject=${encodeURIComponent(scenario.projectUrl)}&benchmarkScripts=1&benchmarkCombat=1&_perf=${Date.now()}`;
  const openedAt = Date.now();
  try {
    await assertProjectUrlServesJson(scenario.projectUrl);
    await preparePage(client, url);
    const shellAt = Date.now();
    await waitForProjectLoaded(client);
    const projectReadyAt = Date.now();
    const coldOpenMs = projectReadyAt - openedAt;
    const browserVersion = await client.send("Browser.getVersion").catch(() => null);
    scenario.browser = browserVersion?.product ?? "unknown";
    scenario.viewport = await evalValue(client, "({ width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio })");
    await pushProbe(client, scenario, {
      label: "Cold project open",
      budgetKey: "coldProjectOpen",
      durationMs: coldOpenMs,
      status: budgetStatus(coldOpenMs, budgets.coldProjectOpen),
      phaseDurations: {
        shellMs: shellAt - openedAt,
        projectReadyMs: projectReadyAt - shellAt
      },
      longTasks: [],
      maxLongTaskMs: 0,
      longTaskStatus: "pass"
    });

    if (spec.combatOnly) {
      await runCombatProbes(client, budgets, scenario, { importedHeavy: Boolean(spec.importedCombatBenchmark) });
    } else {
      await runToolSwitches(client, budgets, scenario);
      await runAssetsProbes(client, budgets, scenario);
      await runApProbes(client, budgets, scenario);
      await runMapProbes(client, budgets, scenario);
      await runCombatProbes(client, budgets, scenario);
      await runSearchProbes(client, budgets, scenario);
    }
    scenario.combatPerf = await combatPerfDiagnostics(client).catch(() => []);
  } catch (error) {
    const diagnostics = {
      ...(await pageDiagnostics(client).catch(() => ({}))),
      browserEvents: browserEventDiagnostics(client)
    };
    await pushProbe(client, scenario, {
      label: "Scenario run",
      budgetKey: "coldProjectOpen",
      durationMs: 0,
      status: "fail",
      failureKind: "functional",
      error: String(error?.message ?? error),
      diagnostics,
      longTasks: [],
      maxLongTaskMs: 0,
      longTaskStatus: "pass"
    });
  } finally {
    if (!keepBrowser) client.close();
  }
  return scenario;
}

async function servedBenchmarkProjectUrl(projectFile, servers) {
  if (projectFile.startsWith("http://") || projectFile.startsWith("https://")) {
    return projectFile;
  }
  const full = path.resolve(projectFile);
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method !== "GET" || url.pathname !== "/project.json") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    fs.createReadStream(full).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate benchmark project server port.");
  }
  return `http://127.0.0.1:${address.port}/project.json`;
}

async function pageDiagnostics(client) {
  return evalValue(client, `
    (() => ({
      href: location.href,
      title: document.title,
      bodyText: (document.body?.innerText ?? "").slice(0, 2000),
      combatPerf: window.__providenceCombatPerf ?? []
    }))()
  `);
}

async function combatPerfDiagnostics(client) {
  return evalValue(client, "(window.__providenceCombatPerf ?? []).slice(-200)");
}

async function waitForProjectLoaded(client) {
  await waitFor(async () => {
    const state = await evalValue(client, `
    (() => {
      const text = document.body.innerText;
      return {
        failed: text.includes("Benchmark project load failed"),
        failureText: (text.match(/Benchmark project load failed:[^\\n]+/) ?? [])[0] ?? "",
        loaded: Boolean(document.querySelector(".domain-rail"))
          && Boolean(document.querySelector(".rail-tool.domain-combat"))
          && !text.includes("No project loaded")
          && !text.includes("Awaiting project")
      };
    })()
  `);
    if (state.failed) throw new Error(state.failureText || "Benchmark project load failed.");
    return state.loaded;
  }, 60_000, "Timed out waiting for benchmark project.");
}

async function assertProjectUrlServesJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    try {
      JSON.parse(text);
    } catch {
      const preview = text.slice(0, 80).replace(/\s+/g, " ").trim();
      throw new Error(`Benchmark project URL did not return JSON: ${preview}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function runToolSwitches(client, budgets, scenario) {
  const domains = [
    ["maps", "Map"],
    ["scripts", "AP"],
    ["scenario", "Scenario"],
    ["encounters", "Encounters"],
    ["combat", "Combat"],
    ["economy", "Economy"],
    ["rules", "Rules"],
    ["assets", "Assets"],
    ["text", "Text"],
    ["linter", "Linter"],
    ["export", "Export"]
  ];
  for (const [domain] of domains) {
    await warmDomain(client, domain);
  }
  await evalValue(client, "new Promise((resolve) => setTimeout(resolve, 1500))");
  for (const [domain, label] of domains) {
    await probe(client, scenario, budgets, `Switch to ${label}`, domain === "scripts" ? "largeApOpen" : "toolSwitch", `
      (() => {
        const button = document.querySelector(".rail-tool.domain-${domain}");
        button?.click();
        return Boolean(button);
      })()
    `, `document.querySelector(".rail-tool.domain-${domain}.active") && !document.body.innerText.includes("Loading editor section")`);
  }
}

async function runApProbes(client, budgets, scenario) {
  await warmDomain(client, "scripts");
  await probe(client, scenario, budgets, "AP tab open", "largeApOpen", `
    (() => new Promise((resolve) => {
      document.querySelector(".rail-tool.domain-scripts")?.click();
      requestAnimationFrame(() => {
        const tab = [...document.querySelectorAll(".script-editor-tabs button")]
          .find((button) => button.textContent?.includes("Action Points"));
        tab?.click();
        resolve(Boolean(tab));
      });
    }))()
  `, `document.querySelector(".rail-tool.domain-scripts.active") && document.body.innerText.includes("Action Points")`);

  await probe(client, scenario, budgets, "AP filter change", "search", `
    (() => {
      const input = document.querySelector(".script-list-filter");
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Action Point 1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `, `document.querySelector(".script-list-filter")?.value === "Action Point 1"`);

  await probe(client, scenario, budgets, "AP record selection", "recordSelection", `
    (async () => {
      const input = document.querySelector(".script-list-filter");
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const button = [...document.querySelectorAll(".realmz-script-list button")]
        .find((candidate) => !candidate.classList.contains("selected"));
      button?.click();
      return Boolean(button);
    })()
  `, `document.querySelector(".realmz-script-list button.selected")`);

  await probe(client, scenario, budgets, "AP step move down", "recordSelection", `
    (() => {
      const card = [...document.querySelectorAll(".realmz-step-card")]
        .find((candidate) => !candidate.textContent?.toLowerCase().includes("empty")) || document.querySelector(".realmz-step-card");
      card?.click();
      const button = [...document.querySelectorAll("button[title]")]
        .find((candidate) => candidate.getAttribute("title")?.toLowerCase().includes("move step down") && !candidate.disabled);
      button?.click();
      return Boolean(button);
    })()
  `, `document.querySelector(".realmz-step-card.selected")`);

  await probe(client, scenario, budgets, "AP target picker open", "targetPickerOpen", `
    (async () => {
      const directTargetLabels = [
        "show message",
        "sound",
        "picture",
        "simple encounter",
        "complex encounter",
        "shop",
        "treasure",
        "extra ap",
        "extra action point",
        "map item",
        "quest",
        "monster"
      ];
      const card = [...document.querySelectorAll(".realmz-step-card")]
        .find((candidate) => {
          const text = candidate.textContent?.toLowerCase() ?? "";
          if (text.includes("empty")) return false;
          return directTargetLabels.some((label) => text.includes(label));
        });
      card?.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const input = document.querySelector(".realmz-target-picker input");
      if (!input) return false;
      input.focus();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return document.activeElement === input;
    })()
  `, `document.activeElement === document.querySelector(".realmz-target-picker input")`);
}

async function runMapProbes(client, budgets, scenario) {
  await warmDomain(client, "maps");
  await evalValue(client, `
    (() => {
      localStorage.setItem("providence.mapWorkbenchMode.v1", "canvas");
      const canvasButton = [...document.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Canvas");
      canvasButton?.click();
      const paint = [...document.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Paint");
      paint?.click();
      return true;
    })()
  `);
  await waitFor(async () => evalValue(client, `Boolean(document.querySelector(".room-canvas-overlay"))`), 20_000, "Map canvas was unavailable for paint benchmark.");
  await evalValue(client, `
    (() => {
      const canvas = document.querySelector(".room-canvas-overlay");
      if (!canvas) return false;
      canvas.scrollIntoView({ block: "center", inline: "center" });
      const rect = canvas.getBoundingClientRect();
      const start = { x: rect.left + Math.min(140, rect.width * 0.35), y: rect.top + Math.min(140, rect.height * 0.35) };
      window.__providencePerfPaintTarget = {
        start,
        end: { x: start.x + 44, y: start.y + 36 }
      };
      return true;
    })()
  `);
  await probe(client, scenario, budgets, "Map paint drag and release", "mapPaintRelease", `
    (() => {
      const canvas = document.querySelector(".room-canvas-overlay");
      const target = window.__providencePerfPaintTarget;
      if (!canvas || !target) return false;
      window.__providencePerfPaintBefore = {
        mapId: canvas.getAttribute("data-map-id"),
        tileRevision: canvas.getAttribute("data-map-tiles-revision")
      };
      const paint = [...document.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Paint");
      paint?.click();
      const down = new PointerEvent("pointerdown", { bubbles: true, clientX: target.start.x, clientY: target.start.y, pointerId: 1, buttons: 1 });
      const move = new PointerEvent("pointermove", { bubbles: true, clientX: target.end.x, clientY: target.end.y, pointerId: 1, buttons: 1 });
      const up = new PointerEvent("pointerup", { bubbles: true, clientX: target.end.x, clientY: target.end.y, pointerId: 1, buttons: 0 });
      canvas.dispatchEvent(down);
      canvas.dispatchEvent(move);
      canvas.dispatchEvent(up);
      return true;
    })()
  `, `
    (() => {
      const active = document.querySelector(".rail-tool.domain-maps.active");
      const canvas = document.querySelector(".room-canvas-overlay");
      if (!active || !canvas || !window.__providencePerfPaintBefore) return false;
      window.__providencePerfPaintAfter = {
        mapId: canvas.getAttribute("data-map-id"),
        tileRevision: canvas.getAttribute("data-map-tiles-revision")
      };
      return window.__providencePerfPaintAfter.mapId === window.__providencePerfPaintBefore.mapId &&
        window.__providencePerfPaintAfter.tileRevision !== window.__providencePerfPaintBefore.tileRevision;
    })()
  `, { budgetDuration: "actionAndSettle" });
}

async function runCombatProbes(client, budgets, scenario, { importedHeavy = false } = {}) {
  await warmDomain(client, "combat");
  await waitFor(
    async () => evalValue(client, `Boolean(document.querySelector(".combat-tabs")) && !document.body.innerText.includes("Loading editor section")`),
    importedHeavy ? 180_000 : 30_000,
    "Timed out waiting for the Combat editor to finish loading."
  );
  const combatAvailability = await evalValue(client, `
    (() => {
      const countFor = (label) => {
        const button = [...document.querySelectorAll(".combat-tabs button")]
          .find((candidate) => candidate.textContent?.includes(label));
        const text = button?.textContent ?? "";
        return Number(text.match(/(\\d+)/)?.[1] ?? 0);
      };
      return {
        battles: countFor("Battles"),
        monsters: countFor("Monsters"),
        iconSet: countFor("Icon Set")
      };
    })()
  `);
  const skipCombatProbe = async (label, budgetKey, reason) => pushProbe(client, scenario, {
    label,
    budgetKey,
    durationMs: 0,
    status: "skip",
    skipped: true,
    reason,
    longTasks: [],
    maxLongTaskMs: 0,
    longTaskStatus: "pass"
  });
  const hasBattles = Number(combatAvailability?.battles ?? 0) > 0;
  const hasScenarioMonsters = Number(combatAvailability?.monsters ?? 0) > 0;

  if (!hasBattles) {
    await skipCombatProbe("Combat Battles tab open", "toolSwitch", "Project has no battle records to open.");
    await skipCombatProbe("Combat dense battle readiness", "recordSelection", "Project has no battle records to benchmark.");
    await skipCombatProbe("Combat battle header input", "recordSelection", "Project has no battle records to edit.");
    await skipCombatProbe(importedHeavy ? "Combat battle hover and select" : "Combat dense grid paint", "combatGridEdit", "Project has no battle records to paint.");
    if (importedHeavy) {
      await skipCombatProbe("Combat monster palette scroll", "recordSelection", "Project has no battle records for the imported-heavy battle palette probe.");
      await skipCombatProbe("Combat dense grid single paint", "combatGridEdit", "Project has no battle records to paint.");
      await skipCombatProbe("Combat dense grid drag paint", "combatGridEdit", "Project has no battle records to paint.");
    }
  } else {
  await probe(client, scenario, budgets, "Combat Battles tab open", "toolSwitch", `
    (() => {
      const battleTab = [...document.querySelectorAll(".combat-tabs button")]
        .find((button) => button.textContent?.includes("Battles"));
      battleTab?.click();
      return Boolean(battleTab);
    })()
  `, `document.querySelector(".battle-board") && !document.body.innerText.includes("Loading editor section")`);
  await waitForCombatPreviews(client, "Timed out waiting for combat images.", { strict: false, timeoutMs: 10_000 });
  await evalValue(client, `
    (() => {
      window.__combatPlacedCount = () => {
        const text = document.querySelector(".battle-board-card header b")?.textContent ?? "";
        return Number(text.match(/(\\d+)\\s*\\/\\s*100/)?.[1] ?? 0);
      };
      window.__combatDenseBattleReady = window.__combatPlacedCount() >= 50;
      return true;
    })()
  `);
  const warmedBattleImages = await waitForCombatPreviews(client, "Timed out waiting for warmed battle images.", { strict: false, timeoutMs: 5_000 });
  if (!warmedBattleImages) {
    await pushProbe(client, scenario, {
      label: "Combat warmed image readiness",
      budgetKey: "recordSelection",
      durationMs: 0,
      status: "skip",
      skipped: true,
      reason: "Visible lazy battle previews did not all report ready during warm-up.",
      longTasks: [],
      maxLongTaskMs: 0,
      longTaskStatus: "pass"
    });
  }
  await evalValue(client, "new Promise((resolve) => setTimeout(resolve, 350))");
  await probe(client, scenario, budgets, "Combat dense battle readiness", "recordSelection", `
    (() => {
      window.__combatDenseBattleReady = window.__combatPlacedCount?.() >= 50;
      return Boolean(document.querySelector(".battle-board"));
    })()
  `, `window.__combatDenseBattleReady === true`);

  await probe(client, scenario, budgets, "Combat battle header input", "recordSelection", `
    (() => {
      const input = document.querySelector(".battle-header-fields .combat-distance-field input");
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      const next = String((Number(input.value) || 0) + 1);
      window.__combatHeaderInputValue = next;
      setter?.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `, `document.querySelector(".battle-header-fields .combat-distance-field input")?.value === window.__combatHeaderInputValue`);

  if (importedHeavy) {
    await probe(client, scenario, budgets, "Combat monster palette scroll", "recordSelection", `
      (() => {
        const palette = document.querySelector(".monster-brush-palette");
        if (!palette) return false;
        window.__combatPaletteScrollBefore = palette.scrollTop;
        palette.scrollTop = Math.min(palette.scrollHeight, palette.scrollTop + 480);
        palette.dispatchEvent(new Event("scroll", { bubbles: true }));
        return true;
      })()
    `, `document.querySelector(".monster-brush-palette") && document.querySelectorAll(".monster-brush-palette button").length > 0`);

    await probe(client, scenario, budgets, "Combat battle hover and select", "combatGridEdit", `
      (() => {
        const select = [...document.querySelectorAll(".placement-mode-controls button")]
          .find((button) => button.textContent?.includes("Select"));
        select?.click();
        const board = document.querySelector("[data-battle-board-canvas='true']");
        if (!board) return false;
        const rect = board.getBoundingClientRect();
        const point = (col, row) => ({
          clientX: rect.left + ((col + 0.5) / 13) * rect.width,
          clientY: rect.top + ((row + 0.5) / 13) * rect.height
        });
        const coords = point(0, 0);
        board.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 93, pointerType: "mouse", buttons: 0, ...coords }));
        board.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 93, pointerType: "mouse", buttons: 1, ...coords }));
        board.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 93, pointerType: "mouse", buttons: 0, ...coords }));
        window.__combatHoverSelectDone = true;
        return true;
      })()
    `, `window.__combatHoverSelectDone === true && document.querySelector(".selected-battle-cell")`);

    await probe(client, scenario, budgets, "Combat dense grid single paint", "combatGridEdit", `
      (() => {
        const before = window.__combatPlacedCount?.() ?? 0;
        window.__combatGridSingleBefore = before;
        if (before >= 100) return false;
        const palette = document.querySelector(".monster-brush-palette");
        const board = document.querySelector("[data-battle-board-canvas='true']");
        if (!palette || !board) return false;
        palette.scrollTop = 0;
        palette.dispatchEvent(new Event("scroll", { bubbles: true }));
        window.setTimeout(() => {
          const brush = document.querySelector(".monster-brush-palette [data-monster-brush-id='1']") ??
            document.querySelector(".monster-brush-palette button");
          if (!brush) return;
          brush.click();
          const paint = [...document.querySelectorAll(".placement-mode-controls button")]
            .find((button) => button.textContent?.includes("Paint"));
          paint?.click();
          window.requestAnimationFrame(() => {
            const rect = board.getBoundingClientRect();
            const coords = {
              clientX: rect.left + ((12.5) / 13) * rect.width,
              clientY: rect.top + ((12.5) / 13) * rect.height
            };
            board.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 94, pointerType: "mouse", buttons: 1, ...coords }));
            board.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 94, pointerType: "mouse", buttons: 0, ...coords }));
          });
        }, 0);
        return true;
      })()
    `, `(window.__combatPlacedCount?.() ?? 0) > (window.__combatGridSingleBefore ?? 0)`);

    await probe(client, scenario, budgets, "Combat dense grid drag paint", "combatGridEdit", `
      (() => {
        const before = window.__combatPlacedCount?.() ?? 0;
        window.__combatGridDragBefore = before;
        if (before >= 99) return false;
        const palette = document.querySelector(".monster-brush-palette");
        if (palette) {
          palette.scrollTop = 0;
          palette.dispatchEvent(new Event("scroll", { bubbles: true }));
        }
        const brush = document.querySelector(".monster-brush-palette [data-monster-brush-id='1']") ??
          document.querySelector(".monster-brush-palette button");
        brush?.click();
        const paint = [...document.querySelectorAll(".placement-mode-controls button")]
          .find((button) => button.textContent?.includes("Paint"));
        paint?.click();
        const board = document.querySelector("[data-battle-board-canvas='true']");
        if (!brush || !board) return false;
        const rect = board.getBoundingClientRect();
        const point = (col, row) => ({
          clientX: rect.left + ((col + 0.5) / 13) * rect.width,
          clientY: rect.top + ((row + 0.5) / 13) * rect.height
        });
        const fire = (type, col, row, buttons) => {
          board.dispatchEvent(new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 95,
            pointerType: "mouse",
            buttons,
            ...point(col, row)
          }));
        };
        window.requestAnimationFrame(() => {
          fire("pointerdown", 11, 12, 1);
          fire("pointermove", 10, 12, 1);
          fire("pointerup", 10, 12, 0);
        });
        return true;
      })()
    `, `(window.__combatPlacedCount?.() ?? 0) > (window.__combatGridDragBefore ?? 0)`);
  } else {
    await probe(client, scenario, budgets, "Combat dense grid paint", "combatGridEdit", `
    (() => {
      const before = window.__combatPlacedCount?.() ?? 0;
      window.__combatGridBefore = before;
      if (before >= 100) return false;
      const brush = document.querySelector(".monster-brush-palette button");
      brush?.click();
      const board = document.querySelector("[data-battle-board-canvas='true']");
      if (!brush || !board) return false;
      const rect = board.getBoundingClientRect();
      const point = (col, row) => ({
        clientX: rect.left + ((col + 0.5) / 13) * rect.width,
        clientY: rect.top + ((row + 0.5) / 13) * rect.height
      });
      const fire = (type, col, row, buttons) => {
        const coords = point(col, row);
        board.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 91,
          pointerType: "mouse",
          buttons,
          ...coords
        }));
      };
      setTimeout(() => {
        fire("pointerdown", 12, 12, 1);
        fire("pointermove", 11, 12, 1);
        fire("pointerup", 11, 12, 0);
      }, 0);
      return true;
    })()
  `, `(window.__combatPlacedCount?.() ?? 0) > (window.__combatGridBefore ?? 0)`);
  }
  }

  if (!hasScenarioMonsters) {
    await skipCombatProbe("Combat Monsters tab open", "toolSwitch", "Project has no scenario monster records to open.");
    for (const probeIndex of [1, 2, 3]) {
      await skipCombatProbe(`Combat scenario monster selection ${probeIndex}`, "recordSelection", "Project has no scenario monster records to select.");
    }
    return;
  }
  await probe(client, scenario, budgets, "Combat Monsters tab open", "toolSwitch", `
    (() => {
      const monsterTab = [...document.querySelectorAll(".combat-tabs button")]
        .find((button) => button.textContent?.includes("Monsters"));
      monsterTab?.click();
      return Boolean(monsterTab);
    })()
  `, `document.querySelector(".scenario-monster-list .combat-record-scroll button") && !document.body.innerText.includes("Loading editor section")`);

  for (const [probeIndex, targetIndex] of [1, 24, 72].entries()) {
    await probe(client, scenario, budgets, `Combat scenario monster selection ${probeIndex + 1}`, "recordSelection", `
      (() => {
      const buttons = [...document.querySelectorAll(".scenario-monster-list .combat-record-scroll button")];
      if (buttons.length < 3) return false;
      const button = buttons[Math.min(${targetIndex}, buttons.length - 1)];
      button.scrollIntoView({ block: "center", inline: "nearest" });
      window.__combatMonsterSelectionText = button.textContent ?? "";
      button.click();
      return Boolean(button);
    })()
    `, `document.querySelector(".scenario-monster-list button.selected")?.textContent === window.__combatMonsterSelectionText && document.querySelector(".monster-editor")`);
  }
}

async function waitForCombatPreviews(client, message, { strict = true, timeoutMs = 20_000 } = {}) {
  try {
    await waitFor(async () => evalValue(client, `
    (() => {
      if (!document.querySelector(".rail-tool.domain-combat.active")) return false;
      const combatReady = !document.body.innerText.includes("Loading editor section");
      const previews = [...document.querySelectorAll("[data-combat-preview='monster-icon']")];
      const visiblePreviews = previews.filter((preview) => {
        const rect = preview.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
      });
      if (visiblePreviews.length === 0) return combatReady;
      return visiblePreviews.every((preview) => {
        if (preview.getAttribute("data-combat-preview-ready") === "true") return true;
        const img = preview.querySelector("img");
        return Boolean(img?.complete);
      });
    })()
  `), timeoutMs, message);
    return true;
  } catch (error) {
    if (strict) throw error;
    return false;
  }
}

async function runSearchProbes(client, budgets, scenario) {
  const probes = [
    ["text", "Text search"],
    ["assets", "Assets search"],
    ["rules", "Rules search"]
  ];
  for (const [domain, label] of probes) {
    await warmDomain(client, domain);
    await probe(client, scenario, budgets, label, "search", `
      (() => {
        const input = [...document.querySelectorAll("input")]
          .find((candidate) => /search|filter/i.test(candidate.placeholder || candidate.getAttribute("aria-label") || ""));
        if (!input) return false;
        input.focus();
        input.value = "a";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()
    `, `document.querySelector(".rail-tool.domain-${domain}.active")`);
  }
}

async function runAssetsProbes(client, budgets, scenario) {
  await warmDomain(client, "assets");
  await probe(client, scenario, budgets, "Assets switch to reference libraries", "assetSectionSwitch", `
    (() => {
      const tab = [...document.querySelectorAll(".asset-section-tabs button")]
        .find((button) => button.textContent?.includes("Reference Assets"));
      tab?.click();
      return Boolean(tab);
    })()
  `, `document.querySelector(".library-asset-strip") && document.body.innerText.includes("Reference Assets")`);

  await probe(client, scenario, budgets, "Assets reference card selection", "assetCardSelection", `
    (() => {
      const card = [...document.querySelectorAll(".library-asset-strip .managed-asset-card")]
        .find((candidate) => !candidate.classList.contains("selected"));
      card?.click();
      return Boolean(card);
    })()
  `, `document.querySelector(".asset-selection-inspector strong") && document.querySelector(".library-asset-strip .managed-asset-card.selected")`);

  await probe(client, scenario, budgets, "Assets reference page size change", "assetSectionSwitch", `
    (() => {
      const select = document.querySelector('select[aria-label="Assets per page"]');
      if (!select) return false;
      select.value = "200";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()
  `, `document.querySelector('select[aria-label="Assets per page"]')?.value === "200"`);

  await probe(client, scenario, budgets, "Assets switch to scenario assets", "assetSectionSwitch", `
    (() => {
      const tab = [...document.querySelectorAll(".asset-section-tabs button")]
        .find((button) => button.textContent?.includes("Scenario Assets"));
      tab?.click();
      return Boolean(tab);
    })()
  `, `document.querySelector(".asset-gallery") && document.body.innerText.includes("Scenario Assets")`);

  await probe(client, scenario, budgets, "Assets scenario card selection", "assetCardSelection", `
    (() => {
      const card = [...document.querySelectorAll(".asset-gallery .managed-asset-card")]
        .find((candidate) => !candidate.classList.contains("selected"));
      card?.click();
      return Boolean(card);
    })()
  `, `document.querySelector(".asset-selection-inspector strong") && document.querySelector(".asset-gallery .managed-asset-card.selected")`);

  await probe(client, scenario, budgets, "Assets selected detail open", "assetDetailOpen", `
    (() => {
      const button = [...document.querySelectorAll(".asset-selection-inspector button")]
        .find((candidate) => candidate.textContent?.includes("Open Detail"));
      button?.click();
      return Boolean(button && !button.disabled);
    })()
  `, `document.querySelector(".asset-resource-preview-window") || document.querySelector(".workbench-floating-panel")`);

  await probe(client, scenario, budgets, "Assets switch back to reference libraries", "assetSectionSwitch", `
    (() => {
      const tab = [...document.querySelectorAll(".asset-section-tabs button")]
        .find((button) => button.textContent?.includes("Reference Assets"));
      tab?.click();
      return Boolean(tab);
    })()
  `, `document.querySelector(".library-asset-strip") && document.body.innerText.includes("Reference Assets")`);
}

async function warmDomain(client, domain) {
  await evalValue(client, `
    (() => {
      const button = document.querySelector(".rail-tool.domain-${domain}");
      button?.click();
      return Boolean(button);
    })()
  `);
  await waitFor(async () => evalValue(client, `Boolean(document.querySelector(".rail-tool.domain-${domain}.active"))`), 20_000, `Timed out warming ${domain}.`);
  await evalValue(client, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
}

async function probe(client, scenario, budgets, label, budgetKey, actionExpression, settleExpression, options = {}) {
  try {
    const result = await measureInteraction(client, label, budgetKey, budgets, actionExpression, settleExpression, options);
    if (result.actionResult === false) {
      await pushProbe(client, scenario, {
        ...result,
        status: "skip",
        skipped: true,
        reason: "Target control was not available in this scenario state."
      });
    } else {
      await pushProbe(client, scenario, result);
    }
  } catch (error) {
    await pushProbe(client, scenario, {
      label,
      budgetKey,
      durationMs: 0,
      status: "fail",
      failureKind: "functional",
      error: String(error?.message ?? error),
      longTasks: [],
      maxLongTaskMs: 0,
      longTaskStatus: "pass"
    });
  }
}

async function pushProbe(client, scenario, probe) {
  const classification = classifyProbe(probe);
  const enriched = { ...probe, classification };
  if ((classification === "functional-failure" || classification === "performance-failure") && !enriched.debug) {
    enriched.debug = await smokeDebug(client, scenario).catch(() => null);
  }
  scenario.probes.push(enriched);
}

function classifyProbe(probe) {
  if (probe.skipped || probe.status === "skip") return "skipped";
  if (probe.failureKind === "functional" || probe.error) return "functional-failure";
  if (probe.status === "fail" || probe.longTaskStatus === "fail") return "performance-failure";
  if (probe.status === "warn" || probe.longTaskStatus === "warn") return "performance-warning";
  return "pass";
}

async function smokeDebug(client, scenario) {
  const debug = await evalValue(client, `
    (() => {
      const textOf = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null;
      const selectedText = (selector) => {
        const element = document.querySelector(selector);
        return element?.textContent?.replace(/\\s+/g, " ").trim().slice(0, 240) ?? null;
      };
      const count = (selector) => document.querySelectorAll(selector).length;
      const activeRail = document.querySelector(".rail-tool.active");
      const activeDomainClass = activeRail ? [...activeRail.classList].find((entry) => entry.startsWith("domain-")) : null;
      const activeCombatTab = [...document.querySelectorAll(".combat-tabs button")]
        .find((button) => button.classList.contains("active") || button.getAttribute("aria-selected") === "true");
      const activeAssetTab = [...document.querySelectorAll(".asset-section-tabs button")]
        .find((button) => button.classList.contains("active") || button.getAttribute("aria-selected") === "true");
      return {
        href: location.href,
        title: document.title,
        activeDomain: activeDomainClass?.replace("domain-", "") ?? null,
        activeToolText: activeRail?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
        activeEditor: document.querySelector("[data-active-editor]")?.getAttribute("data-active-editor") ?? null,
        activeCombatTab: activeCombatTab?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
        activeAssetTab: activeAssetTab?.textContent?.replace(/\\s+/g, " ").trim() ?? null,
        loading: document.body.innerText.includes("Loading editor section"),
        selectedRecords: {
          map: selectedText(".map-list button.selected, .map-list button.active"),
          actionPoint: selectedText(".realmz-script-list button.selected"),
          encounter: selectedText(".encounter-list button.selected, .encounter-record-list button.selected"),
          battle: textOf(".battle-header-fields input"),
          scenarioMonster: selectedText(".scenario-monster-list .combat-record-scroll button.selected"),
          libraryMonster: selectedText(".monster-library-list .combat-record-scroll button.selected"),
          asset: selectedText(".managed-asset-card.selected, .asset-selection-inspector strong"),
          textRecord: selectedText(".text-record-list button.selected")
        },
        selectorCounts: {
          buttons: count("button"),
          inputs: count("input"),
          selects: count("select"),
          railTools: count(".rail-tool"),
          activeRailTools: count(".rail-tool.active"),
          scriptRecords: count(".realmz-script-list button"),
          encounterRecords: count(".encounter-list button, .encounter-record-list button"),
          scenarioMonsterRows: count(".scenario-monster-list .combat-record-scroll button"),
          libraryMonsterRows: count(".monster-library-list .combat-record-scroll button"),
          battleCanvases: count("[data-battle-board-canvas='true']"),
          mapCanvases: count(".room-canvas-overlay"),
          assetCards: count(".managed-asset-card"),
          combatPreviews: count("[data-combat-preview='monster-icon']"),
          targetPickers: count(".realmz-target-picker")
        },
        statusText: document.querySelector(".status-bar, [role='status']")?.textContent?.replace(/\\s+/g, " ").trim().slice(0, 500) ?? null,
        bodyPreview: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 1000)
      };
    })()
  `);
  return {
    scenarioName: scenario?.name ?? null,
    projectPath: scenario?.project ?? null,
    projectUrl: scenario?.projectUrl ?? null,
    browserEvents: browserEventDiagnostics(client),
    ...debug
  };
}

function browserEventDiagnostics(client) {
  const events = client.events?.([
    "Runtime.consoleAPICalled",
    "Runtime.exceptionThrown",
    "Log.entryAdded"
  ]) ?? [];
  return events
    .map((event) => summarizeBrowserEvent(event))
    .filter(Boolean)
    .filter(isRelevantBrowserEvent)
    .slice(-40);
}

function summarizeBrowserEvent(event) {
  if (event.method === "Runtime.exceptionThrown") {
    const details = event.params?.exceptionDetails ?? {};
    return {
      method: event.method,
      receivedAt: event.receivedAt,
      text: details.text ?? null,
      message: stringifyRemoteValue(details.exception),
      url: details.url ?? null,
      lineNumber: details.lineNumber ?? null,
      columnNumber: details.columnNumber ?? null,
      frame: summarizeStackFrame(details.stackTrace)
    };
  }
  if (event.method === "Runtime.consoleAPICalled") {
    const params = event.params ?? {};
    if (!["error", "warning", "assert"].includes(params.type)) return null;
    return {
      method: event.method,
      receivedAt: event.receivedAt,
      type: params.type,
      message: (params.args ?? []).map((arg) => stringifyRemoteValue(arg)).filter(Boolean).join(" "),
      frame: summarizeStackFrame(params.stackTrace)
    };
  }
  if (event.method === "Log.entryAdded") {
    const entry = event.params?.entry ?? {};
    if (!["error", "warning"].includes(entry.level)) return null;
    return {
      method: event.method,
      receivedAt: event.receivedAt,
      level: entry.level,
      source: entry.source ?? null,
      message: String(entry.text ?? "").slice(0, 500),
      url: entry.url ?? null,
      lineNumber: entry.lineNumber ?? null
    };
  }
  return null;
}

function stringifyRemoteValue(value) {
  if (!value) return "";
  if (value.value != null) return String(value.value).slice(0, 500);
  if (value.unserializableValue != null) return String(value.unserializableValue).slice(0, 500);
  if (value.description != null) return String(value.description).slice(0, 500);
  return "";
}

function summarizeStackFrame(stackTrace) {
  const frame = stackTrace?.callFrames?.[0];
  if (!frame) return null;
  return {
    functionName: frame.functionName || null,
    url: frame.url || null,
    lineNumber: frame.lineNumber ?? null,
    columnNumber: frame.columnNumber ?? null
  };
}

function isRelevantBrowserEvent(event) {
  const url = event.url ?? event.frame?.url ?? "";
  if (!url) return true;
  return url.includes("127.0.0.1") || url.includes("localhost");
}

function prepareCombatBenchmarkProject(sourceProject) {
  if (!sourceProject) throw new Error("No source project found for Combat benchmark generation. Pass --project or create a benchmark project first.");
  const sourcePath = path.resolve(sourceProject);
  const project = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const outputDir = path.join(root, "tmp", "performance-smoke", "combat-benchmark-project");
  fs.mkdirSync(outputDir, { recursive: true });
  project.scenario = {
    ...project.scenario,
    name: "Combat Performance Benchmark",
    projectPath: outputDir
  };
  project.monsters = ensureCombatBenchmarkMonsters(project.monsters ?? []);
  project.battles = ensureCombatBenchmarkBattles(project.battles ?? []);
  if (project.records?.counts) {
    project.records = {
      ...project.records,
      counts: {
        ...project.records.counts,
        battles: Math.max(project.records.counts.battles ?? 0, project.battles.length),
        monsters: Math.max(project.records.counts.monsters ?? 0, project.monsters.length)
      }
    };
  }
  project.validation = normalizeBenchmarkValidation(project.validation);
  const outputPath = path.join(outputDir, "project.json");
  writeBenchmarkProject(outputPath, project);
  return outputPath;
}

function prepareCombatImportedBenchmarkProject(sourceProject) {
  if (!sourceProject) throw new Error("No source project found for imported-heavy Combat benchmark generation. Pass --project or create a benchmark project first.");
  const sourcePath = path.resolve(sourceProject);
  const project = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const outputDir = path.join(root, "tmp", "performance-smoke", "combat-imported-benchmark-project");
  fs.mkdirSync(outputDir, { recursive: true });
  project.scenario = {
    ...project.scenario,
    name: "Combat Imported Performance Benchmark",
    projectPath: outputDir
  };
  project.monsters = ensureCombatBenchmarkMonsters(project.monsters ?? []);
  project.monsterSets = ensureCombatBenchmarkMonsterSets(project.monsterSets ?? [], project.monsters);
  project.battles = ensureCombatBenchmarkBattles(project.battles ?? []);
  project.triggers = ensureImportedBenchmarkTriggers(project.triggers ?? [], 6_000);
  project.extracodes = ensureImportedBenchmarkExtracodes(project.extracodes ?? [], 64_000);
  project.messages = ensureImportedBenchmarkMessages(project.messages ?? [], 1_000);
  if (project.records?.counts) {
    project.records = {
      ...project.records,
      counts: {
        ...project.records.counts,
        battles: Math.max(project.records.counts.battles ?? 0, project.battles.length),
        monsters: Math.max(project.records.counts.monsters ?? 0, project.monsters.length),
        triggers: Math.max(project.records.counts.triggers ?? 0, project.triggers.length),
        extracodes: Math.max(project.records.counts.extracodes ?? 0, project.extracodes.length)
      }
    };
  }
  project.validation = normalizeBenchmarkValidation(project.validation);
  const outputPath = path.join(outputDir, "project.json");
  writeBenchmarkProject(outputPath, project);
  return outputPath;
}

function writeBenchmarkProject(outputPath, project) {
  project.semanticSchema = emptyBenchmarkSemanticSchema();
  fs.writeFileSync(outputPath, `${JSON.stringify(project)}\n`, "utf8");
}

function emptyBenchmarkSemanticSchema() {
  return {
    schemaVersion: 5,
    sources: [],
    records: [],
    entities: [],
    links: [],
    reverseLinks: {},
    evidence: [],
    diagnostics: [],
    decoding: { ed3Reachability: [], dispatcherNoops: [], confidenceDebt: [] },
    summary: { sourceCount: 0, recordCount: 0, entityCount: 0, linkCount: 0, diagnosticCount: 0 }
  };
}

function normalizeBenchmarkValidation(validation) {
  return {
    ok: Boolean(validation?.ok ?? true),
    errors: Array.isArray(validation?.errors) ? validation.errors : [],
    warnings: Array.isArray(validation?.warnings) ? validation.warnings : [],
    exportableFiles: Array.isArray(validation?.exportableFiles) ? validation.exportableFiles : [],
    passThroughFiles: Array.isArray(validation?.passThroughFiles) ? validation.passThroughFiles : [],
    targetCompatibilityIssues: Array.isArray(validation?.targetCompatibilityIssues) ? validation.targetCompatibilityIssues : [],
    targetCompatibility: {
      blockers: Array.isArray(validation?.targetCompatibility?.blockers) ? validation.targetCompatibility.blockers : [],
      warnings: Array.isArray(validation?.targetCompatibility?.warnings) ? validation.targetCompatibility.warnings : [],
      notes: Array.isArray(validation?.targetCompatibility?.notes) ? validation.targetCompatibility.notes : []
    }
  };
}

function findImportedCombatBenchmarkSourceProject() {
  const matches = [];
  visitProjectTree(path.join(root, "tmp"), matches, { preferProvidence: true });
  matches.sort((left, right) => {
    const leftProvidence = left.file.includes(".providence") ? 1 : 0;
    const rightProvidence = right.file.includes(".providence") ? 1 : 0;
    return rightProvidence - leftProvidence || right.size - left.size || right.mtimeMs - left.mtimeMs;
  });
  return matches[0]?.file ?? null;
}

function findCombatBenchmarkSourceProject() {
  const defaultSource = defaultProjectSpecs([]).find((spec) => spec.file)?.file;
  if (defaultSource) return defaultSource;
  const roots = [
    path.join(root, "tmp", "editor-smoke-runs"),
    path.join(root, "projects"),
    path.join(root, "tmp", "desktop-ui-harness"),
    path.join(root, "tmp")
  ];
  for (const searchRoot of roots) {
    const matches = [];
    visitProjectTree(searchRoot, matches);
    matches.sort((left, right) => left.size - right.size || right.mtimeMs - left.mtimeMs);
    if (matches[0]?.file) return matches[0].file;
  }
  return null;
}

function visitProjectTree(dir, matches, { preferProvidence = false } = {}) {
  if (!fs.existsSync(dir)) return;
  if (dir.includes(`${path.sep}performance-smoke${path.sep}`)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      visitProjectTree(full, matches, { preferProvidence });
      continue;
    }
    if (entry.name !== "project.json") continue;
    if (preferProvidence && !full.includes(".providence")) continue;
    if (!combatBenchmarkSourceLooksUsable(full)) continue;
    const stats = fs.statSync(full);
    matches.push({ file: full, mtimeMs: stats.mtimeMs, size: stats.size });
  }
}

function combatBenchmarkSourceLooksUsable(file) {
  try {
    const project = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(project.monsters) && Array.isArray(project.battles);
  } catch {
    return false;
  }
}

function ensureCombatBenchmarkBattles(existingBattles) {
  const grid = Array.from({ length: 13 * 13 }, (_, index) => index < 75 ? (index % 190) + 1 : 0);
  const denseBattle = {
    ...(existingBattles[0] ?? {}),
    id: 0,
    grid,
    dist: 0,
    messageBefore: 0,
    messageAfter: 0,
    battleMacro: 0,
    authored: true,
    provenance: {
      sourceFile: "performance-smoke",
      recordIndex: 0,
      byteOffset: 0,
      byteLength: 0,
      confidence: "authored"
    }
  };
  return [denseBattle, ...existingBattles.filter((battle) => battle.id !== 0)];
}

function ensureCombatBenchmarkMonsterSets(existingSets, normalMonsters) {
  const byId = new Map((existingSets ?? []).map((set) => [set.setId, set]));
  return [1, -1].map((setId) => {
    const existing = byId.get(setId);
    const scale = setId === 1 ? 1.35 : 1.7;
    return {
      ...(existing ?? {}),
      setId,
      monsters: normalMonsters.map((monster) => benchmarkMonsterForId({
        ...monster,
        hitDice: Math.max(1, Math.round((Number(monster.hitDice) || 1) * scale)),
        staminaBonus: Math.max(1, Math.round((Number(monster.staminaBonus) || 1) * scale)),
        displayName: `${setId === 1 ? "Monster" : "Mega"} Perf Monster ${monster.id}`
      }, monster.id))
    };
  });
}

function ensureImportedBenchmarkTriggers(existingTriggers, targetLength) {
  const source = existingTriggers.find(Boolean) ?? defaultImportedBenchmarkTrigger(0);
  const triggers = existingTriggers.slice(0, targetLength).map((trigger, index) => importedBenchmarkTriggerForId(trigger, index));
  for (let index = triggers.length; index < targetLength; index += 1) {
    triggers.push(importedBenchmarkTriggerForId(source, index));
  }
  return triggers;
}

function importedBenchmarkTriggerForId(source, id) {
  return {
    ...defaultImportedBenchmarkTrigger(id),
    ...JSON.parse(JSON.stringify(source ?? {})),
    id,
    recordIndex: id,
    active: Boolean(source?.active ?? false),
    provenance: benchmarkProvenance("Data EDCD", id, id * 12, 12)
  };
}

function defaultImportedBenchmarkTrigger(id) {
  return {
    id,
    source: "Data EDCD",
    levelType: "land",
    levelIndex: id % 24,
    recordIndex: id,
    active: false,
    doorid: 0,
    landid: 0,
    targetX: 0,
    targetY: 0,
    percent: 0,
    coordinate: { x: id % 48, y: Math.floor(id / 48) % 48 },
    actions: [],
    provenance: benchmarkProvenance("Data EDCD", id, id * 12, 12)
  };
}

function ensureImportedBenchmarkExtracodes(existingRows, targetLength) {
  const source = existingRows.find(Boolean) ?? defaultImportedBenchmarkExtracode(0);
  const rows = existingRows.slice(0, targetLength).map((row, index) => importedBenchmarkExtracodeForId(row, index));
  for (let index = rows.length; index < targetLength; index += 1) {
    rows.push(importedBenchmarkExtracodeForId(source, index));
  }
  return rows;
}

function importedBenchmarkExtracodeForId(source, id) {
  return {
    ...defaultImportedBenchmarkExtracode(id),
    ...JSON.parse(JSON.stringify(source ?? {})),
    id,
    values: normalizeNumberArray(source?.values, 8),
    provenance: benchmarkProvenance("Data ED3", id, id * 16, 16)
  };
}

function defaultImportedBenchmarkExtracode(id) {
  return {
    id,
    values: [0, 0, 0, 0, 0, 0, 0, 0],
    provenance: benchmarkProvenance("Data ED3", id, id * 16, 16)
  };
}

function ensureImportedBenchmarkMessages(existingMessages, targetLength) {
  const source = existingMessages.find(Boolean) ?? defaultImportedBenchmarkMessage(0);
  const messages = existingMessages.slice(0, targetLength).map((message, index) => importedBenchmarkMessageForId(message, index));
  for (let index = messages.length; index < targetLength; index += 1) {
    messages.push(importedBenchmarkMessageForId(source, index));
  }
  return messages;
}

function importedBenchmarkMessageForId(source, id) {
  return {
    ...defaultImportedBenchmarkMessage(id),
    ...JSON.parse(JSON.stringify(source ?? {})),
    id,
    text: `Imported benchmark message ${id}`,
    rawBytes: normalizeNumberArray(source?.rawBytes, 256),
    provenance: benchmarkProvenance("Data SD2", id, id * 256, 256)
  };
}

function defaultImportedBenchmarkMessage(id) {
  return {
    id,
    text: `Imported benchmark message ${id}`,
    rawBytes: Array(256).fill(0),
    authored: false,
    provenance: benchmarkProvenance("Data SD2", id, id * 256, 256)
  };
}

function benchmarkProvenance(sourceFile, recordIndex, byteOffset, byteLength) {
  return {
    sourceFile,
    recordIndex,
    byteOffset,
    byteLength,
    confidence: "authored"
  };
}

function ensureCombatBenchmarkMonsters(existingMonsters) {
  const byId = new Map(existingMonsters.map((monster) => [monster.id, monster]));
  const source = existingMonsters.find((monster) => monster.id > 0 && monster.hitDice > 0) ?? existingMonsters[0] ?? defaultCombatBenchmarkMonster(1);
  const monsters = [];
  for (let id = 1; id <= 190; id += 1) {
    monsters.push(benchmarkMonsterForId(byId.get(id) ?? source, id));
  }
  return monsters;
}

function benchmarkMonsterForId(source, id) {
  const monster = JSON.parse(JSON.stringify(source ?? defaultCombatBenchmarkMonster(id)));
  return {
    ...defaultCombatBenchmarkMonster(id),
    ...monster,
    id,
    nameId: id,
    hitDice: Math.max(1, Number(monster.hitDice) || 1),
    staminaBonus: Math.max(1, Number(monster.staminaBonus) || 1),
    iconId: Number(monster.iconId) || 393,
    displayName: `Perf Monster ${id}`,
    typeFlags: normalizeNumberArray(monster.typeFlags, 8),
    attacks: normalizeAttackRows(monster.attacks),
    saves: normalizeNumberArray(monster.saves, 6, 30),
    spellImmunities: normalizeNumberArray(monster.spellImmunities, 6),
    money: normalizeNumberArray(monster.money, 3),
    spells: normalizeNumberArray(monster.spells, 10),
    items: normalizeNumberArray(monster.items, 6),
    underneath: normalizeNumberArray(monster.underneath, 4),
    conditions: normalizeNumberArray(monster.conditions, 40),
    authored: true
  };
}

function defaultCombatBenchmarkMonster(id) {
  return {
    id,
    hitDice: 1,
    staminaBonus: 1,
    agility: 10,
    nameId: id,
    movementMax: 10,
    armor: 30,
    magicResistance: 0,
    distance: 0,
    traitor: 1,
    size: 0,
    typeFlags: Array(8).fill(0),
    attackCount: 1,
    magicAttackCount: 0,
    attacks: [[1, 4, 34, 0], [0, 0, 31, 0], [0, 0, 31, 0], [0, 0, 31, 0], [0, 0, 31, 0]],
    damageBonus: 0,
    castPercent: 0,
    runPercent: 0,
    surrenderPercent: 0,
    missilePercent: 0,
    canSummon: 0,
    saves: Array(6).fill(30),
    spellImmunities: Array(6).fill(0),
    money: Array(3).fill(0),
    spells: Array(10).fill(0),
    items: Array(6).fill(0),
    weapon: 0,
    iconId: 393,
    spellPoints: 0,
    exp: 0,
    stamina: 1,
    staminaMax: 1,
    underneath: Array(4).fill(0),
    target: -1,
    guarding: 0,
    notOnMenu: false,
    beenAttacked: 0,
    movement: 0,
    magicToHit: 0,
    conditions: Array(40).fill(0),
    lr: 0,
    up: 0,
    attackNum: 0,
    bonusAttack: 0,
    deathMacro: 0,
    maxSpellPoints: 0,
    displayName: `Perf Monster ${id}`
  };
}

function normalizeNumberArray(values, length, fill = 0) {
  return Array.from({ length }, (_, index) => Number(values?.[index]) || fill);
}

function normalizeAttackRows(rows) {
  return Array.from({ length: 5 }, (_, index) => normalizeNumberArray(rows?.[index], 4));
}

function budgetStatus(durationMs, budget) {
  if (!budget) return "pass";
  if (durationMs >= budget.failMs) return "fail";
  if (durationMs >= budget.warnMs) return "warn";
  return "pass";
}
