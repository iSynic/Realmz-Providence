# Runtime Note: Dungeon Bitfield Anchors

This note narrows the Dungeon Geometry card from "raw dungeon bitfields need fixtures" to a source-backed first taxonomy. Realmz treats `Data DL` as a 90 x 90 signed-short field grid, but the values are not land tile IDs. They are bitfields consumed by the dungeon renderer, movement, secret discovery, combat map generation, and action-point dispatch.

## Realmz Source Anchors

| Topic | Anchor | Evidence |
| --- | --- | --- |
| Dungeon field load | `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c` | When `indung` is true, `loadland` reads `CD`: door table, `field`, and `randlevel`. It does not read land `site` data and does not call landlook tile art for dungeon fields. |
| Runtime cache source | `F:\Realmz\src\realmz_orig\setupnewgame.c` | New-game setup copies `Data DDD`, `Data DL`, and `Data RDD` into generated dungeon cache `CD`. |
| Top-down render | `F:\Realmz\src\realmz_orig\threed.c` | `updatewalls` draws a 20 x 20 overhead dungeon area by calling `plotwall(field[t][tt])`. |
| Dungeon tiny sprites | `F:\Realmz\src\realmz_orig\GWorldInit.c` and `main.c` | Shared `PICT 302` is loaded into `gthePixels`; `tiny[]` source rects provide 16 x 16 dungeon sprites. |
| Movement collision | `F:\Realmz\src\realmz_orig\threed.c` | Movement checks wall/door/secret bits before changing `floorx` and `floory`. |
| Secret discovery | `F:\Realmz\src\realmz_orig\checkforsecret.c` | Dungeon search tests directional secret bits, sets a revealed marker, and sets an arch/show bit. |
| 3D perspective | `F:\Realmz\src\realmz_orig\MacrocosmMain.c` | Perspective view derives horizontal walls, vertical walls, doors, arches, stairs, and pillars from the same `field` bit values. |
| Combat map conversion | `F:\Realmz\src\realmz_orig\combatmap.c` | Dungeon combat terrain is reduced to wall/floor/black/default combat tiles using dungeon field bits. |

## Bit Numbering

Realmz uses macros like `MyrBitTstShort(&value, b)`, where bit index `b` maps to mask `1 << (15 - b)`. The table below uses both the Realmz source bit index and the numeric mask Providence should use.

| Realmz bit index | Mask | Source-backed meaning | Confidence |
| ---: | ---: | --- | --- |
| `15` | `0x0001` | Wall sprite and normal collision wall. | source-backed |
| `14` | `0x0002` | Door orientation bit. In north/south perspective it is a door; movement exempts it from hard wall blocking. | source-backed |
| `13` | `0x0004` | Door orientation bit. In east/west perspective it is a door; movement exempts it from hard wall blocking. | source-backed |
| `12` | `0x0008` | Stair sprite in perspective and top-down render. | source-backed |
| `11` | `0x0010` | Pillar contribution in perspective renderer. | source-backed |
| `10` | `0x0020` | Note/interaction bypass in movement. Current editor label should remain conservative. | source-backed partial |
| `9` | `0x0040` | Revealed/discovered secret marker. `checkforsecret` sets this bit. | source-backed |
| `8` | `0x0080` | Hidden/suppressed overhead visual. Normal top-down render skips cells with this bit; dungeon view clears it around the party. | source-backed |
| `7` | `0x0100` | Directional secret/pass-through bit for one facing direction. | source-backed partial |
| `6` | `0x0200` | Directional secret/pass-through bit for one facing direction. | source-backed partial |
| `5` | `0x0400` | Directional secret/pass-through bit for one facing direction. | source-backed partial |
| `4` | `0x0800` | Directional secret/pass-through bit for one facing direction. | source-backed partial |

`checkforsecret` uses mask `0x0F00` for the directional secret/pass-through group. `threed` tests `MyrBitTstShort(&wall, 8 - head)` while moving forward, where `head` is 1 through 4. That maps forward secret pass-through checks onto the bit-index range 7 through 4.

## Runtime Behavior Split

Providence should model dungeon cells as layered flags, not as one label:

1. **Structure**: wall, door orientation, stair, pillar.
2. **Visibility**: hidden/suppressed top-down visual, revealed secret marker.
3. **Movement**: blocking wall, door pass-through, directional secret pass-through.
4. **Interaction**: encounter/note/action behavior that calls `newland`.
5. **Render-only evidence**: top-down tiny sprites and perspective wall surfaces.

This avoids turning every interactable or hidden cell into a generic "secret" label.

## Editor Implications

Immediate safe authoring candidates:

- Draw/clear wall bit `0x0001`.
- Draw/clear vertical and horizontal door bits `0x0002` and `0x0004`, but label orientation in the UI carefully because perspective orientation depends on facing.
- Draw/clear stair bit `0x0008`.
- Show pillar bit `0x0010` as source-backed but delay authoring if Divinity UI semantics are not yet mapped.
- Show secret directional bits `0x0F00` as source-backed secret/pass-through evidence, but require a more guided editor so users choose direction rather than raw bit.
- Keep bit `0x0020` as "note/interaction evidence" until Divinity and runtime fixtures prove a better user-facing label.

## Corpus Signal

In the local 28-scenario Oracle output corpus, every observed `Data DL` file is a multiple of 16,200 bytes. The bit evidence is common enough to justify editor work:

- wall bit: 466,864 cells;
- hidden visual bit: 430,319 cells;
- directional secret/pass-through group: 21,816 cells;
- door orientation bit `0x0002`: 11,200 cells;
- door orientation bit `0x0004`: 17,092 cells;
- stair bit: 15,084 cells;
- revealed secret marker: 11,679 cells;
- note/interaction bit: 14,626 cells.

These counts are evidence of usage, not final UX labels.

## Providence Follow-Up

- Add a `DungeonCellProfile` helper with named bit flags and raw mask visibility.
- Replace raw dungeon paint options with named primitives: wall, door, stair, pillar, directional secret/pass-through, hidden visual, revealed marker, and interaction evidence.
- Keep writer support limited to source-backed bits with clear validation.
- Add fixture checks for at least one known wall, door, stair, secret, and encounter cell before bulk authoring controls.

## Divinity Work Remaining

The Divinity Dungeon Editor still needs binary/screenshot mapping for:

- exact tool labels and icon meanings;
- whether doors are edited as directional bits, paired edges, or cell flags;
- whether hidden/revealed secret bits are user-authored, runtime-authored, or both;
- defaults for blank dungeon levels;
- validation rules for impossible bit combinations.
