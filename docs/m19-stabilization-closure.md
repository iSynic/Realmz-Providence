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
| Refactor guardrails, lint, unit tests | Pass | 62 files and 190 tests; zero lint errors |
| TypeScript and production build | Pass | `npm run typecheck`; `npm run build` |
| Scenario-generation and generated baseline | Pending fresh closure run | `npm run check:scenario-seed`; `npm run check:generated-scenario-baseline` |
| Browser project/scenario packages and desktop parity | Pending fresh closure run | Package and parity checks from `docs/release-checklist.md` |
| Rust library and relevant byte/fixture gates | Pending fresh closure run | Record exact passing scope and separately classify known corpus expectations |
| Imported-project and Combat/maps performance | Pending | Run the applicable performance and map-paint smokes on representative projects |
| Desktop release artifacts | Pending | Run the full release gate from a clean tree |
| Browser manual smoke | Pending | Maps, AP, Encounters, Combat, Economy, Assets, Linter, Export, generated scenario round trip |
| Fresh desktop manual smoke | Pending | Same workflows against freshly built artifacts |
| Generated files, fixtures, packages, and byte churn | Pending | Review clean-tree diffs and retained gate artifacts |
| Residual-risk follow-ups | Pending | Create only narrowly scoped issues backed by closure evidence |
| Resume feature development | Pending decision | Record explicitly after all required gates pass |

## Known Baseline Caveats

The three previously documented full-Rust fixture expectations remain separate from M19 extraction behavior: the replaced City of Bywater `Data BD` corpus baseline, exported `Scenario.rsrc` `STR# Map Names`, and authored scrolling-text `TEXT -200`. The closure audit must rerun and classify them; it must not silently relabel an existing fixture discrepancy as an extraction regression or waive a new failure as pre-existing.
