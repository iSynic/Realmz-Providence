# Evidence Card: Custom Landlook Writers And Edit Land Tiles

## User-Facing Unlock

Providence can show and author scenario-custom landlook movement metadata, combat-map expansion, and normalized atlas art while keeping built-in Realmz landlooks read-only. Metadata and generated atlas packaging are authoritative.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:87` | `struct mapstats` defines tile sound, move time, solidity, shore/path/boat/LOS/fly/forest metadata, and `build[3][3]`. |
| `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c:36` | `loadpixmap(id)` loads landlook graphics and mapstats. |
| `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c:48` | Custom land files use a scenario/path prefix branch. |
| `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c:66-76` | Custom landlook IDs 6, 7, and 8 select `Data Custom 1`, `Data Custom 2`, and `Data Custom 3` before the metadata ` BD` suffix is appended. |
| `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c:83` | Landlook art is loaded as `GetPicture(300 + id)`, proving custom landlook art resources `PICT 306..308`. |
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
- Runtime lookup is source-backed:
  - landlook 6: `Data Custom 1 BD` plus `PICT 306`.
  - landlook 7: `Data Custom 2 BD` plus `PICT 307`.
  - landlook 8: `Data Custom 3 BD` plus `PICT 308`.
- Metadata writing is fixture-proven for owned two-byte fields only. Writer-safe metadata fields are tile sound, time/move, solid type, shore, boat requirement, path flag, LOS flag, fly/float flag, forest/special type, clear/base tile, combat build grid, `basetile`, `basescale`, and the first/last values of range slots.
- The native `spare` and range-slot `reserved` words are not canonical fields. They are neutral zero in fresh output and may be restored only from an imported compatibility annex.
- Custom landlook picture/resource replacement is limited to generated 640 x 320 `PICT` atlas payloads written through Providence's normalized image import. Providence does not edit arbitrary PICT opcodes.
- `Custom 1/2/3` companion files are not opened by Realmz `loadpixmap` for landlook runtime loading. They remain preserved-known compatibility/media/intermediate payloads until separate Realmz or Divinity evidence proves another role.

## Corpus Evidence

- Map files and `Data Solids` appear in 44/44 corpus scenarios.
- Custom landlook mapstats files are already present in the generated summaries: `Data Custom 1 BD` 32/87, `Data Custom 2 BD` 15/87, and `Data Custom 3 BD` 9/87 visible byte-roundtrip scenario roots.
- In the local Divinity CD scenario set, 25 `Data Custom * BD` files were sampled and all were 8,104 bytes. Their 60-byte tails reduce to five observed patterns. The most common pattern appears 18 times and encodes Mountain `62..85`, Open `155..158`, Rubble `159..167`, and House `190..200`.

## Providence Follow-Up

- Keep the generated tile-attribute/custom-landlook DTOs and semantic-only writers as the canonical metadata boundary.
- Keep Land Tiles mode as a first-class workbench for atlas browsing and combat-preview inspection.
- **Implemented:** use deterministic normalized `PICT 306..308` replacements for custom atlas art; keep arbitrary PICT editing and Divinity Save Tiles/Load Tile Map semantics out of normal UI.
- Use the metadata writer gate for custom landlook attribute and combat-grid edits only on scenario custom landlooks.
- Keep built-in Realmz landlooks read-only.
- Add fork-aware Classic-Mac packaging before repeating the generated Custom 1 proof in stock Realmz 7.1.2; the first Basilisk II run reached map startup but could not see `PICT 306` because the ordinary `.rsrc` ZIP entry was not attached as the HFS resource fork of `Scenario`.

## Writer Gate

Metadata writer gate is open for scenario custom landlooks. Fresh Providence projects generate the exact 8,104-byte core from canonical fields. Edited legacy projects compile that same semantic core and recover only spare/reserved words and any post-core tail from the compatibility annex; untouched files remain pass-through. Poison tests prove embedded compatibility bytes cannot influence authored output, and browser/desktop parity plus reimport are proof-gated. Atlas replacement is open only for `PICT 306..308` generated by Providence's normalized 640 x 320 image-to-PICT path; both compiler boundaries reject a ready custom-atlas asset whose converted payload does not match that form. The ownership proof generates Custom 1 metadata plus `PICT 306` with no annex, obtains byte-identical browser/Rust output on both targets, recovers the atlas on reimport, and loads and renders it in the existing modern Realmz runtime with no fatal resource markers. An ordinary modern build also accepts and selects the generated scenario. A stock Realmz 7.1.2 run discovered the scenario but confirmed that the portable `.rsrc` ZIP does not reconstruct the required HFS resource fork; Classic gameplay therefore remains an optional packaging follow-up rather than a writer-gate blocker. Built-in landlooks remain read-only. `Custom 1/2/3` companion files remain preserve-only.
