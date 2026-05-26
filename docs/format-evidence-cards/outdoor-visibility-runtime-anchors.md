# Runtime Note: Outdoor Visibility, Dark Levels, And Site Cache

This note documents why the Maps editor's `Dark Level` and `Use Line of Sight` controls do not behave like ordinary static canvas toggles. The authored flag lives in `Data RD`, but the visible black/known-cell state depends on the runtime `site[90][90]` cache and current party location.

## User-Facing Unlock

Providence can make the Maps UI honest and useful:

- `Dark Level` and `Use LOS` are real authored level settings;
- the canvas should treat their visual effect as a preview mode, not as static source data;
- LOS preview needs a focal point such as party start, selected cell, or current map record start;
- explored/known cells are runtime/save-state data and should not be presented as scenario authoring fields.

## Realmz Source Anchors

| Topic | Anchor | Evidence |
| --- | --- | --- |
| Runtime site cache | `F:\Realmz\src\realmz_orig\main.c`, `F:\Realmz\src\realmz_orig\variables.h` | `Boolean site[90][90]` is a global runtime array. |
| First-start initialization | `F:\Realmz\src\realmz_orig\setupnewgame.c` | Before building `CL`, setup clears all `site[t][tt] = 0`, then writes one site grid after every outdoor `door + field + randlevel` record. |
| Outdoor cache record shape | `F:\Realmz\src\realmz_orig\loadland-loadpixmap.c` | Outdoor `CL` records are `door + field + randlevel + site`; dungeon `CD` records are only `door + field + randlevel`. |
| Source file split | `F:\Realmz\src\realmz_orig\setupnewgame.c` | Source files are `Data DD`, `Data LD`, and `Data RD`; `site` is generated into `CL` and has no matching authored source file. |
| LOS black tile render | `F:\Realmz\src\realmz_orig\centerpict.c` | If `!site[x][y] && randlevel.uselos`, Realmz draws tile `252` as the black/unknown tile. |
| Darkness mask render | `F:\Realmz\src\realmz_orig\centerpict.c` | If `randlevel.isdark` is set, Realmz applies a 320x320 darkness mask centered around the party icon instead of copying the full rendered playfield. |
| Site discovery | `F:\Realmz\src\realmz_orig\cansee.c` | `cansee` traces visibility rays, consults `mapstats[hit].los`, and marks visible cells `site[x][y] = TRUE`. |
| Runtime save/load | `F:\Realmz\src\realmz_orig\save-direction-order.c`, `F:\Realmz\src\realmz_orig\loadsavedgame.c` | Saves preserve `CL` records including `site`; load restores `site` back into `CL`. |
| Runtime mutation | `F:\Realmz\src\realmz_orig\newland.c` | Opcode `106` can mutate landlook/darkness on a level at runtime. |

## Proven Source/Runtime Split

| Data | Location | Authored by scenario? | Editor treatment |
| --- | --- | --- | --- |
| `randlevel.uselos` | `Data RD` offset 522 | Yes | Writable map flag. |
| `randlevel.isdark` | `Data RD` offset 521 | Yes | Writable map flag. |
| `randlevel.landlook` | `Data RD` offset 520 | Yes | Writable map flag / tileset selection. |
| `site[90][90]` | Runtime `CL` cache after each outdoor level | No, generated at first start | Preview/runtime evidence only. |
| Darkness mask focal point | Current party position | No, gameplay state | Preview with chosen focal cell. |

Dungeon records do not carry `site`. `Data RDD` shares the `randlevel` layout, but `centerpict` and `cansee` evidence here is specifically outdoor map rendering.

## Runtime Behavior

`Use LOS` does not mean "hide all LOS-blocking tiles." It means unexplored/unseen outdoor cells draw black until `cansee` marks them as known in the runtime `site` grid. `cansee` uses the current viewport and party-relative rays, clears map field marker bits, normalizes high field values, and stops rays when `mapstats[hit].los == 1` unless the party has Wizard Eye.

`Dark Level` does not change the terrain atlas. Realmz first renders the playfield into an offscreen buffer and then applies a circular-ish darkness mask around the party position. The effect depends on party coordinates and viewport framing.

## Providence Follow-Up

- Keep `Dark Level` and `Use LOS` as real writable map flags.
- Add preview controls rather than pretending the static canvas can exactly match gameplay:
  - preview focal point: party start, selected cell, selected map-record start, or manual coordinate;
  - dark mask preview;
  - LOS known/unknown preview seeded from focal point;
  - LOS-blocking tile overlay from source-backed `mapstats.los`.
- Label generated `site[90][90]` as runtime cache/save-state evidence, not authored source.
- Do not export a `site` source file from Providence; Realmz creates it in `CL` at first start.
- When validating blank scenarios, ensure `Data RD` exists for outdoor levels so Realmz can build `CL` records with generated `site`.

## Divinity Work Remaining

Divinity archaeology should prove how the editor previews these flags:

- whether Divinity shows dark/LOS effects in the map editor or only stores flags;
- whether it lets designers seed known/explored cells;
- what labels it uses for LOS and darkness;
- whether custom landlooks alter LOS preview behavior through `mapstats`.

