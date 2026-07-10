# Evidence Card: Secret Land Cells and Action Point Markers

## Authoring Contract

A land Secret Area is a `Data LD` map-cell state. It may share a coordinate with an ordinary `Data DD` trigger record, but it does not require one. When both layers occupy the same cell, Realmz treats the trigger as a Secret Action Point. Secret state does not occupy a field in the 40-byte `struct door` record.

Providence therefore authors the land cell's Normal, Hidden Secret, or Revealed Secret state independently from Action Point placement. Dungeon secret-passage directions likewise remain map geometry owned by Dungeon Draw.

## Land Levels

| Cell band | Runtime meaning |
| ---: | --- |
| base tile | ordinary cell with no Action Point marker |
| base + 1000 | normal Action Point |
| base + 2000 | discovered/revealed Secret Area, with or without an Action Point |
| base + 3000 | hidden Secret Area, with or without an Action Point |

`F:\Realmz\src\realmz_orig\checkforsecret.c:47-53` detects the hidden `3000` band and subtracts `1000`, producing the revealed `2000` band. `buttonchoice.c:88-104` prevents the hidden form from entering the ordinary door path, while `buttonchoice.c:136-139` runs normal and revealed cells through `newland()`.

The same transformation applies to negative special-icon cells. Note and path bits are independent high bits and must survive Secret Area and Action Point marker changes.

Stock land tiles `169` and `180-185` are hidden-walkable path tiles and receive Providence's hidden-walkable authoring overlay even in the ordinary base band. That overlay is a visibility aid, not evidence that the cell has Hidden or Revealed Secret Area state.

## Dungeon Levels

| Mask | Runtime meaning |
| ---: | --- |
| `0x1000` | Action Point marker |
| `0x0100..0x0800` | directional secret passage/approach bits |
| `0x0040` | runtime revealed-secret state |

`F:\Realmz\src\realmz_orig\threed.c:532-548` checks directional secret movement. `threed.c:580-586` invokes `newland()` only when the destination cell carries the Action Point marker.

The revealed bit is runtime state, not the control used to author a new secret. Providence preserves imported dungeon revealed state while AP placement, movement, and deletion operate only on the separate `0x1000` marker.

## Providence Rules

- Creating an Action Point writes the normal land band or dungeon `0x1000` marker.
- Land cells expose Normal, Hidden Secret, and Revealed Secret states whether or not an Action Point exists there.
- Hidden-walkable tiles `169` and `180-185` remain marked on the map and in the tile palette without being mislabeled as Secret Areas.
- Normalizing a land cell retains `+1000` when an Action Point still occupies the coordinate; otherwise it returns to the base tile band.
- A dungeon Action Point is Secret when its cell already has one or more Dungeon Draw `Allow Move` directions.
- Moving a land Action Point clears only a normal `+1000` marker from its old cell and writes an AP marker at the destination. Hidden or revealed Secret Area state stays on its authored cell.
- Moving a dungeon Action Point moves only `0x1000`; it does not move or create painted secret-passage geometry.
- Deleting the final Action Point on a normal cell clears the AP marker. It does not erase a land Secret Area or dungeon secret-passage geometry.
- Dungeon deletion preserves directional secret-passage geometry.
- Multiple trigger records at one coordinate share the same cell marker, so Providence does not clear it while another active trigger remains there.
