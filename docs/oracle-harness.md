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

The matrix exits `0` only when every fixture matches its expected outcome and stage.

## Artifacts

Each run writes under `tmp\oracle-runs\<stamp>` or under a matrix child directory:

- `providence-harness.json`: script consumed by the desktop harness.
- `providence-result.json`: Providence save, validation, export, and assertion result.
- `oracle-summary.json`: top-level fixture summary with expected and observed outcome.
- `export\<ScenarioName>`: exported Realmz scenario folder.
- `project\<ScenarioName>.providence`: saved Providence project.
- `realmz-profile`: isolated Classic profile.
- `realmz-logs`: Classic runtime log, menu snapshots, and Classic summary JSON.

The matrix also writes `matrix-summary.json`.

## Runtime Mirror Rationale

Classic staging is intentionally two-step in Phase 2:

1. The exported scenario is copied into the isolated profile under `REALMZ_USER_DATA_DIR\Scenarios\<ScenarioName>`.
2. The same scenario is temporarily mirrored into `F:\Realmz - Oracle\out_win_clang\Scenarios\<ScenarioName>`.

The mirror is the verified Classic compatibility path for resource-fork lookup. It is quarantined to the oracle worktree and cleaned after each run unless `-KeepRunning` is used. Cleanup failure fails the Classic oracle result.

The pure `REALMZ_USER_DATA_DIR` resource resolver path is deferred until separately proven. Phase 2 does not require rebuilding Classic or accepting the unverified resolver fix.

## Common Failures

- Missing Classic exe: pass `-ClassicExePath` or restore `F:\Realmz - Oracle\out_win_clang\Realmz.exe`.
- Missing `Scenario`: inspect `providence-result.json` and the export folder.
- Validation failure: inspect `providence-result.json`; assertion errors include exact assertion names and observed values.
- Scenario does not appear in Classic: inspect `realmz-logs\providence-oracle-*-menu-post-import.json` and the runtime log.
- Fatal marker: inspect `realmz-logs\realmz-*.log` and `FoundBadMarkers` in the Classic summary.
