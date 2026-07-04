# Map Record Runtime Anchors

## User-Facing Unlock

This card unlocks a stronger Maps/Scenario authoring surface for `Data MD2`: map-record selections can show linked land/dungeon level, preview start cell, note text, picture-backed map views, and embedded `cicn` markers. Providence can safely edit the source-backed shell fields it already preserves while keeping map names as resource-fork evidence until string-resource writing is proven.

## Realmz Anchors

- `F:\Realmz\src\realmz_orig\structs.h:181-189`: defines `struct maps`.
- `F:\Realmz\src\realmz_orig\convert.c:201-204`: converts every short before the trailing `Str255`, confirming big-endian signed-short storage through byte 83.
- `F:\Realmz\src\realmz_orig\mapstuff.c:67-72`: `showmap` reads `Data MD2` by record index into `themap`.
- `F:\Realmz\src\realmz_orig\mapstuff.c:79-91`: negative `show` plays a movie; nonzero `pictid` draws a `PICT`, optionally clipped by `rect`.
- `F:\Realmz\src\realmz_orig\mapstuff.c:95-124`: zero `pictid` renders a map preview from `level`, `isdungeon`, `startx`, `starty`, and `iconsize`.
- `F:\Realmz\src\realmz_orig\mapstuff.c:139-169`: ten icon slots draw `cicn` markers at grid positions on the map preview.
- `F:\Realmz\src\realmz_orig\mapstuff.c:180-193`: the current party location marker is overlaid when the map preview includes the current level and coordinates.
- `F:\Realmz\src\realmz_orig\mapstuff.c:211`: displays the record `note` string.
- `F:\Realmz\src\realmz_orig\setupnewgame.c:58-65`: initializes the saved-game `map[20]` availability flags and starts new games with map 0 available.
- `F:\Realmz\src\realmz_orig\misc.c:2019-2032`: `updatemapmenu` builds the Maps/Notes menu from `map[20]`, using `STR# -102` Map Names for available entries and `STR# -101` Map Names for unavailable entries.
- `F:\Realmz\src\realmz_orig\handlemenuchoice.c:735-741`: selecting a Maps menu item calls `showmap(theItem - 4)`, so menu item 4 opens `Data MD2` record 0.
- `F:\Realmz\src\realmz_orig\newland.c:2399-2407`: opcode 29 marks `map[abs(id)]` available, refreshes the Maps/Notes menu, and immediately displays the map when the ID is negative.

## Maps Menu Runtime Model

Realmz exposes exactly 20 Maps/Notes menu map slots through the saved-game `map[20]` availability array. Those flags are not scenario-authored defaults in `Data MD2`; they are runtime/player-state unlocks. Scenario authors provide the menu targets through `Data MD2` records and can grant/display them with opcode 29.

Menu labels come from the scenario resource fork, not from `Data MD2`: `STR# -102` contains the unlocked/available Map Names list, and `STR# -101` contains the unavailable/locked Map Names list. Providence treats these as Maps Menu names and keeps the `Data MD2` record body as the map display target, picture link, marker list, rectangle, and note payload.

## Byte Layout

`Data MD2` records are 340 bytes. The first 84 bytes are 42 big-endian signed shorts; bytes 84-339 are a Pascal-style `Str255` note.

| Offset | Field | Meaning | Providence Write Confidence |
| ---: | --- | --- | --- |
| 0 | `icon[10][3]` | Ten icon marker triples: `cicn id`, x, y | parser-ready, writer needs UI |
| 60 | `startx` | map preview start x | writable shell |
| 62 | `starty` | map preview start y | writable shell |
| 64 | `level` | land/dungeon level index | writable shell |
| 66 | `pictid` | optional `PICT` map view | writable shell |
| 68 | `iconsize` | map preview cell/icon size | writable shell |
| 70 | `show` | display/movie flag; negative plays movie path | preserve cautious |
| 72 | `isdungeon` | nonzero means dungeon level | writable shell |
| 74 | `spare` | unknown short | preserve-only |
| 76 | `rect[0]` | picture clip top | writable shell |
| 78 | `rect[1]` | picture clip left | writable shell |
| 80 | `rect[2]` | picture clip bottom | writable shell |
| 82 | `rect[3]` | picture clip right | writable shell |
| 84 | `note` | Pascal-style note text | writable shell with text validation |

## Corpus Evidence

The local output corpus under `F:\Realmz\out_win_clang\Scenarios` has `Data MD2` in 28 of 28 checked scenarios.

Aggregate counts:

- 427 total records.
- 370 records with note text.
- 1,181 nonzero icon marker slots.
- 53 records with nonzero `pictid`.
- 58 records targeting dungeon levels.

Representative examples:

- `City of Bywater`: 20 records, 14 notes, 17 icon slots, 1 dungeon record.
- `The End Worlds`: 20 records, 16 notes, 155 icon slots, 14 picture-backed records, 15 dungeon records.
- `Castle in the Clouds`: 21 records, 21 notes, 123 icon slots, 11 picture-backed records, 11 dungeon records.
- `Lord of the Abyss`: 20 records, 20 notes, 110 icon slots, 9 picture-backed records, 9 dungeon records.

The broader 44-scenario inventory reports `Data MD2` in every analyzed scenario.

## Providence Current Support

- Imports and exports `Data MD2` as fixed 340-byte records.
- Preserves raw bytes.
- Writes source-backed shell fields for authored records.
- Validates bounds, linked map existence, inverted rectangles, and missing decoded picture resources.
- Uses resource-backed map names as evidence, not as `Data MD2` fields.
- Semantic parsing now exposes embedded icon slots and links map records to `PICT`/`cicn` resources.

## Editor Follow-Up

- Maps right sidebar: replace generic read-only map-record selection with a dedicated Map Record panel.
- Show linked map level, start coordinate, note text, picture view, clip rectangle, icon-size behavior, and embedded marker slots.
- Add "Open Related Map", "Show Preview Area", "Edit Map Record", and "Open Resource" actions.
- Add icon-slot editing only after UI can preview `cicn` resources and validate marker coordinates.
- Scenario tool: show `Data MD2` records as scenario maps/notes, not only as semantic evidence.

## Divinity Evidence Needed

- Confirm Divinity labels for `show`, `spare`, and icon slot controls.
- Confirm whether `show < 0` is movie-specific, and how Divinity exposes or writes that path.
- Confirm resource-name linkage: current Providence map names come from resource-fork string evidence, not from `Data MD2`.
