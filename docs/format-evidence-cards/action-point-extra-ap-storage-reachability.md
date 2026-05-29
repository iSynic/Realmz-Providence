# Evidence Card: Action Point And Extra Action Point Reachability

## User-Facing Unlock

Providence can use Divinity-facing language for the behavior hub:

- **Action Points** are map/dungeon trigger records tied to a location.
- **Extra Action Points** are reusable script records that are not tied to a map cell.
- **Macros/GOSUBs** are Extra Action Points reached by branch, stack, battle, monster death, random rectangle, timed encounter, or global hook paths.
- Imported non-callable rows remain under advanced imported data until a source-backed incoming path proves they execute.

This should remove `ED3` from normal authoring labels while keeping raw record evidence available for technical inspection.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:49` | `struct door` is the fixed action record shape shared by map triggers and Extra Action Point storage. |
| `F:\Realmz\src\realmz_orig\flashrange-loaddoor.c:43` | `loaddoor2(id)` loads a row from `Data ED3`; this is the direct runtime entry point for Extra Action Point records. |
| `F:\Realmz\src\realmz_orig\misc.c:560` | `loadextracode(id)` loads five signed-short values from `Data EDCD`. |
| `F:\Realmz\src\realmz_orig\newland.c:38` | `newland(modecode, ...)` can directly load a `Data ED3` row when called with a macro/action code. |
| `F:\Realmz\src\realmz_orig\newland.c:596` | Branch paths can load random or direct Extra Action Point rows through `loaddoor2`. |
| `F:\Realmz\src\realmz_orig\getup.c:78` | Negative battle macro values load `abs(battlemacro)` through `loaddoor2`. |
| `F:\Realmz\src\realmz_orig\killbody.c:116` | Monster death hooks load an Extra Action Point through `loaddoor2`. |
| `F:\Realmz\src\realmz_orig\killbody.c:124` | Queued macro/action rows are loaded through `loaddoor2`. |
| `F:\Realmz\src\realmz_orig\partyloss.c:15` | The party death global hook can execute an Extra Action Point. |
| `F:\Realmz\src\realmz_orig\handlemenuchoice.c:1204` | The new-game global start hook can execute an Extra Action Point. |
| `F:\Realmz\src\realmz_orig\handlemenuchoice.c:1227` | The quit/end-game global hook can execute an Extra Action Point. |

## Divinity Evidence

| Manual Line | Evidence |
| ---: | --- |
| 191-197 | Land levels contain Action Points and Random Rectangles; Action Points are specific locations, Random Rectangles cover an area. |
| 193 | Each land level can contain up to 100 Action Points, numbered 0-99. |
| 351-365 | Random Rectangles can activate up to three Extra Action Points before random battle selection; positive percent is one-shot, negative percent repeats. |
| 689-691 and 4304-4306 | Global Macros are Extra Action Points fired at five special times. |
| 784-863 | Action Points/GOSUBs are the core scripting hub; each Action Point has eight CODE/ID steps. |
| 2858-2887 | Divinity's "Hub" is the Action Point scripting screen, because it links to most scenario editors. |
| 2891-2893 | `Clear AP` clears codes; `Erase AP` clears the script and removes the land-editor reference. |
| 3025-3031 | Battle Macros are Extra Action Points checked during battle rounds. |
| 3196-3198 | Monster Macros are Extra Action Points fired when a monster dies. |
| 5935-5937 | Extra Action Points used by Random Rectangles do not count toward the 100 Action Point limit on a land level. |

## Byte Layout Notes

- Map Action Points live in `Data DD` / `Data DDD` as fixed `struct door` records tied to land/dungeon coordinates.
- Extra Action Points live in `Data ED3` as fixed `struct door` rows without map-cell ownership.
- `Data EDCD` rows are five signed shorts. They extend selected opcode semantics but do not themselves prove `Data ED3` reachability.
- `Global` is a 60-byte file of 30 signed-short hook slots; only source-backed slots should be presented as named hooks.
- Clearing and erasing are distinct authoring concepts: clearing script bytes preserves a record slot, while erasing/removing must also clear the map/action-point reference when applicable.

## Corpus Evidence

- The corpus summary records `Data ED3` and `Data EDCD` in 44/44 scenarios.
- Existing ED3 reachability evidence in `F:\Realmz Scenario Utility\docs\scenario-format\ed3-reachability.md` classifies imported non-reachable rows as `needs-runtime-trace`, `orphan-authored-content`, `probable-editor-padding`, or `runtime-mutation-candidate`.

## Providence Follow-Up

- Follow-up: `editor-ui`, `validation`, `parser-only`.
- Rename default UI labels from `Imported ED3 Rows` to an author-facing label such as `Imported Extra AP Data` or `Advanced Imported Scripts`.
- Keep `Data ED3` visible only in Advanced Details.
- Add a clear distinction between `Clear Action Point` and `Remove Action Point From Map` where the map reference exists.
- Promote a row to callable macro only when it is user-authored or reached from a source-backed path.

## Writer Gate

Action Point and Extra Action Point writes can continue through the existing `struct door` command path. New UI controls must not delete imported rows or map references unless the command explicitly preserves fixed-record semantics and proves the target container.

