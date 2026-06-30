# Bestiary Source Alignment

## Finding

Modern Realmz treats the scenario bestiary as generated menu evidence, not as the authoring source for monsters. Providence should author scenario monsters from `Data MD` plus `Data DES`, keep imported `Data MENU` as read-only evidence, and let Realmz rebuild `Data MENU` when it loads the exported scenario.

## Runtime Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\menuinit.c:388` | Realmz attempts to open `Data MENU` as a quick-load menu cache. |
| `F:\Realmz\src\realmz_orig\menuinit.c:408` | Realmz opens `Data MD` when rebuilding menu data. |
| `F:\Realmz\src\realmz_orig\menuinit.c:423` | Menu rebuild filters active monsters by `hd` and `notonmenu`. |
| `F:\Realmz\src\realmz_orig\menuinit.c:438` | Debug/source path describes rebuilding `Data MENU` from `Data MD`. |
| `F:\Realmz\src\realmz_orig\menuinit.c:494` | Realmz writes the rebuilt `Data MENU` cache. |
| `F:\Realmz\src\realmz_orig\beast.c:52` | Bestiary opens `Data MD` to show monster details. |
| `F:\Realmz\src\realmz_orig\beast.c:109` | Bestiary opens `Data DES` to show monster description text. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:277` | Battle setup opens `Data MD` for combat monster templates. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:300` | Battle grid values seek into `Data MD` by absolute monster ID. |

## Providence Policy

- `Data MD` is the scenario-authored monster table.
- `Data DES` is the scenario-authored monster-description text table.
- `Data MENU` is generated cache evidence and should not be exported as authored scenario data.
- Monster Scrapbook is reusable editor/library material, not a runtime scenario monster source.
- Battle grids should paint scenario `Data MD` monsters only. Built-in Monster Scrapbook entries can be copied into scenario `Data MD`, then painted as scenario monsters.

## UI Implications

- Combat should label the editable monster tab as `Scenario Monsters`.
- The `Scenario Monsters` list should only count and browse `Data MD` records.
- Monster Scrapbook should be the explicit read-only/template browser and should expose `Copy To Scenario Monster N`.
- Missing battle-grid monster repair may offer a targeted copy from scrapbook by ID, but the repaired `Data BD` cell must still reference the resulting scenario monster ID.

## Export Implications

- Import and semantic graph generation may retain `Data MENU` for evidence.
- Desktop export should not pass through `Data MENU`.
- Browser/portable export should not synthesize `Data MENU`.
- Realmz rebuilds the bestiary cache from exported `Data MD` and `Data DES` on scenario load.

## Remaining Fixture Needs

- Imported-scenario examples for missing battle-grid monster repair.
- Divinity before/after examples for any Monster Scrapbook workflow that writes back into scenario records outside the already modeled `Data MD`/`Data DES` copy path.
