# Runtime Note: Map Tile Attribute Anchors

This note narrows the Map Tile Intelligence card from "Data Solids probably explains tile attributes" to a more precise split:

- standard landlook tile behavior is driven by `mapstats`;
- special negative tile solidity is driven by scenario `Data Solids`;
- map field values are normalized before most runtime checks.

## Realmz Source Anchors

| Topic | Anchor | Evidence |
| --- | --- | --- |
| Runtime tile struct | `F:\Realmz\src\realmz_orig\structs.h` | `struct mapstats` contains `sound`, `time`, `solid`, `shore`, `needboad`, `ispath`, `los`, `flyfloat`, `forest`, `spare`, `build[3][3]`, and `clearlandid`. |
| Landlook attribute load | `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c` | `loadpixmap` reads 201 `mapstats` records from landlook `* BD` files, then reads `basetile[id]` and `basescale[id]`. |
| Shared combat attributes | `F:\Realmz\src\realmz_orig\main.c` | Startup reads 201 `mapstats` records from `:Data Files:Combat Data BD` into `mapstats[200]`. |
| Special negative solidity | `F:\Realmz\src\realmz_orig\misc.c` | Scenario select loads `Data Solids` into `solids[1024]`; if missing, Realmz creates a zero-filled file. |
| Negative tile solid check | `F:\Realmz\src\realmz_orig\buttonchoice.c` | For map values `-1` through `-998`, Realmz checks `solids[-hit]` before normal movement. |
| Movement semantics | `F:\Realmz\src\realmz_orig\buttonchoice.c` | Movement consumes `sound`, `time`, `solid`, `shore`, `needboad`, and `ispath`. |
| Line of sight | `F:\Realmz\src\realmz_orig\cansee.c`, `F:\Realmz\src\realmz_orig\cast.c` | LOS checks consume `mapstats[*].los`. |
| Action tests | `F:\Realmz\src\realmz_orig\newland.c` | Script tile tests check `shore`, `needboad`, `ispath`, `los`, `flyfloat`, `forest`, and exact tile id. |
| Combat terrain | `F:\Realmz\src\realmz_orig\combatmap.c` | Combat maps consume `build[3][3]`, `forest`, and terrain flags. |

## Proven Runtime Split

`Data Solids` should not be treated as Divinity's whole "Edit Land Tiles" attribute table. It is a scenario-local solidity override for special negative values. The normal tile semantics shown in Divinity's land tile editor map to `mapstats` fields loaded from standard/custom landlook `* BD` data.

Providence should therefore model tile attributes in layers:

1. **Map field value**: the signed short stored in `Data LD` or `Data DL`.
2. **Render resolution**: landlook terrain tile, dungeon bitfield, or negative `cicn` icon.
3. **Standard landlook attributes**: `mapstats` record for normalized standard tile ids.
4. **Special negative solidity**: `Data Solids[-rawValue]` for raw values `-1..-998`.
5. **Runtime/script effects**: path/note/door/secret bits and opcode-driven tile/icon mutation.

`map-field-value-runtime-anchors.md` expands layer 1. The important split is that positive high values are field-state carriers that Realmz normalizes toward terrain, while negative values are special/icon candidates that render through `cicn` art before note/path handling.

## `mapstats` Field Meanings

| Field | Runtime meaning now source-backed | Editor implication |
| --- | --- | --- |
| `sound` | Movement plays this sound when stepping on the tile. | Palette can show walk sound once sound labels are decoded. |
| `time` | Movement cost uses this directly, and dialog movement cost derives `(time / 2) - 1`. | Palette can group slow/fast terrain. |
| `solid` | Blocks party/monster/combat placement, with special handling for large monsters and boats. | Palette can group walkable vs blocking, with `solid > 1` as stronger blocking. |
| `shore` | Boat movement checks this as a shore/landing condition. | Palette can group shore/landing tiles. |
| `needboad` | Spelled this way in source. Value `1` is boat interaction; value `2` behaves as boat-required/water movement. | UI label should be "boat/water requirement" until Divinity labels are proven. |
| `ispath` | Runtime marks path bits when traversed and uses path state in movement/render. | Palette can group path-capable tiles. |
| `los` | Blocks line of sight in outdoor view and spell targeting. | Palette can group LOS-blocking tiles. |
| `flyfloat` | Used by script tile tests. Direct movement effect still needs source or fixture proof. | Show as source-backed for script checks, not yet as movement rule. |
| `forest` | Used by combat terrain generation and script tile tests. Values differ by landlook. | Group as combat/forest terrain, with value labels pending. |
| `spare` | No current consumer found in this pass. | Preserve only. |
| `build[3][3]` | Drives combat map expansion for terrain. | Future combat-map preview and validation. |
| `clearlandid` | Loaded as part of the struct; consumer not proven in this pass. | Preserve until consumer is found. |

## Observed Standard Landlook Data

Current Oracle output `F:\Realmz\out_win_clang\Data Files` contains these standard 8,104-byte `* BD` files:

- `Data P BD`
- `Data SUB BD`
- `Data Castle BD`
- `Data Desert BD`
- `Data Swamp BD`
- `Data Snow BD`
- `Combat Data BD`

Runtime consumes the first 8,044 bytes as 201 `mapstats` records plus `basetile` and `basescale`. The remaining 60 bytes in these files need ownership proof before Providence writes landlook attribute files.

## Observed Corpus `Data Solids`

In `F:\Realmz\out_win_clang\Scenarios`, 28 scenario `Data Solids` files were present and all were 1,024 bytes. Nonzero entries are sparse and always observed as value `1` in this pass. Highest nonzero counts:

| Scenario | Nonzero `Data Solids` entries |
| --- | ---: |
| Wrath of the Mind Lords | 81 |
| Hax | 79 |
| Dagger of Shine | 66 |
| War in the Sword Lands | 60 |
| Destroy the Necronomicon | 55 |
| Lord of the Abyss | 53 |

The most frequently nonzero indexes include 35, 36, 52, 53, 62, 63, 74, 75, 76, 190, 192, and 193. Because Realmz checks `solids[-hit]`, these indexes correspond to special raw map values like `-35`, `-36`, `-52`, and so on.

## Providence Follow-Up

Immediate editor-unblocking tasks:

- Rename the current `Data Solids`-derived attribute in the UI to "special negative solidity" or equivalent.
- Add a `mapstats` parser for standard landlook `* BD` files from bundled Realmz data.
- Extend `TileAttributeProfile` with two evidence sources: `mapstats` and `Data Solids`.
- Group palette values by source-backed `mapstats` flags for standard tiles and by `Data Solids` for special negative tiles.
- Keep landlook attribute writing disabled until Divinity binary write routines or field fixtures prove the 60 trailing bytes and custom landlook behavior.

## Divinity Work Remaining

The Divinity "Edit Land Tiles" UI still needs binary/screenshot mapping for labels, defaults, and ranges:

- `Solid Type`
- `Sound`
- `Time/Move`
- `Shore`
- `Is Path`
- `Need Boat`
- `Blocks Line of Sight`
- `Need Fly / Float`
- `Special Type`
- mountain/open/rubble/house range fields

The Realmz runtime proves these fields exist and matter; Divinity archaeology should prove how the editor writes and labels them.
