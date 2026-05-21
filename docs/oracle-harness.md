# Providence Oracle Harness

The oracle harness is an opt-in desktop smoke path that round-trips a Providence project through Realmz Classic. It is owned by Providence and keeps Classic isolated in the sibling worktree at `F:\Realmz - Oracle`.

`npm run check` stays unchanged. It runs the fast structural checks only. Oracle smoke runs are explicit because they launch the desktop app and Realmz Classic.

## Setup

Expected local layout:

- Providence repo: `F:\Realmz - Providence`
- Classic oracle worktree: `F:\Realmz - Oracle`
- Classic executable: `F:\Realmz - Oracle\out_win_clang\Realmz.exe`
- Tutorial fixture source: `F:\Realmz\base\Realmz\Scenarios\Tutorial`

The Classic oracle script is `F:\Realmz - Oracle\scripts\run_providence_oracle.ps1`.

## Commands

Run the default happy path:

```powershell
npm run smoke:oracle -- -SkipBuild
```

Run a specific fixture:

```powershell
npm run smoke:oracle -- -Fixture tutorial-paint-tile -SkipBuild
npm run smoke:oracle -- -Fixture tutorial-edcd-row -SkipBuild
```

List fixtures:

```powershell
npm run smoke:oracle -- -ListFixtures
```

Run the full matrix:

```powershell
npm run smoke:oracle:matrix -- -SkipBuild
```

Run Phase 3 gameplay smoke:

```powershell
npm run smoke:oracle:gameplay -- -SkipBuild
npm run smoke:oracle:gameplay -- -Fixture tutorial-gameplay-trigger -SkipBuild
```

Run the gameplay matrix:

```powershell
npm run smoke:oracle:gameplay:matrix -- -SkipBuild
```

Show the latest run, a specific matrix run, or one fixture:

```powershell
npm run smoke:oracle:show
npm run smoke:oracle:show -- -RunRoot tmp\oracle-runs\matrix-20260521-095526
npm run smoke:oracle:show -- -RunRoot tmp\oracle-runs\matrix-20260521-095526 -Fixture validation-error
npm run smoke:oracle:show -- -RunRoot tmp\oracle-runs\gameplay-matrix-20260521-110604 -Fixture tutorial-gameplay-save-load
npm run smoke:oracle:show -- -RunRoot tmp\oracle-runs\matrix-20260521-095526 -Json
```

Omit `-SkipBuild` when you want the smoke script to build first.

## Fixtures

- `tutorial-macro`: imports Tutorial, creates one macro, exports, auto-imports in Classic, and selects the scenario.
- `tutorial-paint-tile`: paints `land:0` tile index `0` from `61` to `62`, asserts the project tile value, exports, and selects in Classic.
- `tutorial-edcd-row`: updates EDCD row `0` to `[1,2,3,4,5]`, exports, and selects in Classic.
- `missing-classic-exe`: expected failure at `classic-preflight`.
- `missing-exported-scenario`: expected failure at `export-preflight`.
- `validation-error`: expected failure at `providence`; assertion output includes the assertion name and observed value.
- `classic-fatal-marker`: expected failure at `classic`; injects a fatal marker into the Realmz runtime log.
- `scenario-not-appearing`: expected failure at `classic`; removes `Scenario.rsrc` after export so Classic cannot import/select the scenario.
- `tutorial-gameplay-start`: exports Tutorial, stages `Beldar` and `Dirk`, starts the scenario, and asserts active adventure state and party presence.
- `tutorial-gameplay-move`: starts Tutorial, enables noclip, warps outdoors, moves east, and asserts the coordinate delta.
- `tutorial-gameplay-trigger`: creates a deterministic action point at outdoor coordinate `20,20`, moves onto it, and asserts `quest[7]` plus `newland` markers.
- `tutorial-gameplay-save-load`: saves slot `A`, moves away, loads slot `A`, and asserts location, party, and save evidence are restored.
- `missing-staged-character`: expected gameplay failure when a required character file is absent.
- `trigger-not-fired`: expected gameplay failure when the trigger assertion is not satisfied.
- `save-load-restore-mismatch`: expected gameplay failure when restored coordinates do not match the assertion.

The matrix exits `0` only when every fixture matches its expected outcome and stage.

## Batch Matrix Mode

Single-fixture runs use `PROVIDENCE_HARNESS_SCRIPT` and `PROVIDENCE_HARNESS_RESULT`.

Matrix runs use `PROVIDENCE_HARNESS_BATCH`, which points to `providence-harness-batch.json`. The batch manifest lists each fixture's script and result path. Providence desktop launches once, runs every harness script sequentially, writes one `providence-result.json` per fixture, then exits. Classic oracle checks still run serially per fixture so each scenario gets an isolated profile, logs, and cleanup.

`matrix-summary.json` records `providenceMode = "batch"`, `providenceLaunches = 1`, and `durationSeconds`.

Gameplay matrix runs use the same Providence batch harness for export, then launch Classic once per fixture to keep each party, save slot, runtime log, and scenario mirror isolated. A recent local gameplay matrix took about 3.5 minutes with `-SkipBuild`; the exact time varies with Classic process startup and menu discovery.

## Gameplay Debug Bridge

Phase 3 adds a Classic debug-only command bridge. It is active only when Classic is launched with:

- `REALMZ_RUN_KIND=providence-oracle-gameplay`
- `REALMZ_ORACLE_COMMAND_PATH=<command-file>`

The Providence script still stages, auto-imports, and selects the exported scenario through the Phase 2 oracle path. After selection, it writes line-oriented command files for Classic to poll. Classic executes commands such as `startScenario`, `snapshot`, `setNoclip`, `warpOutdoor`, `move`, `saveSlot`, and `loadSlot`, then writes one JSON response and snapshot per command. Normal Realmz launches never enable this bridge.

The bridge does not change Realmz scenario loading semantics. Gameplay start resolves the actual Game menu row for the staged scenario, calls Realmz's normal `selectscenario` path, and then uses the standard `setupnewgame` and save/load paths. Providence exports must continue to conform to Realmz's scenario layout and resource expectations.

The bridge intentionally seeds a fixed party from staged `Character Files` instead of clicking through party setup. Movement fixtures use noclip so semantic checks are about Providence export data and Realmz action execution, not terrain collision brittleness.

## Artifacts

Each run writes under `tmp\oracle-runs\<stamp>` or under a matrix child directory:

- `providence-harness.json`: script consumed by the desktop harness.
- `providence-result.json`: Providence save, validation, export, and assertion result.
- `oracle-summary.json`: top-level fixture summary with expected and observed outcome.
- `export\<ScenarioName>`: exported Realmz scenario folder.
- `project\<ScenarioName>.providence`: saved Providence project.
- `realmz-profile`: isolated Classic profile.
- `realmz-logs`: Classic runtime log, menu snapshots, and Classic summary JSON.
- `classic-gameplay-script.json`: gameplay command script for Phase 3 fixtures.
- `realmz-logs\providence-oracle-*-gameplay-result.json`: Classic gameplay result.
- `realmz-logs\providence-oracle-*-gameplay-*-response.json`: per-command responses.
- `realmz-logs\providence-oracle-*-gameplay-*-snapshot.json`: per-command snapshots.

The matrix also writes `matrix-summary.json`.

`npm run smoke:oracle:show` reads these files and prints the expectation, stage, Providence assertion/error, Classic dispatch state, marker matches, fatal markers, gameplay steps, response paths, last snapshot, trigger markers, save/load markers, runtime log, menu snapshots, export dir, and profile dir. It exits `1` when any displayed fixture did not match expectation.

## Runtime Mirror Rationale

Classic staging is intentionally two-step in Phase 2 and Phase 3:

1. The exported scenario is copied into the isolated profile under `REALMZ_USER_DATA_DIR\Scenarios\<ScenarioName>`.
2. The same scenario is temporarily mirrored into `F:\Realmz - Oracle\out_win_clang\Scenarios\<ScenarioName>`.

The mirror is the verified Classic compatibility path for resource-fork lookup. It is quarantined to the oracle worktree and cleaned after each run unless `-KeepRunning` is used. Cleanup failure fails the Classic oracle result.

The pure `REALMZ_USER_DATA_DIR` resource resolver path is deferred until separately proven. Phase 2 and Phase 3 acceptance use the runtime mirror path.

## Common Failures

- Missing Classic exe: pass `-ClassicExePath` or restore `F:\Realmz - Oracle\out_win_clang\Realmz.exe`.
- Missing `Scenario`: inspect `providence-result.json` and the export folder.
- Validation failure: inspect `providence-result.json`; assertion errors include exact assertion names and observed values.
- Scenario does not appear in Classic: inspect `realmz-logs\providence-oracle-*-menu-post-import.json` and the runtime log.
- Fatal marker: inspect `realmz-logs\realmz-*.log` and `FoundBadMarkers` in the Classic summary.
- Gameplay command timeout: inspect `classic-gameplay-script.json`, the command file, and the latest per-command response path in `realmz-logs`.
- Missing character: verify the fixture's `requiredCharacters` are copied into the isolated profile's `Character Files`.
- Trigger mismatch: inspect `newland` markers and the last snapshot's `quest` array.
- Save/load mismatch: inspect the `saveSlot`/`loadSlot` markers, the slot `A` save files under the profile, and the before/after snapshots.
- Partial gameplay window rendering: the gameplay bridge suppresses Realmz's blocking `mainscreen()` loop so command polling can continue, then forces redraw/recomposite after gameplay commands. Treat semantic snapshots and runtime markers as the oracle source of truth; visual rendering issues should be debugged separately from scenario compatibility.
