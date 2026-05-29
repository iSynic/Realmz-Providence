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
- Custom landlook files and resource IDs need a dedicated binary/source/fixture pass before writer support.

## Corpus Evidence

- Map files and `Data Solids` appear in 44/44 corpus scenarios.
- Custom landlook file frequency is not yet present in the generated summaries and should be added to `unknown-data-backlog.json`.

## Providence Follow-Up

- Follow-up: `parser-only`, `editor-ui`, `validation`, then `parser-writer` only after fixtures.
- Keep Land Tiles mode as a first-class workbench for atlas browsing and combat-preview inspection.
- Add a custom landlook writer gate card before enabling Save Tiles, Load Tile Map, Import Picture Bounds, or combat-grid edits.
- Add corpus detection for custom landlook files and linked resource IDs.

## Writer Gate

Do not add writable landlook metadata controls until these are proven: custom file names, record counts, `mapstats` record size/order, graphic/resource IDs, endianness, trailing bytes, and Divinity save/load behavior.

