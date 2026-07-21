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
  { path: "src/editor/panels/combat/MonsterLibraryPreview.tsx", maximum: 342, owner: "ISY-318" },
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
  { path: "src/editor/components/MapContextSidebar.tsx", maximum: 7, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapBrowserSidebar.tsx", maximum: 93, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapOutliner.tsx", maximum: 111, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapToolset.tsx", maximum: 156, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapSelectionToolOptions.tsx", maximum: 90, owner: "ISY-393" },
  { path: "src/editor/components/maps/MapToolsetModeNotice.tsx", maximum: 50, owner: "ISY-393" },
  { path: "src/editor/components/maps/MapLevelSettings.tsx", maximum: 110, owner: "ISY-319" },
  { path: "src/editor/components/maps/mapBrowserModel.ts", maximum: 48, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapInspectorSidebar.tsx", maximum: 290, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapInspectorSwitcher.tsx", maximum: 50, owner: "ISY-393" },
  { path: "src/editor/components/maps/useMapInspectorRouting.ts", maximum: 110, owner: "ISY-393" },
  { path: "src/editor/components/maps/mapInspectorRouting.ts", maximum: 76, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapSetupInspector.tsx", maximum: 242, owner: "ISY-319" },
  { path: "src/editor/components/maps/mapSetupModel.ts", maximum: 35, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapPaintInspector.tsx", maximum: 665, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapRegionPaintActions.tsx", maximum: 180, owner: "ISY-393" },
  { path: "src/editor/components/maps/MapActionPointInspector.tsx", maximum: 285, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapSelectionInspector.tsx", maximum: 293, owner: "ISY-319" },
  { path: "src/editor/components/maps/DungeonFlagInspector.tsx", maximum: 247, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapTileInspector.tsx", maximum: 133, owner: "ISY-319" },
  { path: "src/editor/components/maps/MapSelectionLinks.tsx", maximum: 86, owner: "ISY-319" },
  { path: "src/editor/components/maps/mapSelectionModel.ts", maximum: 75, owner: "ISY-319" },
  { path: "src/editor/panels/MapsPanel.tsx", maximum: 203, owner: "ISY-319" },
  { path: "src/editor/panels/maps/MapAuxiliaryWorkbenches.tsx", maximum: 132, owner: "ISY-319" },
  { path: "src/editor/panels/maps/MapCanvasWorkbench.tsx", maximum: 211, owner: "ISY-319" },
  { path: "src/editor/panels/maps/MapCanvasEmptyState.tsx", maximum: 50, owner: "ISY-393" },
  { path: "src/editor/panels/maps/useMapCanvasVisibility.ts", maximum: 110, owner: "ISY-393" },
  { path: "src/editor/panels/maps/useMapSelectionShortcuts.ts", maximum: 90, owner: "ISY-319" },
  { path: "src/editor/panels/maps/useSmartBrushTransientUndo.ts", maximum: 50, owner: "ISY-393" },
  { path: "src/editor/panels/maps/useMapWorkbenchState.ts", maximum: 216, owner: "ISY-319" },
  { path: "src/editor/panels/maps/useSmartBrushWorkbenchState.ts", maximum: 170, owner: "ISY-393" },
  { path: "src-tauri/src/realmz.rs", maximum: 471, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/action_points.rs", maximum: 583, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/assembly.rs", maximum: 444, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/asset_catalog.rs", maximum: 173, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/battles.rs", maximum: 150, owner: "authoritative-compiler" },
  { path: "src-tauri/src/realmz/combat.rs", maximum: 415, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/economy.rs", maximum: 308, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/encounters.rs", maximum: 498, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/landlooks.rs", maximum: 843, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/maps.rs", maximum: 625, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/messages.rs", maximum: 83, owner: "authoritative-compiler" },
  { path: "src-tauri/src/realmz/option_labels.rs", maximum: 83, owner: "authoritative-compiler" },
  { path: "src-tauri/src/realmz/record_bytes.rs", maximum: 300, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/rules.rs", maximum: 447, owner: "ISY-320" },
  { path: "src-tauri/src/realmz/scenario.rs", maximum: 538, owner: "ISY-320" },
  { path: "src/editor/styles/script-surfaces.css", maximum: 7, owner: "ISY-321" },
  { path: "src/editor/styles/export.css", maximum: 92, owner: "ISY-321" },
  { path: "src/editor/styles/action-point-lists.css", maximum: 980, owner: "ISY-321" },
  { path: "src/editor/styles/action-point-editor.css", maximum: 1126, owner: "ISY-321" },
  { path: "src/editor/styles/action-point-references.css", maximum: 881, owner: "ISY-321" },
  { path: "src/editor/styles/action-point-settings.css", maximum: 796, owner: "ISY-321" },
  { path: "src/editor/styles/quests.css", maximum: 338, owner: "ISY-321" },
  { path: "src/editor/styles/action-point-diagnostics.css", maximum: 325, owner: "ISY-321" },
  { path: "src/editor/styles/action-point-visual-editor.css", maximum: 872, owner: "ISY-321" },
  { path: "src/editor/styles/action-point-inline-editors.css", maximum: 266, owner: "ISY-321" },
  { path: "src/editor/styles/scripts.css", maximum: 64, owner: "ISY-321" },
  { path: "src/editor/styles/map-context-sidebar.css", maximum: 1189, owner: "ISY-321" },
  { path: "src/editor/styles/map-paint-inspector.css", maximum: 855, owner: "ISY-321" },
  { path: "src/editor/styles/map-landlook-workbenches.css", maximum: 762, owner: "ISY-321" },
  { path: "src/editor/styles/map-auxiliary-workbenches.css", maximum: 785, owner: "ISY-321" },
  { path: "src/editor/styles/map-layout-workbench.css", maximum: 365, owner: "ISY-321" },
  { path: "src/editor/styles/map-tile-palette.css", maximum: 727, owner: "ISY-321" },
  { path: "src/editor/styles/map-browser-sidebar.css", maximum: 422, owner: "ISY-321" },
  { path: "src/editor/styles/map-selection-inspector.css", maximum: 749, owner: "ISY-321" },
  { path: "src/editor/styles/map-canvas.css", maximum: 238, owner: "ISY-321" },
  { path: "src/editor/styles/map-stamps.css", maximum: 283, owner: "ISY-321" },
  { path: "src/editor/styles/map-shared.css", maximum: 181, owner: "ISY-321" },
  { path: "src/editor/styles/shell.css", maximum: 4855, owner: "ISY-321" },
  { path: "src/editor/styles/text-scenario.css", maximum: 3653, owner: "ISY-321" },
  { path: "src/editor/styles/combat.css", maximum: 137, owner: "ISY-321" },
  { path: "src/editor/styles/combat-record-lists.css", maximum: 529, owner: "ISY-321" },
  { path: "src/editor/styles/combat-icon-sets.css", maximum: 323, owner: "ISY-321" },
  { path: "src/editor/styles/combat-reference-workflows.css", maximum: 244, owner: "ISY-321" },
  { path: "src/editor/styles/combat-monsters.css", maximum: 535, owner: "ISY-321" },
  { path: "src/editor/styles/combat-controls.css", maximum: 68, owner: "ISY-321" },
  { path: "src/editor/styles/combat-battles.css", maximum: 1315, owner: "ISY-321" },
  { path: "src/editor/styles/combat-fields.css", maximum: 96, owner: "ISY-321" },
  { path: "src/editor/styles/combat-responsive.css", maximum: 59, owner: "ISY-321" },
  { path: "src/editor/styles/rules.css", maximum: 1806, owner: "ISY-321" },
  { path: "src/editor/styles/assets.css", maximum: 1659, owner: "ISY-321" },
  { path: "src/editor/ui/workbench.css", maximum: 946, owner: "ISY-331" }
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
