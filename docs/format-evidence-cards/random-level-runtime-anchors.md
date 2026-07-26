# Runtime Note: Random Level And Random Rectangle Anchors

This note documents `Data RD` and `Data RDD`, the 644-byte `randlevel` records attached to outdoor and dungeon levels. This is directly editor-facing: the Maps workbench already lets users edit random rectangles, landlook, darkness, and line-of-sight flags, so Providence needs source-backed labels and validation rules.

## User-Facing Unlock

Providence can present random areas as authored encounter regions instead of opaque rectangles:

- level render settings: landlook, dark level, line-of-sight;
- 20 random rectangles per level;
- chance in 1/10000 units;
- battle range;
- three extra Action Point doors with one-shot vs repeat semantics;
- optional prompt sound/text;
- `only` rectangles that stop lower-priority random checks.

## Realmz Source Anchors

| Topic | Anchor | Evidence |
| --- | --- | --- |
| Byte layout | `F:\Realmz\src\realmz_orig\structs.h` | `struct randlevel` contains `randrect[20]`, `percent[20]`, `battlerange[20][2]`, `randdoor[20][3]`, `randdoorpercent[20][3]`, `landlook`, `isdark`, `uselos`, `only[20]`, `option[20]`, `sound[20]`, and `text[20]`. |
| Endian conversion | `F:\Realmz\src\realmz_orig\convert.c` | `CvtRandLevelToPc` converts all rects and short arrays, plus booleans; `landlook` and `option` are byte fields. |
| Source to runtime cache | `F:\Realmz\src\realmz_orig\setupnewgame.c` | New-game setup copies `Data RD` into `CL` and `Data RDD` into `CD`. |
| Map load | `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c` | Loading a land/dungeon level reads the corresponding field grid, door table, and `randlevel`; outdoor levels also include `site`. |
| Save mutation | `F:\Realmz\src\realmz_orig\save-direction-order.c` | `saveland` writes the current `randlevel` back into `CL`/`CD` runtime cache records. |
| Random encounter loop | `F:\Realmz\src\realmz_orig\textbox-time.c` | `timeclick(..., checkforrandom)` tests the party location against rectangles from index 19 down to 0, checks `Rand(10000) <= percent`, fires extra doors, then optionally starts a battle. |
| Seamless/negative percent path | `F:\Realmz\src\realmz_orig\buttonchoice.c` | A separate movement path checks rectangles where `percent < 0` and can fire extra doors without the normal random-battle path. |
| Script mutation | `F:\Realmz\src\realmz_orig\newland.c` | Opcodes `23`, `-23`, `92`, and `106` mutate random rectangle metadata, rectangle shape, darkness, and landlook in loaded levels. |
| LOS render | `F:\Realmz\src\realmz_orig\centerpict.c` | `randlevel.uselos` controls blacking out unvisited/unknown outdoor sites; `randlevel.isdark` controls darkness behavior. |

## Byte Layout

`sizeof(struct randlevel)` is 644 bytes in the original Mac layout consumed by Realmz.

| Offset | Size | Field | Type | Editor meaning |
| ---: | ---: | --- | --- | --- |
| 0 | 160 | `randrect[20]` | 20 `Rect`s, 8 bytes each | `top`, `left`, `bottom`, `right` bounds for random areas. |
| 160 | 40 | `percent[20]` | 20 signed shorts | Chance checked against `Rand(10000)`, so values are "times in 10000"; negative values take a special seamless-door path. |
| 200 | 80 | `battlerange[20][2]` | 40 signed shorts | Low/high battle record IDs for random battle selection. |
| 280 | 120 | `randdoor[20][3]` | 60 signed shorts | Up to three Action Point door IDs to fire before battle checks. |
| 400 | 120 | `randdoorpercent[20][3]` | 60 signed shorts | Percent chance out of 100 for each extra AP door. Positive values are one-shot; Realmz zeroes them after firing. Negative values repeat. |
| 520 | 1 | `landlook` | signed byte | Outdoor landlook / render tileset hint. |
| 521 | 1 | `isdark` | boolean byte | Dark level flag. |
| 522 | 1 | `uselos` | boolean byte | Outdoor line-of-sight/unknown-site flag. |
| 523 | 20 | `only[20]` | boolean bytes | If true and the party is in this rect, lower-priority random rectangles stop checking. |
| 543 | 20 | `option[20]` | signed bytes | Prompt/surprise chance before random battle; used with sound/text. |
| 563 | 1 | Alignment padding | byte | Native struct alignment byte. Preserve, but do not decode it as sound data. |
| 564 | 40 | `sound[20]` | 20 signed shorts | Sound played when the option prompt triggers. |
| 604 | 40 | `text[20]` | 20 signed shorts | Text message ID shown for the option prompt; runtime passes `-abs(text)` to `textbox`. |

The offsets above are confirmed by a compiled `offsetof` probe against Realmz's actual `struct randlevel`: `only=523`, `option=543`, `sound=564`, `text=604`, and `sizeof=644`.

Realmz Oracle build `47d4600c` independently confirmed the alignment against Mithril Vault's original `Data RD` (`SHA-256 0CBAED22D94B15D8B3DBC2A0FFB94CB1728299FB0539A98963094AAB1AC10564`). Land level 0, rectangle 17 decodes as chance `200/10000`, battle range `225..231`, XAP doors `[446, 448, 0]` with chances `[50, 50, 0]`, option `66`, sound `30000`, and text `1278`.

## Runtime Semantics

Random rectangle checks run from rectangle index `19` down to `0`. This means higher-numbered rectangles have priority over lower-numbered rectangles when they overlap.

For the normal time-click/random encounter path:

1. Determine party/current floor location.
2. For each containing rectangle, check `Rand(10000) <= percent`.
3. For each of three extra AP doors, check `Rand(100) <= abs(randdoorpercent)`.
4. If an extra-door percent is positive, zero it after firing and save the level cache; positive means one-shot.
5. Fire the extra Action Point with `newland(..., randdoor, ...)`.
6. If no AP path wins and battles are available, use `battlerange` to choose a random battle.
7. If `only` is set, stop checking lower-priority rectangles even if no encounter happens.

The `option`/`sound`/`text` trio is a battle prompt/surprise path. Runtime checks `Rand(100) < option`, plays `sound`, displays the text, and asks the player; a positive response gives a favorable surprise state. This is not just display metadata.

## Scripted Mutation

These opcodes modify random-level data at runtime:

| Opcode | Runtime behavior |
| ---: | --- |
| `23` | Alter land random rectangle percent and battle range. |
| `-23` | Alter dungeon random rectangle percent and battle range. |
| `92` | Alter random rectangle percent and shape; reads a second EDCD row for absolute/offset/warp rectangle changes. |
| `106` | Set landlook and dark flag for a level. |

These mutations operate through loaded level data and runtime caches. Providence should label them as script effects, not static source defaults, when shown on the map.

For the visual meaning of `isdark` and `uselos`, see `outdoor-visibility-runtime-anchors.md`. The flags are authored source data, but their visible gameplay effect depends on party position and generated outdoor `site[90][90]` cache state.

## Corpus Evidence

Local `F:\Realmz\out_win_clang\Scenarios` output corpus:

- 28 scenarios had both `Data RD` and `Data RDD`;
- 56 random-level files total;
- 349 decoded random-level records;
- 2,615 active random rectangles;
- 958 active rectangles with battle ranges;
- 527 active rectangles with `only` set;
- 2,819 nonzero extra AP door slots;
- 2,840 positive extra-door percent slots, making one-shot extra AP behavior common;
- no negative `percent` rectangles were observed in this local output corpus, though Realmz has source-backed runtime support for them.

Highest active outdoor rectangle counts in the local output corpus:

| Scenario | File | Active rectangles |
| --- | --- | ---: |
| War in the Sword Lands | `Data RD` | 310 |
| Trouble in the Sword Lands | `Data RD` | 289 |
| Wrath of the Mind Lords | `Data RD` | 281 |
| Price of Power | `Data RD` | 138 |
| Half Truth | `Data RD` | 136 |

## Providence Follow-Up

- Rename `% Option`/`Option` UI copy to reflect the source-backed prompt/surprise chance behavior.
- Show extra AP door percent sign meaning: positive one-shot, negative repeat.
- Validate `percent` as times in 10000, not percent out of 100.
- Validate `randdoorpercent` as chance out of 100 and warn on `0` with nonzero door.
- Validate overlapping rectangles by explaining priority order from index 19 down to 0.
- Link extra AP door IDs to Scripts/AP records.
- Link battle range values to `Data BD` battle records.
- Link sound/text values to sound resources and `Data SD2` messages.
- Preserve native padding byte 563.

## Divinity Work Remaining

Divinity binary/manual archaeology should still prove the editor labels/defaults for:

- "Times in 10,000";
- "% Option";
- the UI meaning of the three extra AP percent sign values;
- rectangle priority/overlap presentation;
- whether Divinity can intentionally author negative `percent` seamless rectangles.
