import os from "node:os";
import path from "node:path";
import {
  createRunRoot,
  defaultProjectSpecs,
  evalValue,
  launchBrowser,
  loadBudgets,
  measureInteraction,
  preparePage,
  projectUrl,
  resolveBaseUrl,
  root,
  summarizeReport,
  waitFor,
  writeJson
} from "./performance_smoke_lib.mjs";

const args = parseArgs(process.argv.slice(2));
const processes = [];
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
  const explicitProjects = splitProjects(args.get("project") || process.env.PROVIDENCE_UI_PROJECT || "");
  const projectSpecs = defaultProjectSpecs(explicitProjects);
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
    const scenario = await runScenario({ baseUrl, budgets, spec });
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

async function runScenario({ baseUrl, budgets, spec }) {
  const client = await launchBrowser(processes);
  const scenario = {
    name: spec.name,
    project: spec.file,
    projectUrl: projectUrl(baseUrl, spec.file),
    probes: []
  };
  const url = `${baseUrl}/?benchmarkProject=${encodeURIComponent(scenario.projectUrl)}&benchmarkScripts=1&_perf=${Date.now()}`;
  const openedAt = Date.now();
  try {
    await preparePage(client, url);
    await waitForProjectLoaded(client);
    const browserVersion = await client.send("Browser.getVersion").catch(() => null);
    scenario.browser = browserVersion?.product ?? "unknown";
    scenario.viewport = await evalValue(client, "({ width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio })");
    scenario.probes.push({
      label: "Cold project open",
      budgetKey: "coldProjectOpen",
      durationMs: Date.now() - openedAt,
      status: budgetStatus(Date.now() - openedAt, budgets.coldProjectOpen),
      longTasks: [],
      maxLongTaskMs: 0,
      longTaskStatus: "pass"
    });

    await runToolSwitches(client, budgets, scenario);
    await runAssetsProbes(client, budgets, scenario);
    await runApProbes(client, budgets, scenario);
    await runMapProbes(client, budgets, scenario);
    await runCombatProbes(client, budgets, scenario);
    await runSearchProbes(client, budgets, scenario);
  } catch (error) {
    scenario.probes.push({
      label: "Scenario run",
      budgetKey: "coldProjectOpen",
      durationMs: 0,
      status: "fail",
      error: String(error?.message ?? error),
      longTasks: [],
      maxLongTaskMs: 0,
      longTaskStatus: "pass"
    });
  } finally {
    if (!keepBrowser) client.close();
  }
  return scenario;
}

async function waitForProjectLoaded(client) {
  await waitFor(async () => evalValue(client, `
    (() => {
      const text = document.body.innerText;
      return Boolean(document.querySelector(".domain-rail"))
        && !text.includes("Benchmark project load failed")
        && (
          text.includes("Action Points")
          || text.includes("Scenario Maps")
          || text.includes("Combat")
          || text.includes("Scenario")
        );
    })()
  `), 60_000, "Timed out waiting for benchmark project.");
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
    (() => {
      const input = document.querySelector(".script-list-filter");
      if (input) {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
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
    (() => {
      const input = document.querySelector(".realmz-target-picker input");
      if (!input) return false;
      input.focus();
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `, `document.querySelector(".realmz-target-picker input")`);
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
        dirty: Boolean(document.querySelector(".dirty-pill, .dirty-indicator, .project-dirty, [data-project-dirty='true']")),
        selected: document.body.innerText.match(/\\d+,\\d+\\s+to\\s+\\d+,\\d+|Paint tiles|Selected Paint Tile/)?.[0] ?? null
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
      const selectedText = document.body.innerText.match(/\\d+,\\d+\\s+to\\s+\\d+,\\d+|Paint tiles|Selected Paint Tile/)?.[0] ?? null;
      window.__providencePerfPaintAfter = {
        dirty: Boolean(document.querySelector(".dirty-pill, .dirty-indicator, .project-dirty, [data-project-dirty='true']")),
        selected: selectedText
      };
      return Boolean(active) && JSON.stringify(window.__providencePerfPaintAfter) !== JSON.stringify(window.__providencePerfPaintBefore);
    })()
  `);
}

async function runCombatProbes(client, budgets, scenario) {
  await warmDomain(client, "combat");
  await waitForCombatPreviews(client, "Timed out waiting for combat images.");
  await evalValue(client, "new Promise((resolve) => setTimeout(resolve, 1500))");
  await evalValue(client, `
    (() => {
      const battleTab = [...document.querySelectorAll(".combat-tabs button")]
        .find((button) => button.textContent?.includes("Battles"));
      battleTab?.click();
      const rows = [...document.querySelectorAll(".combat-record-scroll button")];
      rows[0]?.click();
      rows[1]?.click();
      return Boolean(battleTab);
    })()
  `);
  const warmedBattleImages = await waitForCombatPreviews(client, "Timed out waiting for warmed battle images.", { strict: false, timeoutMs: 5_000 });
  if (!warmedBattleImages) {
    scenario.probes.push({
      label: "Combat warmed image readiness",
      budgetKey: "recordSelection",
      durationMs: 0,
      status: "skip",
      skipped: true,
      reason: "Visible lazy battle previews did not all report ready during warm-up.",
      longTasks: [],
      maxLongTaskMs: 0,
      longTaskStatus: "pass",
      debug: await smokeDebug(client).catch(() => null)
    });
  }
  await evalValue(client, "new Promise((resolve) => setTimeout(resolve, 350))");
  await probe(client, scenario, budgets, "Combat battle select", "recordSelection", `
    (() => {
      const battleTab = [...document.querySelectorAll(".combat-tabs button")]
        .find((button) => button.textContent?.includes("Battles"));
      battleTab?.click();
      const button = document.querySelector(".combat-record-scroll button");
      button?.click();
      return Boolean(button);
    })()
  `, `document.querySelector(".rail-tool.domain-combat.active")`);

  await probe(client, scenario, budgets, "Combat monster select", "recordSelection", `
    (() => {
      const monsterSelect = [...document.querySelectorAll("select")]
        .find((select) => [...select.options].some((option) => option.textContent?.toLowerCase().includes("monster")));
      if (monsterSelect && monsterSelect.options.length > 1) {
        monsterSelect.selectedIndex = Math.min(1, monsterSelect.options.length - 1);
        monsterSelect.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      const monsterButton = [...document.querySelectorAll(".monster-palette button, .combat-record-scroll button")]
        .find((candidate) => !candidate.classList.contains("selected"));
      monsterButton?.click();
      return Boolean(monsterButton);
    })()
  `, `document.querySelector(".rail-tool.domain-combat.active")`);

  await probe(client, scenario, budgets, "Combat grid place or erase", "combatGridEdit", `
    (() => {
      const cell = document.querySelector(".battle-board button");
      cell?.click();
      return Boolean(cell);
    })()
  `, `document.querySelector(".battle-board button")`);
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
        .find((button) => button.textContent?.includes("Reference Libraries"));
      tab?.click();
      return Boolean(tab);
    })()
  `, `document.querySelector(".library-asset-strip") && document.body.innerText.includes("Reference Libraries")`);

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
        .find((button) => button.textContent?.includes("Reference Libraries"));
      tab?.click();
      return Boolean(tab);
    })()
  `, `document.querySelector(".library-asset-strip") && document.body.innerText.includes("Reference Libraries")`);
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

async function probe(client, scenario, budgets, label, budgetKey, actionExpression, settleExpression) {
  try {
    const result = await measureInteraction(client, label, budgetKey, budgets, actionExpression, settleExpression);
    if (result.actionResult === false) {
      scenario.probes.push({
        ...result,
        status: "skip",
        skipped: true,
        reason: "Target control was not available in this scenario state.",
        debug: await smokeDebug(client)
      });
    } else {
      scenario.probes.push(result);
    }
  } catch (error) {
    scenario.probes.push({
      label,
      budgetKey,
      durationMs: 0,
      status: "fail",
      error: String(error?.message ?? error),
      longTasks: [],
      maxLongTaskMs: 0,
      longTaskStatus: "pass",
      debug: await smokeDebug(client).catch(() => null)
    });
  }
}

async function smokeDebug(client) {
  return evalValue(client, `
    (() => ({
      activeDomain: document.querySelector(".rail-tool.active")?.className ?? null,
      activeEditor: document.querySelector("[data-active-editor]")?.getAttribute("data-active-editor") ?? null,
      loading: document.body.innerText.includes("Loading editor section"),
      visibleButtons: document.querySelectorAll("button").length,
      assetCards: document.querySelectorAll(".managed-asset-card").length,
      combatPreviews: document.querySelectorAll("[data-combat-preview='monster-icon']").length,
      mapCanvas: Boolean(document.querySelector(".room-canvas-overlay")),
      targetPickers: document.querySelectorAll(".realmz-target-picker").length
    }))()
  `);
}

function budgetStatus(durationMs, budget) {
  if (!budget) return "pass";
  if (durationMs >= budget.failMs) return "fail";
  if (durationMs >= budget.warnMs) return "warn";
  return "pass";
}
