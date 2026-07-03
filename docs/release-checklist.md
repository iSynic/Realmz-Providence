# Release Checklist

Desktop is the primary Providence platform. The browser build is useful for fast UI iteration, but it is not enough to clear a public release.

Use this checklist before tagging, publishing artifacts, or replacing a released desktop build.

## Patch Release Gate

Run these commands from the repository root. Every command must exit with status 0.

For the standard scripted patch gate, run:

```powershell
npm run release:patch-gate
```

For the same patch gate plus editor smokes against the freshly built desktop executable, run:

```powershell
npm run release:patch-gate:desktop-smoke
```

For local code-only verification when desktop packaging is not relevant, run:

```powershell
npm run release:patch-gate:skip-desktop
```

The patch gate is the following sequence:

| Step | Command | Expected Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | `tsc --noEmit` completes with no errors. |
| Action Point gap gate | `npm run check:ap-action-gaps` | Self-test passes and reports `gateFailureCount: 0`. |
| Action Point coverage | `npm run check:ap-actions` | Action title and script action coverage checks pass. |
| Registration codes | `npm run check:registration-codes` | Scenario registration/code checks pass. |
| Divinity manual audit | `node scripts\report_divinity_manual_tool_audit.mjs --check` | Generated audit outputs are current. |
| Combat command audit | `node scripts\check_combat_monster_commands.mjs` | Combat battle/monster/icon command checks pass. |
| Script diagnostics | `npm run check:script-diagnostics` | Script diagnostic self-test writes its report and exits cleanly. |
| Scenario context | `npm run check:scenario-context` | Scenario context registry checks pass. |
| Evidence Lab policy | `npm run check:evidence-lab` | Evidence Lab remains scoped to named compatibility blockers. |
| Web production build | `npm run build` | Vite completes and writes `dist/`. |
| Rust tests | `cargo test --manifest-path src-tauri\Cargo.toml --lib` | Tauri/Rust library tests pass. |
| Desktop artifacts | `npm run release:desktop-gate` | Windows and Linux desktop artifacts rebuild for the current package version. |

`npm run check` is a useful broad local pass, but it is not the full patch release gate. The patch gate above also includes the Divinity manual audit and desktop artifact gate.

## Desktop Acceptance Gate

For the full local desktop acceptance gate, including harnessed Windows editor smokes against the freshly built release executable, run:

```powershell
npm run release:desktop-gate:smoke
```

This gate runs the desktop artifact build and then launches the editor smoke matrix against `src-tauri\target\release\realmz-providence.exe`.

For quick Windows-only desktop debugging, run:

```powershell
npm run release:desktop-gate:windows
npm run release:desktop-gate:windows:smoke
```

Do not use a Windows-only gate as the final public release gate.

## Additional Gates

Run these when the release includes the relevant kind of change.

| Change Kind | Command | Required When |
| --- | --- | --- |
| Parser/export/resource storage changes | `powershell -ExecutionPolicy Bypass -File scripts\run_patch_release_gate.ps1 -RunRoundtripAudit` | Any change can affect no-edit import/export preservation, fixed record writing, resource forks, or scenario package output. |
| Imported-project UI performance | `powershell -ExecutionPolicy Bypass -File scripts\run_patch_release_gate.ps1 -RunImportedCombatPerformanceSmoke` | Combat, project-state invalidation, semantic schema, resource preview, or imported-project performance changes. |
| Combat-specific performance | `powershell -ExecutionPolicy Bypass -File scripts\run_patch_release_gate.ps1 -RunPerformanceSmoke` | Battle drawing, monster palette, icon resolution, or Combat tab performance changes. |
| Map paint performance | `npm run smoke:ui:map-paint` | Maps canvas, tile painting, stamp, or palette changes. |
| Desktop smoke matrix against an existing exe | `npm run smoke:editor` | Validate an already-built release exe without rebuilding artifacts. |

The UI performance smoke expects a usable benchmark project. If it reports that no benchmark project was found, generate one through the related editor smoke, pass `--project <project.json>`, or use the existing project under `tmp/performance-smoke/` when present.

## Known Acceptable Smoke Warnings

Treat these as warnings only when the command exits 0 and the run summary reports `ok: true`:

- Validation warnings that are intentionally part of the imported Tutorial or large scenario fixture.
- Smoke artifacts retained under `tmp\editor-smoke-runs\...` because `-KeepArtifacts` was passed.
- UI performance probe statuses of `warn` that remain below the configured `failMs` threshold in `docs/performance-budgets.json`.
- Browser-only import limitations in the Codex in-app browser. Scenario import verification should use the desktop smoke or a regular browser/desktop app path when the Codex picker crash is not the bug under test.

Treat these as failures:

- Any non-zero command exit.
- Any smoke summary with `ok: false`.
- Any UI performance probe with status `fail`.
- Missing or stale desktop artifacts after `release:desktop-gate`.
- A generated audit/check command that reports outputs are stale.

## Manual Desktop Smoke

After the automated gate and desktop smoke matrix pass, install or run the freshly built desktop artifact and check:

- Create a new Providence project.
- Import a scenario folder from the filesystem.
- Open War in the Sword Lands and City of Bywater when available.
- Visit Maps, Scripts, Encounters, Combat, Economy, Assets, Linter, and Export.
- In Combat and Economy, confirm art previews render in the desktop build.
- In Scripts or any sound picker, spot-check scenario sound references beyond the automated Tutorial smoke where available.

Only publish or replace GitHub release artifacts after the manual desktop smoke passes.

## Release Notes Template

Use this shape for patch release notes:

```markdown
## User-Facing Changes

- Fixed ...
- Improved ...
- Added ...

## Compatibility And Export Safety

- Preserved ...
- Verified ...
- Known compatibility note: ...

## Developer / Archaeology

- Added or updated checks ...
- Updated generated evidence ...
- Follow-up evidence still needed ...

## Verification

- npm run typecheck
- npm run check:ap-action-gaps
- npm run check:ap-actions
- npm run check:registration-codes
- node scripts\report_divinity_manual_tool_audit.mjs --check
- node scripts\check_combat_monster_commands.mjs
- npm run check:script-diagnostics
- npm run check:scenario-context
- npm run check:evidence-lab
- npm run build
- cargo test --manifest-path src-tauri\Cargo.toml --lib
- npm run release:desktop-gate:smoke
```

Keep user-facing fixes separate from developer archaeology/reporting changes. If a generated evidence update does not change user behavior, put it under `Developer / Archaeology`.
