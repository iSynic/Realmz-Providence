import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const MODULE_BASELINES = [
  { path: "src/editor/panels/ScriptsPanel.tsx", maximum: 8587, owner: "ISY-315/ISY-316" },
  { path: "src/editor/panels/CombatPanel.tsx", maximum: 197, owner: "ISY-318" },
  { path: "src/editor/panels/combat/MonsterIconSetWorkbench.tsx", maximum: 553, owner: "ISY-318" },
  { path: "src/editor/panels/combat/MonsterWorkbench.tsx", maximum: 750, owner: "ISY-318" },
  { path: "src/editor/panels/combat/BattleWorkbench.tsx", maximum: 530, owner: "ISY-318" },
  { path: "src/editor/panels/combat/BattleBoard.tsx", maximum: 512, owner: "ISY-318" },
  { path: "src/editor/panels/combat/BattleBoardCanvas.tsx", maximum: 326, owner: "ISY-318" },
  { path: "src/editor/panels/combat/BattleMonsterPalette.tsx", maximum: 260, owner: "ISY-318" },
  { path: "src/editor/panels/combat/BattleMonsterInspector.tsx", maximum: 80, owner: "ISY-318" },
  { path: "src/editor/panels/combat/battleMonsterIcons.ts", maximum: 265, owner: "ISY-318" },
  { path: "src/editor/panels/combat/battleMonsterPaletteModel.ts", maximum: 88, owner: "ISY-318" },
  { path: "src/editor/panels/combat/MonsterLibraryPreview.tsx", maximum: 331, owner: "ISY-318" },
  { path: "src/editor/panels/combat/monsterLibraryWorkflow.ts", maximum: 317, owner: "ISY-318" },
  { path: "src/editor/panels/combat/MonsterRecordEditor.tsx", maximum: 405, owner: "ISY-318" },
  { path: "src/editor/panels/combat/MonsterIconControl.tsx", maximum: 223, owner: "ISY-318" },
  { path: "src/editor/panels/combat/MonsterReferenceFields.tsx", maximum: 241, owner: "ISY-318" },
  { path: "src/editor/panels/combat/monsterReferenceModel.ts", maximum: 91, owner: "ISY-318" },
  { path: "src/editor/scenarioSeed.ts", maximum: 22, owner: "ISY-317" },
  { path: "src/editor/panels/SuiteDomainPanel.tsx", maximum: 265, owner: "ISY-319" },
  { path: "src/editor/panels/suite/DomainDetailPanel.tsx", maximum: 252, owner: "ISY-319" },
  { path: "src/editor/panels/suite/TargetRecordWorkbench.tsx", maximum: 363, owner: "ISY-319" },
  { path: "src/editor/panels/economy/EconomyWorkbench.tsx", maximum: 151, owner: "ISY-319" },
  { path: "src/editor/panels/economy/ItemCatalogWorkbench.tsx", maximum: 1868, owner: "ISY-319" },
  { path: "src/editor/panels/economy/TreasureWorkbench.tsx", maximum: 421, owner: "ISY-319" },
  { path: "src/editor/panels/economy/ShopWorkbench.tsx", maximum: 387, owner: "ISY-319" },
  { path: "src/editor/panels/economy/EconomyMiniItemIcons.tsx", maximum: 29, owner: "ISY-319" },
  { path: "src/editor/panels/economy/economyRecordModel.ts", maximum: 46, owner: "ISY-319" },
  { path: "src/editor/panels/suite/suiteDomainRouting.ts", maximum: 240, owner: "ISY-319" },
  { path: "src/editor/components/MapContextSidebar.tsx", maximum: 621, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapBrowserSidebar.tsx", maximum: 450, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapPaintInspector.tsx", maximum: 665, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapActionPointInspector.tsx", maximum: 285, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapSelectionInspector.tsx", maximum: 293, owner: "ISY-319" },
  { path: "src/editor/components/maps/DungeonFlagInspector.tsx", maximum: 247, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapTileInspector.tsx", maximum: 133, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapSelectionLinks.tsx", maximum: 86, owner: "ISY-319" },
  { path: "src/editor/components/maps/mapSelectionModel.ts", maximum: 75, owner: "ISY-319" },
  { path: "src-tauri/src/realmz.rs", maximum: 5173, owner: "ISY-320" },
  { path: "src/editor/styles/scripts.css", maximum: 8712, owner: "ISY-321" },
  { path: "src/editor/styles/maps.css", maximum: 6546, owner: "ISY-321" },
  { path: "src/editor/styles/shell.css", maximum: 4855, owner: "ISY-321" },
  { path: "src/editor/styles/text-scenario.css", maximum: 3653, owner: "ISY-321" },
  { path: "src/editor/styles/combat.css", maximum: 3298, owner: "ISY-321" },
  { path: "src/editor/styles/rules.css", maximum: 1806, owner: "ISY-321" },
  { path: "src/editor/styles/assets.css", maximum: 1659, owner: "ISY-321" },
  { path: "src/editor/ui/workbench.css", maximum: 912, owner: "ISY-321" }
];

function evaluateModuleSizes(measurements) {
  return measurements
    .filter((measurement) => measurement.lines > measurement.maximum)
    .map((measurement) => `${measurement.path} grew from ${measurement.maximum} to ${measurement.lines} lines (${measurement.owner})`);
}

function runSelfTest() {
  const baseline = { path: "module.ts", maximum: 100, owner: "ISY-test" };
  assert.deepEqual(evaluateModuleSizes([{ ...baseline, lines: 100 }]), []);
  assert.match(evaluateModuleSizes([{ ...baseline, lines: 101 }])[0] ?? "", /grew from 100 to 101/);
  console.log("Module size baseline self-test passed (growth is rejected).");
}

async function runModuleSizeCheck() {
  const failures = [];
  const measurements = [];

  for (const baseline of MODULE_BASELINES) {
    try {
      const source = await readFile(baseline.path, "utf8");
      measurements.push({ ...baseline, lines: source.split(/\r?\n/).length });
    } catch (error) {
      failures.push(`${baseline.path} could not be measured: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  failures.push(...evaluateModuleSizes(measurements));
  if (failures.length > 0) {
    process.stderr.write("Module size baseline failed:\n");
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
    process.stderr.write("Extract new responsibilities or update the baseline with an explicit ownership decision.\n");
    process.exitCode = 1;
    return;
  }

  const totalLines = measurements.reduce((total, measurement) => total + measurement.lines, 0);
  console.log(`Module size baseline passed (${measurements.length} hotspots, ${totalLines.toLocaleString()} lines).`);
}

if (process.argv.includes("--self-test")) runSelfTest();
else await runModuleSizeCheck();
