# M19 Stabilization Closure Audit

This is the evidence ledger for ISY-323. It records the result of the M19 extraction work and the gates still required before normal feature development resumes. Module ownership remains defined only in `docs/codebase-stabilization-baseline.md`.

## Reproducible Evidence

Run the source-concentration and dependency audit from the repository root:

```powershell
npm run audit:m19-closure
```

The command compares the ISY-314 baseline commit `a450bed` with the current worktree and writes detailed evidence to the ignored file `tmp/m19-closure-audit.json`. The report includes owner file counts, total lines, entrypoint concentration, frontend test-file count, the approved ownership graph, and files touched by the most M19 commits.

## Predecessor Status

Linear confirms that ISY-314 through ISY-322 are Done. Their intended entrypoints and boundaries are checked by `npm run check:architecture`, while extraction growth remains checked by `npm run check:module-sizes`.

| Issue | Boundary delivered | Status |
| --- | --- | --- |
| ISY-314 | Tests, lint, source baselines, and refactor guardrails | Done |
| ISY-315 | Encounter authoring and target pickers | Done |
| ISY-316 | Action Point editing and diagnostics | Done |
| ISY-317 | Scenario compiler pipeline | Done |
| ISY-318 | Combat workbenches and libraries | Done |
| ISY-319 | Shared suite and map-context modules | Done |
| ISY-320 | Realmz record-family codecs | Done |
| ISY-321 | Feature stylesheet ownership | Done |
| ISY-322 | Architecture ownership and dependency enforcement | Done |

## Source Concentration

The baseline numbers below are exact logical line counts from commit `a450bed`; they supersede the rounded estimates in the original ISY-314 issue description. Current values were measured at `89af62a` before ISY-323 report files were added.

| Owner | Baseline entrypoint | Current entrypoint | Baseline share of owner | Current share of owner | Owner files |
| --- | ---: | ---: | ---: | ---: | ---: |
| Scripts, AP, and Encounters | 8,586 | 130 | 86.1% | 1.2% | 3 -> 50 |
| Combat | 6,772 | 196 | 100% | 2.7% | 1 -> 32 |
| Scenario generation | 5,439 | 20 | 100% | 0.3% | 1 -> 32 |
| Realmz codecs | 5,172 | 470 | 100% | 8.2% | 1 -> 13 |

The relevant owner trees grew from 27,356 to 30,430 lines while responsibilities were named, tests were added, and compatibility facades were retained. The improvement is reduced concentration and clearer ownership, not an arbitrary reduction in total source lines.

Frontend characterization grew from 4 test files at the baseline to 62 test files. The latest guardrail run executed 190 tests successfully.

## Dependency And Collision Evidence

The current graph contains six approved cross-owner edges and no owner cycle. `npm run check:architecture:report` identifies every concrete import behind those edges; adding any other edge fails the guardrail.

The most repeatedly touched behavior entrypoints during M19 were:

| Path | M19 commits touching path | Closure interpretation |
| --- | ---: | --- |
| `src/editor/scenarioSeed.ts` | 23 | Now a 20-line compiler facade |
| `src/editor/panels/ScriptsPanel.tsx` | 15 | Now a 130-line composition facade |
| `src-tauri/src/realmz.rs` | 12 | Now a codec facade over record-family modules |
| `src/editor/panels/CombatPanel.tsx` | 8 | Now a 196-line composition surface |
| `src/editor/panels/combat/MonsterWorkbench.tsx` | 6 | Remaining focused Combat hotspot, size-gated |
| `src/editor/panels/MapsPanel.tsx` | 6 | Composition and workbench state are separated |
| `src/editor/components/MapContextSidebar.tsx` | 5 | Now a seven-line compatibility facade |

## Closure Gates

Do not mark ISY-323 or M19 complete until every required pending row has observed evidence. Record commands, artifact paths, and any accepted warning in this file or the Linear closure summary.

| Gate | Status | Evidence |
| --- | --- | --- |
| Predecessors and implemented boundaries | Pass | ISY-314 through ISY-322 Done; architecture report green |
| Refactor guardrails, lint, unit tests | Pass | Clean-tree `npm run check`: 62 files and 190 tests; zero lint errors |
| TypeScript and production build | Pass | Clean-tree `npm run check`; non-desktop patch gate |
| Scenario-generation and generated baseline | Pass | Nine scenario lanes, 18 browser package exports; generated runtime baseline check passed |
| Browser project/scenario packages and desktop parity | Pass | Project and scenario package checks plus `npm run check:browser-desktop-scenario-parity` |
| Rust library and relevant byte/fixture gates | Known fixture baseline failures | 150 passed, one ignored in the library suite; integration suite reproduced the three documented failures below |
| Imported-project and Combat/maps performance | Standard lanes pass; imported-heavy follow-up | Dense Combat and map paint pass; ISY-324 tracks the pre-existing intermittent imported-heavy timing failures |
| Desktop release artifacts | Pass | Full Windows release build produced online/offline NSIS and MSI artifacts; the corrected full editor smoke matrix passed |
| Browser manual smoke | Pass for authoring surfaces | In-app browser loaded the smoke project and rendered Maps, AP, Encounters, Combat, Economy, Assets, Linter, and Export; generated round trips are covered by automated package checks |
| Fresh desktop manual smoke | Pending | Same workflows against freshly built artifacts |
| Generated files and package-source churn | Pass for automated gates | Initial clean-tree run produced no tracked churn; subsequent changes are limited to loader normalization, corrected smoke contracts, and this closure evidence |
| Fixture and exported-byte churn | Pending fixture reconciliation | Integration failures must be resolved or refreshed from accepted source evidence |
| Residual-risk follow-ups | Pass | ISY-324 through ISY-327 capture the four independent risks found by the closure run |
| Resume feature development | Pending decision | Record explicitly after all required gates pass |

### Automated closure run: 2026-07-13

The run started from clean commit `8b4bd72`.

- `npm run check` passed architecture, lint, 190 frontend tests, module-size limits, TypeScript, AP coverage, registration-code checks, map metadata, smart terrain, Combat commands, browser project/scenario packages, text style authoring, diagnostics, scenario context, all nine scenario-generation lanes, 18 package exports, the generated scenario baseline, Evidence Lab policy, and the production build.
- The Rust library phase passed 150 tests with one diagnostic test ignored. The fixture integration phase then reproduced only the three known failures listed below, so the aggregate command exited 1.
- `npm run check:browser-desktop-scenario-parity` passed.
- `npm run release:patch-gate:skip-desktop` passed, including the current Divinity manual audit and Rust library suite.
- `npm run smoke:ui:performance -- --combat-benchmark --project tmp/desktop-ui-harness/wrath-assets/WrathAssets.providence/project.json` passed all nine measured probes. Six probes remained below failure budgets with warning status; the retained report is `tmp/performance-smoke/ui-20260714-044316/ui-performance-report.json`.
- `npm run smoke:ui:map-paint -- --project tmp/editor-smoke-runs/maps-20260713-123759/Tutorial-MapsAuthoring.providence/project.json` passed against a fresh production build and painted the expected map canvas.
- The Windows release gate produced a 21.8 MB online NSIS installer, a 218.5 MB offline NSIS installer, and a 24.4 MB MSI. Its first smoke phase exposed stale harness contracts rather than product failures: map painting correctly preserved the action-point marker band, diagnostics used the current generic target wording, and Assets now labels the tab `Reference Assets`. Those assertions were corrected and rerun in focused lanes.
- `npm run smoke:editor` then passed the complete desktop matrix in 45.843 seconds: primary workflow, Maps authoring, Scripts V2, diagnostics, Text/Assets, and Assets performance. Evidence is retained under `tmp/editor-smoke-runs/matrix-20260713-235842`.
- A browser visual pass loaded `ISY-316 AP Smoke` and navigated through Maps, Action Points, Encounters, Combat, Economy, Assets, Linter, and Export. The map canvas and tile palette rendered after reload. The console retained a recoverable initial `Bundled Realmz PICT 300 is not available` atlas error even though the subsequent atlas load was visible; this is runtime noise to monitor, not a demonstrated blank-map failure.
- The imported-heavy Combat lane completed all 12 probes without functional errors, but exceeded three scenario-monster selection budgets in `tmp/performance-smoke/ui-20260714-044146/ui-performance-report.json`. Retained post-ISY-318 runs move the failure between grid, tab-open, and selection probes, so ISY-324 owns deterministic benchmark isolation and remaining optimization rather than treating this variance as an M19 extraction regression.
- The first explicit performance run exposed a benchmark-only loader defect: URL-loaded project JSON bypassed normal browser project hydration and crashed when an older schema-v4 project omitted `semanticSchema`. The benchmark loader now uses `normalizeBrowserProject`, matching the normal browser-open path; TypeScript, the production build, map paint, and both Combat benchmark modes reached their probes after the fix.
- The registration gate retained its documented unresolved official War in the Sword Lands vector (`621043` expected versus `621034` from the current source formula); the gate itself passed and this result did not change during M19.
- Vite retained its existing warning for chunks larger than 500 kB. No build or architecture gate treats that warning as a failure.
- `git status --short` remained empty after the initial automated runs, including tracked generated evidence and source-generated artifacts. The later closure hardening diff is intentionally limited to browser-project normalization, smoke-harness contract corrections, and this report.

## Known Baseline Caveats

The full closure run reproduced the three previously documented full-Rust fixture expectations, with no additional Rust failure:

- `imports_core_fixture_scenarios`: the replacement City of Bywater `Data BD` remains 88,576 bytes while the generated corpus records 88,922 bytes, followed by the missing tile-atlas expectation.
- `windows_export_promotes_macosx_scenario_resource_fork`: exported `Scenario.rsrc` does not satisfy the existing `STR# Map Names` expectation.
- `authored_scrolling_text_exports_same_id_text_and_style_resources`: the fixture expects exported `TEXT -200`.

These remain separate from demonstrated M19 extraction behavior, but ISY-323 cannot claim a fully green `npm run check` until they are reconciled or the fixture expectations are deliberately refreshed from accepted source evidence. The audit must not silently relabel an existing fixture discrepancy as an extraction regression or waive a new failure as pre-existing.

## Residual-Risk Queue

- **ISY-324** stabilizes imported-heavy Combat timing while icon previews and semantic mapping are active. It is related to the completed ISY-273 work and does not relax existing budgets.
- **ISY-325** reconciles the accepted City of Bywater source copy, generated corpus metadata, and tile-atlas expectation.
- **ISY-326** resolves the Windows `Scenario.rsrc` `STR# Map Names` promotion expectation.
- **ISY-327** resolves authored same-ID `TEXT`/`styl` export fixture coverage.

These issues are deliberately outside M19 extraction scope. They retain exact failing tests and evidence requirements so feature work can resume after the remaining desktop and manual closure gates without losing the risks.
