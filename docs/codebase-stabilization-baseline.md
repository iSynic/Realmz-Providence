# M19 Codebase Stabilization Baseline

This document defines the guardrails for M19: Codebase Stabilization & Modularization. M19 is an incremental extraction effort, not a rewrite or visual redesign. Public editor behavior, project schema, imported data, and exported Realmz bytes remain stable unless a separate issue explicitly changes them.

## Source Hotspots

| Area | Current owner | Approximate size | Primary responsibilities | Planned boundary |
| --- | --- | ---: | --- | --- |
| Scripts and encounters | `src/editor/panels/ScriptsPanel.tsx` | 8.3k lines | AP selection, step editing, diagnostics, simple/complex/Rogue encounters, target pickers | Encounter workbenches and AP step workbenches become feature modules behind stable panel props. |
| Combat | `src/editor/panels/CombatPanel.tsx` | 6.5k lines | Battles, scenario monsters, reference/custom libraries, art and icon workflows | Split by author workflow while retaining one Combat panel composition root. |
| Scenario generation | `src/editor/scenarioSeed.ts` | 5.1k lines | Parse, validate, allocate, compile maps/records/scripts, assemble and validate projects | Explicit parse, allocation, compiler-family, and assembly stages with one stable public facade. |
| Shared domain shell | `src/editor/components/SuiteDomainPanel.tsx` | 3.7k lines | Domain navigation, selection routing, shared workbench composition | Separate navigation/composition from domain-specific state and actions. |
| Map context | `src/editor/components/MapContextSidebar.tsx` | 2.8k lines | Selection summary, AP inspection, map records, terrain and overlay controls | Split inspector sections and command adapters from the sidebar shell. |
| Realmz codecs | `src-tauri/src/realmz.rs` | 4.9k lines | Binary readers/writers, record codecs, export support, tests | Record-family codec modules with byte-parity fixtures and a stable Tauri command facade. |
| Styling | `src/styles.css` and feature CSS | shared | Layout and visual contracts across editor domains | Move rules alongside extracted ownership without redesigning the UI. |

`src/editor/map/generatedSmartTerrainProfiles.ts` is generated corpus output. It is excluded from manual modularization and lint review. Changes must come from its generator and continue to pass `npm run check:smart-terrain-profiles`.

The executable size baseline is in `scripts/check_module_size_baseline.mjs`. It covers the six primary TypeScript/Rust hotspots and all eight owned feature stylesheets. A hotspot may shrink without updating the baseline; growth fails the check and requires either extracting the new responsibility or making an explicit ownership/baseline decision. Generated terrain profiles are intentionally absent.

## Stable Public Contracts

Extraction work must preserve these entrypoints unless an issue explicitly approves a migration:

- `ScriptsPanel`, `CombatPanel`, `SuiteDomainPanel`, and `MapContextSidebar` component props and application routing.
- `parseScenarioSeed` and `createProjectFromScenarioSeed`, including diagnostics and allocation reports.
- Browser and desktop project-package commands and the current project schema version.
- Tauri command names, serialized payloads, resource IDs, record ranges, and exported bytes.
- Existing CSS class names used by smoke tests until their owning extraction updates those tests in the same commit.

## No-Behavior-Change Protocol

1. Add or identify characterization coverage before moving logic.
2. Extract one responsibility at a time; keep the original public facade and data flow intact.
3. Avoid opportunistic renaming, formatting churn, UI restyling, schema changes, and binary changes in extraction commits.
4. Compare behavior before and after with the smallest relevant checks, then run the broader gate for the owning issue.
5. Keep generated files generated. Never hand-edit generated terrain profiles to make an extraction compile.
6. If a latent bug must be fixed, separate it from the extraction when practical and describe the behavior change explicitly.

## Validation Matrix

| Changed area | Required focused checks | Closure checks |
| --- | --- | --- |
| Pure TypeScript helpers | `npm run lint`, `npm run test:unit`, `npm run typecheck` | `npm run build` |
| Scripts/AP/encounters | Above plus `npm run check:ap-actions`, `npm run check:ap-action-gaps`, `npm run check:script-diagnostics` | `npm run smoke:editor:scripts-v2` and relevant editor smoke |
| Scenario generation | Above plus `npm run check:scenario-seed`, `npm run check:generated-scenario-baseline` | `npm run smoke:scenario-generation` |
| Maps and terrain | Above plus `npm run check:smart-terrain-profiles`, `npm run check:map-tile-metadata` | `npm run smoke:editor:maps` |
| Combat | Above plus `npm run check:combat-monsters` | Relevant Combat editor smoke and build |
| Browser package | `npm run check:browser-project-package`, `npm run check:browser-scenario-package` | `npm run check:browser-desktop-scenario-parity` when package behavior is touched |
| Rust codecs/export | Focused `cargo test` module or fixture tests | `npm run test:rust`; byte round-trip/oracle gates when owned bytes change |
| Release closure | `npm run check` | Desktop release gates from `docs/release-checklist.md` |

### Fixture baseline on 2026-07-12

The Rust library suite passes (`136 passed`, `1 ignored`). The full `npm run test:rust` command reaches the fixture round-trip integration suite and currently has three pre-existing corpus/fixture failures that are tracked separately from M19 extraction work:

- `imports_core_fixture_scenarios`: the replaced City of Bywater `Data BD` is 88,576 bytes while the generated corpus records 88,922 bytes, followed by the tile-atlas expectation.
- `windows_export_promotes_macosx_scenario_resource_fork`: exported `Scenario.rsrc` does not satisfy the existing `STR# Map Names` expectation.
- `authored_scrolling_text_exports_same_id_text_and_style_resources`: the fixture expects exported `TEXT -200`.

M19 changes must keep the library suite green and must not add fixture failures. These three expectations should be reconciled in dedicated fixture/corpus work before making the full Rust command a hard M19 closure gate.

## Guardrail Commands

- `npm run lint` checks TypeScript/TSX syntax, duplicate imports, and React Hooks rules against the recorded warning ceiling.
- `npm run lint:report` prints every current lint finding when investigating or reducing the baseline.
- `npm run test:unit` runs fast deterministic characterization tests for pure editor and compiler contracts.
- `npm run check:guardrail-self-tests` proves that lint errors, new warning categories, warning growth, and hotspot growth are rejected.
- `npm run check:module-sizes` prevents the recorded God files and feature stylesheets from growing silently.
- `npm run check:refactor-guardrails` runs lint, unit tests, and module-size checks and is included in `npm run check`.

The initial tests cover signed AP target behavior, target filtering, opcode normalization, EDCD action/field contracts, semantic road topology, named terrain resolution, scenario-seed strict parsing, deterministic keyed allocation, encounter response compilation, and semantic road map compilation. Each M19 extraction should add coverage for the responsibility it moves.

### Initial lint baseline

The first lint run found duplicate imports in nine modules; those imports were consolidated during ISY-314 and `no-duplicate-imports` is now an error everywhere. Two false hook findings caused by an event handler named with a `use` prefix were also removed. The remaining baseline is 79 hook dependency warnings across legacy components and 18 genuine hook-order findings in `ScriptsPanel.tsx`. `scripts/check_eslint_baseline.mjs` fails on errors, new warning categories, or growth in either count while allowing M19 extractions to reduce them. Hook-order findings are only downgraded in `ScriptsPanel.tsx`; that exception must be removed when ISY-315/ISY-316 establish unconditional component boundaries.
