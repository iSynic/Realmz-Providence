# M19 Codebase Stabilization Baseline

This document defines the guardrails for M19: Codebase Stabilization & Modularization. M19 is an incremental extraction effort, not a rewrite or visual redesign. Public editor behavior, project schema, imported data, and exported Realmz bytes remain stable unless a separate issue explicitly changes them.

## Authoritative Architecture Contract

This is the canonical developer architecture document for Providence. The README links here; feature and archaeology documents may describe behavior or evidence, but must not redefine module ownership. The authoring manual remains user-facing and should not contain contributor architecture rules.

### Ownership map

| Concern | Composition or public entrypoint | Internal owner | Boundary |
| --- | --- | --- | --- |
| Scripts and Action Points | `src/editor/panels/ScriptsPanel.tsx` | `src/editor/panels/scripts/ActionPoint*`, `SelectedActionPointStepEditor.tsx`, diagnostics, draft, and command helpers | Scripts UI may use shared editor/domain modules, but must not import Combat or Maps feature internals. The read-only `scriptActionCatalog.ts` is an explicit shared catalog used by Combat result authoring. |
| Encounters | `src/editor/panels/ScriptsPanel.tsx` | `src/editor/panels/scripts/Encounter*`, `ThiefEncounterShell.tsx`, and `TimedEncounterShell.tsx` | Encounter UI shares the Scripts feature boundary and sends typed project commands rather than owning persistence. |
| Combat | `src/editor/panels/CombatPanel.tsx` | `src/editor/panels/combat/*` | Battle, monster, icon-set, and library workbenches are private to Combat. Other panels use project records or shared helpers, not Combat components. |
| Maps | `src/editor/panels/MapsPanel.tsx` | `src/editor/panels/maps/*` and `src/editor/components/maps/*` | The panel owns workbench state and canvas composition; map inspectors own selection presentation. Other domains do not import Maps feature internals. |
| Shared suite and economy tools | `src/editor/panels/SuiteDomainPanel.tsx` | `src/editor/panels/suite/*` and `src/editor/panels/economy/*` | Suite routing composes domain workbenches. Record mutation still goes through project commands. |
| Scenario generation | `src/editor/scenarioSeed.ts` | `src/editor/scenarioSeed/*` parser, allocation, compiler, terrain, and validation stages | Consumers import the facade. Compiler modules cannot depend on UI or browser storage/package code. Exact bridge imports provide the existing default-project validator and bundled landlook/atlas metadata; two pure project-command helpers are intentionally reused by `coreRecordCompiler.ts`. |
| Project mutation | `src/editor/projectCommands.ts` | `src/editor/projectCommands/*` command families | `applyProjectCommand` is the editor mutation facade. UI and harness code dispatch `ProjectCommand`; deep command imports are private except the documented compiler reuse. |
| Editor state and history | `src/editor/store.ts` | Store reducer and action model | The store owns current project replacement, undo/redo, dirty state, and command history. Feature components do not create a second project store. |
| Browser project import/storage | Named modules under `src/editor/browser/*` | `project.ts`, `projectStore.ts`, `workspaceStore.ts`, `realmzParser.ts`, and support codecs | Browser infrastructure may depend on shared project types and low-level helpers, but not editor panels, project commands, or the scenario compiler. |
| Browser package export | `src/editor/browser/projectPackage.ts` and `src/editor/browser/scenarioPackage.ts` | Browser binary/resource writers and ZIP support under `src/editor/browser/*` | Browser export is independent of UI feature modules and remains parity-tested against desktop behavior. |
| Desktop export | `src-tauri/src/commands.rs` -> `src-tauri/src/exporter.rs` | Tauri command adapter and exporter orchestration | Command names and serialized payloads are stable. Binary ownership is delegated to the Realmz codec facade. |
| Realmz codecs | `src-tauri/src/realmz.rs` | Private record-family modules under `src-tauri/src/realmz/*` | Rust callers use `crate::realmz` reexports. Record-family modules stay private and assembly coordinates them without exposing private paths. |
| Feature styling | `src/editor/styles/*.css` and `src/editor/ui/workbench.css` | Stylesheets named for their owning feature or surface | Add rules to the narrowest existing owner. Do not restore rules to the legacy root stylesheet or duplicate selectors across feature files. |

### State and data flow

| Data kind | Source of truth | Derived or preview owner | Persistence/export owner |
| --- | --- | --- | --- |
| Editable scenario/project records | `Project` in `src/editor/types.ts`, held by `src/editor/store.ts` | Feature selectors, lookup helpers, inspectors, and preview components | Browser stores/packages or the Tauri save/export commands |
| Mutations and history labels | `ProjectCommand` plus `src/editor/projectCommands.ts` | Feature-specific draft state may stage inputs, but cannot silently become project truth | Store reducer applies commands and records undo/redo history |
| Scenario JSON generation | Parsed seed contracts returned by `src/editor/scenarioSeed.ts` | Compiler diagnostics, allocation reports, and preflight reports | Compiled `Project`, then the normal browser/desktop package path |
| Imported raw scenario bytes | Browser raw-source snapshots or desktop project raw sources | Semantic schemas, validation, resource previews, and archaeology reports | Conservative writers replace supported data and preserve compatible unsupported bytes |
| Asset/media previews | Project/resource records and reusable library catalogs | Resource preview and feature-specific preview components | Assets remain in their declared workspace, custom-library, or scenario scope until export |

### Where new code belongs

- Extend an existing feature directory when the behavior is used by one authoring tool and consumes that tool's props/state.
- Put reusable pure record logic beside the domain model, not in a React component. Add a focused unit test there.
- Add a new `ProjectCommand` family helper when the change mutates project truth and must participate in undo/redo, dirty tracking, labels, or change counts.
- Add browser import, IndexedDB, ZIP, resource-fork, or browser writer behavior under `src/editor/browser`; do not call UI feature modules from storage code.
- Add binary parsing/writing to the matching private Rust record-family module, then reexport only the contract needed by callers through `src-tauri/src/realmz.rs`.
- Create a new shared abstraction only after at least two owners need the same stable contract. Do not move feature-specific code to a generic folder merely to shorten a file.

The executable size baseline is in `scripts/check_module_size_baseline.mjs`. It covers the extracted TypeScript/Rust hotspots and owned feature stylesheets. A hotspot may shrink without updating the baseline; growth fails the check and requires either extracting the new responsibility or making an explicit ownership/baseline decision. Generated outputs are intentionally absent.

## Stable Public Contracts

Extraction work must preserve these entrypoints unless an issue explicitly approves a migration:

- `ScriptsPanel`, `CombatPanel`, `MapsPanel`, `SuiteDomainPanel`, and map inspector component props and application routing.
- `src/editor/scenarioSeed.ts`: `parseScenarioSeed`, `createProjectFromScenarioSeed`, contracts, diagnostics, and allocation reports.
- `src/editor/projectCommands.ts`: `applyProjectCommand`, command labels, and change counts.
- Browser project/package module exports and the current project schema version.
- `src-tauri/src/commands.rs`: Tauri command names and serialized payloads.
- `src-tauri/src/realmz.rs`: public parser/writer reexports, resource IDs, record ranges, and exported byte behavior.
- Existing CSS class names used by smoke tests until their owning extraction updates those tests in the same commit.

`npm run check:architecture` enforces the practical dependency rules and the presence of these facades. It intentionally does not ban every existing cross-layer import: broad layering rules would create busywork and hide the boundaries that protect compiler, storage, export, and feature ownership.

The checker records narrow exceptions rather than directory-wide exemptions. Current exceptions are Combat's read-only use of the Scripts action catalog; scenario generation's use of browser-hosted default-project validation and reference landlook/atlas metadata; and `coreRecordCompiler.ts` reuse of pure target-record/rules command helpers. New imports across those boundaries fail unless ownership is deliberately revised here and in the checker.

Facade behavior is characterized at the public entrypoint: `src/editor/scenarioSeed.test.ts` covers parsing and compilation through `scenarioSeed.ts`; `src/editor/projectCommands.test.ts` covers immutable command application and history metadata; Rust record-family round trips exercise the `realmz.rs` reexports; and browser/desktop package parity has dedicated package checks. The architecture checker additionally fails if those public symbols disappear.

## Generated-Source Policy

Generated output is source controlled when the application or validation gates consume it. Do not hand-edit generated evidence to make a check pass.

`docs/generated-artifact-policy.json` is the exhaustive machine-readable registry for source-controlled files under `docs/generated`, `src/editor/generated`, and the generated smart-terrain profile. Every reproducible family names its `npm run` command. Evidence snapshots that were assembled from source archaeology rather than emitted by a current generator are listed separately as curated evidence; update those only with corresponding source/evidence citations. Ignored transient reports are outside the registry. `npm run check:architecture` fails on missing commands, commands that do not reference their claimed outputs, duplicate claims, missing outputs, or an unclassified tracked artifact.

| Output | Generator | Required verification |
| --- | --- | --- |
| `src/editor/map/generatedSmartTerrainProfiles.ts` | `npm run archaeology:smart-terrain` | `npm run check:smart-terrain-profiles` |
| `src/editor/generated/divinityOpcodeHelp.json` and the matching report | `npm run archaeology:divinity-opcodes` | `npm run check:ap-actions` |
| `src/editor/generated/opcodeEdcdCrosswalk.json` and the matching report | `npm run archaeology:opcode-crosswalk` | `npm run check:ap-actions` and the relevant diagnostics report |
| `src/editor/generated/scenarioCoverageManifest.json` and scenario coverage reports | `npm run archaeology:byte-coverage` | Review the generated diff, then run `npm run typecheck` and the relevant writer/coverage gate |
| Other reproducible `docs/generated/*` families | The command recorded in `docs/generated-artifact-policy.json` | Run that command's `--check` mode when available; otherwise review the complete generated diff |

Despite its name, `src/editor/browser/generatedScenarioBaseline.ts` is executable browser export infrastructure, not a generated artifact. Changes to it require `npm run check:generated-scenario-baseline` and `npm run smoke:scenario-generation`.

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
| Pure TypeScript helpers | `npm run lint`, `npm run test:unit`, `npm run check:architecture`, `npm run typecheck` | `npm run build` |
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
- `npm run check:architecture` rejects feature-domain crossings, core-to-UI dependency leaks, facade bypasses, and missing stable entrypoints.
- `npm run check:guardrail-self-tests` proves that lint errors, new warning categories, warning growth, hotspot growth, and architecture violations are rejected.
- `npm run check:module-sizes` prevents the recorded God files and feature stylesheets from growing silently.
- `npm run check:refactor-guardrails` runs architecture, lint, unit, and module-size checks and is included in `npm run check`.

The initial tests cover signed AP target behavior, target filtering, opcode normalization, EDCD action/field contracts, semantic road topology, named terrain resolution, scenario-seed strict parsing, deterministic keyed allocation, encounter response compilation, and semantic road map compilation. Each M19 extraction should add coverage for the responsibility it moves.

### Initial lint baseline

The first lint run found duplicate imports in nine modules; those imports were consolidated during ISY-314 and `no-duplicate-imports` is now an error everywhere. Two false hook findings caused by an event handler named with a `use` prefix were also removed. The enforced ceilings remain 79 hook dependency warnings and 18 hook-order findings in legacy code. `scripts/check_eslint_baseline.mjs` fails on errors, new warning categories, or growth in either count while allowing later work to reduce them. Any remaining hook-order exception should be removed when the affected component can establish unconditional hook boundaries without changing behavior.
