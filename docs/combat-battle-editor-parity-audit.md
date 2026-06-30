# Combat Battle Editor Parity Audit

Status vocabulary: `covered`, `label-fix`, `validation-gap`, `source-backed`, `fixture-gated`, `defer`.

## Scope

This audit covers the Divinity Manual Battle Editor chapter against Providence's Combat > Battle Editor. The pass targets modern Realmz 8+ runtime behavior and does not change `Data BD` storage, import/export, project schema, or writer behavior.

## Field And Control Audit

| Divinity / Runtime Concept | Providence Control | Backing Data | Evidence | Status | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Battle record | Battle Editor numeric field with previous/next paging | `Data BD` record index, 346-byte record | `docs/format-evidence-cards/battle-record-runtime-anchors.md`; `F:\Realmz\src\realmz_orig\combat.c` | covered | None for this pass. |
| Before string | `Before String` numeric field with previous/next paging and preview/edit disclosure | `messagebefore` at `Data BD + 340` | `combat.c` displays `messagebefore` through `textbox`; battle evidence card | covered | Keep string terminology; do not call this a message in the Battle Editor UI. |
| After string | `After String` numeric field with previous/next paging and preview/edit disclosure | `messageafter` at `Data BD + 342` | `combatsetup.c` copies to runtime `messageafter`; battle evidence card | covered | Keep string terminology. |
| Distance | `Distance` field with inline 1-30 guidance | `dist` byte at `Data BD + 338` | Manual says 1-30; `combatsetup.c` calls `Rand(battle.dist)` | source-backed | Preserve imported out-of-range values, warn near field. |
| Monster placement grid | 13 x 13 grid with scenario monster paint palette | `battle[13][13]` signed shorts in source order `x * 13 + y` | `structs.h`; `combatsetup.c` loops `tt` rows and `t` columns, then reads `battle.battle[t][tt]` and loads `abs(value)` from `Data MD`; Divinity palette browses scenario battle monsters with list navigation; observed Divinity UI exposes battle-authorable IDs through 217 while later placeholders are not usable authored monsters | covered | Providence palette shows scenario `Data MD` monsters only, capped to IDs 1-217 for battle painting. Monster Scrapbook entries must be explicitly copied into Scenario Monsters before painting. Providence displays cells in Realmz source coordinate order without changing stored `Data BD` bytes. |
| Monster 0 placement | Monster 0 is excluded from the battle paint palette | Grid value `0` is empty | `combatsetup.c` only loads nonzero grid entries, then seeks `abs(value) * sizeof monster[0]` | source-backed | Keep `Monster 0` editable as `Data MD`; never write `0` as a placed battle monster. |
| 100 monster physical limit | Grid count `N / 100 runtime monster slots used` | Runtime `maxmon` cap | Manual states 100; `main.c` / `variables.h` define `maxmon 100`; `combatsetup.c` stops when `nummon < maxmon` fails | validation-gap | UI warns above 75 and above 100; existing validation also warns above 100. |
| Lower-right anchor / erase | Anchor-cell labels and erase-mode footprint click | Same signed grid cell | Manual says large/tall/wide monsters place/erase by lower-right square; Providence footprint renderer already treats grid cell as lower-right anchor | source-backed | Full parity is covered for visible footprint erase when local overlay click can resolve the anchor. |
| Force Friends | Brush and selected-cell `Force Friends` toggle | Negative signed grid value | Manual Force Friends; `combatsetup.c` flips loaded monster `traiter` when grid value is negative | source-backed | Keep negative value storage; show normal vs forced friendly side. |
| Battle Macro | `Battle Macro` numeric field with previous/next paging and Flow Preview disclosure | `battlemacro` at `Data BD + 344` | Manual describes an Extra Action Point activated at the end of each round; `getup.c` runs only negative `battlemacro`; opcode 126 rejects positive values | source-backed | New selections write the runnable negative value. Preserve positive imports and warn until edited. |
| Battle Macro 0 | Battle Macro field treats 0 as no assigned macro | `battlemacro` signed short | `getup.c` checks `battle.battlemacro < 0`; `0` is inactive and cannot be a negative id | source-backed | Keep `Extra Action Point 0` editable elsewhere; do not present it as an active battle macro option. |
| Missing monster references | Selected-cell missing monster panel with targeted built-in copy | Grid `abs(value)` to `Data MD` id | `combatsetup.c` uses `abs(value)`; Monster Scrapbook copy uses same target id when available | fixture-gated | Source-backed repair exists; keep fixture examples as future regression coverage. |

## Current Gaps After This Pass

- Fixture examples for imported battle grids with missing `Data MD` monsters and matching Monster Scrapbook entries.
- Fixture examples for imported positive Battle Macro values, if any scenario relies on preserving that compatibility state before edit.
- No schema or writer gaps are known for the Battle Editor fields covered here.
