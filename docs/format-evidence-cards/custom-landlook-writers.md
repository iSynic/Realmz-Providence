# Evidence Card: Custom Landlook Writers And Edit Land Tiles

## User-Facing Unlock

Providence can show the current landlook's tiles, movement metadata, and combat-map expansion with Divinity parity. Editing built-in Realmz landlooks remains read-only. Scenario-custom landlook editing becomes writable only after custom file/resource behavior is proven.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:87` | `struct mapstats` defines tile sound, move time, solidity, shore/path/boat/LOS/fly/forest metadata, and `build[3][3]`. |
| `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c:36` | `loadpixmap(id)` loads landlook graphics and mapstats. |
| `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c:48` | Custom land files use a scenario/path prefix branch. |
| `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c:132` | The landlook loader reads combat tile build data into `mapstats`. |
| `F:\Realmz\src\realmz_orig\combatmap.c:102` | Outdoor combat expansion uses `mapstats[temp].build[3][3]`. |
| `F:\Realmz\src\realmz_orig\buttonchoice.c:126` | Movement sounds come from `mapstats[temp].sound`. |
| `F:\Realmz\src\realmz_orig\buttonchoice.c:132` | Movement time/cost comes from `mapstats[temp].time`. |
| `F:\Realmz\src\realmz_orig\buttonchoice.c:153` | Boat/water requirements come from `mapstats[temp].needboad`. |
| `F:\Realmz\src\realmz_orig\buttonchoice.c:164` | Runtime path marking depends on `mapstats[hit].ispath`. |
| `F:\Realmz\src\realmz_orig\cansee.c:39` | LOS blocking consults `mapstats[newhit].los`. |

## Divinity Evidence

| Manual Line | Evidence |
| ---: | --- |
| 4526 | Divinity has a Creating Special Land Tiles chapter. |
| 4852-4872 | Divinity's Edit Land Tiles screen exposes Sound, Time/Move, Solid Type, Shore, Path, Boat, Blocks LOS, Need Fly/Float, and Special Type metadata. |
| 5017-5023 | Special land icons can be placed on land tiles after adding `cicn` resources. |
| Screenshot evidence | Edit Land Tiles shows tile art, import picture controls, base tile, combat map grid, build/copy flags, and land tile attribute controls. |

## Byte Layout Notes

- Built-in landlook data is Realmz library/reference data and should not be changed by scenario export.
- `mapstats.build[3][3]` is the source-backed outdoor combat expansion grid.
- `Data Solids` is not the standard land tile attribute table; it supplies special negative/icon solidity evidence.
- Custom landlook metadata files observed in the corpus are 8,104 bytes:
  - bytes `0..8039`: 201 `mapstats` records, 40 bytes each.
  - bytes `8040..8041`: `basetile`.
  - bytes `8042..8043`: `basescale`.
  - bytes `8044..8103`: ten 6-byte range slots, each `first tile`, `last tile`, `reserved`.
- The first four range slots match Divinity's Edit Land Tiles range UI:
  - slot 0: Mountain range.
  - slot 1: Open range.
  - slot 2: Rubble range.
  - slot 3: House range.
- Common observed tail: `62..85`, `155..158`, `159..167`, and `190..200`, with zero reserved values and unused slots zeroed.
- `docs/generated/custom-landlook-coverage.json` now inventories every observed custom landlook metadata file, linked `PICT 306..308`, and `Custom 1/2/3` companion file.
- Metadata writing is fixture-proven for owned two-byte fields only. Writer-safe metadata fields are tile sound, time/move, solid type, shore, boat requirement, path flag, LOS flag, fly/float flag, forest/special type, clear/base tile, combat build grid, `basetile`, `basescale`, and the first/last values of range slots.
- Preserve-only metadata fields are `spare` and every range-slot `reserved` word.
- Custom landlook picture/resource replacement remains limited to preserve-or-replace-through-known-good `PICT` import. Providence does not edit arbitrary PICT opcodes.
- `Custom 1/2/3` companion files are preserved-known compatibility/custom-landlook payloads until Realmz source or Divinity binary evidence proves exact runtime semantics.

## Corpus Evidence

- Map files and `Data Solids` appear in 44/44 corpus scenarios.
- Custom landlook mapstats files are already present in the generated summaries: `Data Custom 1 BD` 32/87, `Data Custom 2 BD` 15/87, and `Data Custom 3 BD` 9/87 visible byte-roundtrip scenario roots.
- In the local Divinity CD scenario set, 25 `Data Custom * BD` files were sampled and all were 8,104 bytes. Their 60-byte tails reduce to five observed patterns. The most common pattern appears 18 times and encodes Mountain `62..85`, Open `155..158`, Rubble `159..167`, and House `190..200`.

## Providence Follow-Up

- Follow-up: `parser-only`, `editor-ui`, `validation`, then `parser-writer` only after fixtures.
- Keep Land Tiles mode as a first-class workbench for atlas browsing and combat-preview inspection.
- Keep Save Tiles/Load Tile Map/Import Picture Bounds hidden until atlas replacement fixtures prove `PICT 306..308` packaging for edited custom art.
- Use the metadata writer gate for custom landlook attribute and combat-grid edits only on scenario custom landlooks.
- Keep built-in Realmz landlooks read-only.

## Writer Gate

Metadata writer gate is partially open for scenario custom landlooks. Providence can re-encode `Data Custom 1/2/3 BD` byte-identically and fixture tests prove owned two-byte mutations touch only their intended fields. Built-in landlooks remain read-only. Atlas/art replacement and `Custom 1/2/3` companion writes remain preserve-only until resource packaging fixtures prove exact behavior.
