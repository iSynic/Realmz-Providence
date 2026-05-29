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
| Dungeon notes | `F:\Realmz\src\realmz_orig\handlemenuchoice.c` | Dungeon notes set/clear bit index `10`; outdoor notes use a different marker bit on land tiles. |
| 3D perspective | `F:\Realmz\src\realmz_orig\MacrocosmMain.c` | Perspective view derives horizontal walls, vertical walls, doors, arches, stairs, and pillars from the same `field` bit values. |
| Combat map conversion | `F:\Realmz\src\realmz_orig\combatmap.c` | Dungeon combat terrain is reduced to wall/floor/black/default combat tiles using dungeon field bits. |

## Bit Numbering

Realmz uses macros like `MyrBitTstShort(&value, b)`, where bit index `b` maps to mask `1 << (15 - b)`. The table below uses both the Realmz source bit index and the numeric mask Providence should use.

| Realmz bit index | Mask | Source-backed meaning | Confidence |
| ---: | ---: | --- | --- |
| `0` | `0x8000` | Unresolved high/sign bit. No Realmz runtime consumer or Divinity editor label has been identified; corpus examples include both plausible legacy combinations and malformed/ASCII-like imported runs. Preserve-only. | unknown-active-risk |
| `1` | `0x4000` | No Wall in Battle. Divinity labels this control, and Realmz combat-map conversion includes this mask so matching dungeon combat cells become clear floor. | source-backed manual-backed |
| `2` | `0x2000` | Visible arch / revealed passage marker. `checkforsecret` sets this bit when revealing a secret; the perspective renderer draws an arch from it. | source-backed runtime-mutated |
| `3` | `0x1000` | Dungeon encounter / Action Point trigger marker. After movement, `threed` calls `newland(floorx, floory, ...)` when this bit is set. | source-backed |
| `4` | `0x0800` | Directional secret/pass-through bit for one facing direction. | source-backed partial |
| `5` | `0x0400` | Directional secret/pass-through bit for one facing direction. | source-backed partial |
| `6` | `0x0200` | Directional secret/pass-through bit for one facing direction. | source-backed partial |
| `7` | `0x0100` | Directional secret/pass-through bit for one facing direction. | source-backed partial |
| `8` | `0x0080` | Hidden/suppressed overhead visual. Normal top-down render skips cells with this bit; dungeon view clears it around the party. | source-backed runtime-mutated |
| `9` | `0x0040` | Revealed/discovered secret marker. `checkforsecret` sets this bit. | source-backed |
| `10` | `0x0020` | Dungeon note marker. `handlemenuchoice` sets/clears this bit when saving or clearing a note on a dungeon cell. | source-backed |
| `11` | `0x0010` | Pillar contribution in perspective renderer. | source-backed |
| `12` | `0x0008` | Stair sprite in perspective and top-down render; also treated as a "hole" in dungeon combat conversion. | source-backed |
| `13` | `0x0004` | Door orientation bit. Movement exempts either door-orientation bit from hard wall blocking. Perspective labels depend on facing. | source-backed |
| `14` | `0x0002` | Door orientation bit. Movement exempts either door-orientation bit from hard wall blocking. Perspective labels depend on facing. | source-backed |
| `15` | `0x0001` | Wall sprite and normal collision wall. | source-backed |

`checkforsecret` uses mask `0x0F00` for the directional secret/pass-through group. `threed` tests `MyrBitTstShort(&wall, 8 - head)` while moving forward, where `head` is 1 through 4. That maps forward secret pass-through checks onto the bit-index range 7 through 4.

`combatmap` clears the visible arch/path marker bit before classifying dungeon cells, then treats mask `0x4F0E` as "all types that leave a hole." In mask terms this includes `0x4000` No Wall in Battle, the two door bits, stairs, and the directional secret/pass-through group. Combat-map preview should therefore be derived from the runtime mask composition, not only from the top-down dungeon sprite.

## Runtime Behavior Split

Providence should model dungeon cells as layered flags, not as one label:

1. **Structure**: wall, door orientation, stair, pillar.
2. **Visibility**: hidden/suppressed top-down visual, revealed secret marker.
3. **Movement**: blocking wall, door pass-through, directional secret pass-through.
4. **Interaction**: encounter / Action Point trigger marker that calls `newland`.
5. **Notes**: dungeon note marker tied to the note file workflow.
6. **Render/runtime evidence**: top-down tiny sprites, perspective wall surfaces, hidden/revealed markers, and combat-map conversion.

This avoids turning every interactable or hidden cell into a generic "secret" label.

## Editor Implications

Immediate safe authoring candidates:

- Draw/clear wall bit `0x0001`.
- Draw/clear No Wall in Battle bit `0x4000` for dungeon walls that should become clear floor on the combat map.
- Draw/clear the two door-orientation bits `0x0002` and `0x0004`, but label orientation in the UI carefully because perspective orientation depends on facing.
- Draw/clear stair bit `0x0008`.
- Show pillar bit `0x0010` as source-backed but delay authoring if Divinity UI semantics are not yet mapped.
- Show note bit `0x0020` through the Notes workflow, not as a generic dungeon geometry brush.
- Show encounter / Action Point trigger bit `0x1000` through Action Point placement and validation.
- Show visible arch/revealed passage bit `0x2000` as runtime-mutated reveal state unless Divinity writer evidence proves authors set it directly.
- Show secret directional bits `0x0F00` as source-backed secret/pass-through evidence, but require a more guided editor so users choose direction rather than raw bit.
- Preserve unresolved high/sign bit `0x8000`; do not expose it as a normal control until a source or Divinity editor owner is proven.

## Corpus Signal

In the local 28-scenario Oracle output corpus, every observed `Data DL` file is a multiple of 16,200 bytes. The bit evidence is common enough to justify editor work:

- wall bit: 466,864 cells;
- hidden visual bit: 430,319 cells;
- directional secret/pass-through group: 21,816 cells;
- door orientation bit `0x0002`: 11,200 cells;
- door orientation bit `0x0004`: 17,092 cells;
- stair bit: 15,084 cells;
- revealed secret marker: 11,679 cells;
- note/interaction bit: 14,626 cells;
- No Wall in Battle bit `0x4000`: see `docs/generated/dungeon-high-bit-audit.json` for current corpus examples and source-backed verdict;
- unresolved high/sign bit `0x8000`: preserve-only; the high-bit audit separates plausible legacy values from malformed/ASCII-like imported runs.

These counts are evidence of usage, not final UX labels.

## Providence Follow-Up

- Add a `DungeonCellProfile` helper with named bit flags and raw mask visibility.
- Replace raw dungeon paint options with named primitives: wall, No Wall in Battle, door, stair, pillar, directional secret/pass-through, hidden visual, revealed marker, note marker, and Action Point trigger marker.
- Keep writer support limited to source-backed bits with clear validation. Prefer routing note and Action Point trigger bits through the Notes/AP workflows instead of raw geometry tools.
- Add fixture checks for at least one known wall, door, stair, secret, and encounter cell before bulk authoring controls.

## Divinity Work Remaining

The Divinity Dungeon Editor still needs binary/screenshot mapping for:

- exact tool labels and icon meanings;
- whether doors are edited as directional bits, paired edges, or cell flags;
- whether hidden/revealed secret bits are user-authored, runtime-authored, or both;
- defaults for blank dungeon levels;
- validation rules for impossible bit combinations.
