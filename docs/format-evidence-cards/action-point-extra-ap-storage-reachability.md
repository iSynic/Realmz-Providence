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
| `F:\Realmz\src\realmz_orig\items.c:578` | Door items are identified by item type `23` or special field `sp1 == -23`. |
| `F:\Realmz\src\realmz_orig\items.c:592` | Door items store their Extra Action Point row in `sp5`, encoded at runtime as `-(sp5 + 100)`. |
| `F:\Realmz\src\realmz_orig\buttonchoice.c:545` | The non-combat item button path executes door items with `newland(..., 1, abs(itemused) - 100, ...)`. |
| `F:\Realmz\src\realmz_orig\combatinfo-combatchoice.c:525` | The combat item path executes door items with the same Extra Action Point row calculation. |

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
- `struct door` is exactly 40 bytes and has no trailing unknown field in the Realmz source:
  - bytes `0..3`: signed big-endian `doorid`
  - byte `4`: `landid`
  - byte `5`: destination/action X
  - byte `6`: destination/action Y
  - byte `7`: percent/chance
  - bytes `8..23`: eight signed big-endian action CODE values
  - bytes `24..39`: eight signed big-endian action ID values
- `Data EDCD` rows are five signed shorts. They extend selected opcode semantics but do not themselves prove `Data ED3` reachability.
- `Global` is a 60-byte file of 30 signed-short hook slots; only source-backed slots should be presented as named hooks.
- Battle macro fields are signed. Realmz only executes the battle macro path when the stored value is negative, and it loads `abs(battlemacro)` from `Data ED3`.
- Clearing and erasing are distinct authoring concepts: clearing script bytes preserves a record slot, while erasing/removing must also clear the map/action-point reference when applicable.

## Source Reachability Map

Generated reachability evidence lives in `docs/generated/extra-ap-reachability-source-map.json`.

| Runtime Root | Source Container | ED3 Value Source | Providence Meaning |
| --- | --- | --- | --- |
| Direct `newland(..., 1, modecode, ...)` | Runtime caller / global hook | `modecode` | Execute an Extra Action Point row. |
| Opcode `39` | Action Point or Extra Action Point script step | Step `ID` | Jump to another Extra Action Point. This is not an EDCD row. |
| Opcode `8` | Current land/dungeon `door[id]` array | Step `ID` | Copy another Action Point from the currently loaded map. This is not an Extra Action Point row. |
| EDCD branch opcodes | `Data EDCD` sidecar rows | Opcode-specific fields | Branch to Extra AP only when the opcode/mode shape says the field is an Extra AP target. |
| Opcode `2` revived-loss branch | `Data EDCD` battle row | `extracode[2]` only when `extracode[4] == 10` | The normally optional sound field becomes the Extra Action Point to run after Realmz revives the party from a battle loss. |
| Opcode `7` action data patching | `Data EDCD` sidecar row | `extracode[2]` | Loads an Extra Action Point row and copies its eight script slots into an Action Point or encounter-result row. This is source-backed Extra AP reachability, but it is a copy/mutation workflow rather than an immediate branch. |
| Global start/death/quit/shop/temple hooks | `Global` slots `0`, `1`, `2`, `4`, `5` | Hook value | Scenario-wide macros. Slots without a source consumer remain preserved/advanced. |
| Battle macro | `Data BD` `battlemacro` | Negative value, loaded by absolute value | Combat-round macro. Preserve sign semantics. |
| Monster death macro | `Data MD` `todoondeath` | Nonzero macro id | Runs when the monster dies, sometimes through the runtime queue. |
| Timed encounter macro | `Data TD3` `door` | Timed encounter door field | Runs when timed encounter gates pass. |
| Random rectangle extra APs | `Data RD` / `Data RDD` `randdoor[20][3]` | Three door fields per rectangle | Runs before random battle checks; positive percent is one-shot and negative repeats. |
| Hidden encounter button macro | Runtime random rectangle state | Negative-percent rectangle extra AP | Encounter-button hidden encounter path. |
| Door item macro | `Data NI` item records | Door item `sp5` | Runs when the player uses an item whose type is `23` or whose `sp1` is `-23`. |
| GOSUB stack | Runtime stack | Negative script code branch | Call/return behavior layered on script execution, not separate storage. |

This map changes the authoring rule from "ED3 is imported evidence" to "Extra AP rows are fixed script records; some are callable from known roots, and unreferenced rows are imported advanced data until linked or edited."

## Implementation Status

- Rust semantic import now promotes Extra Action Point rows reached through `calls_macro`, EDCD branch links (`branches_to`, `branches_true`, `branches_false`, `branches_keep`, `branches_drop`), and negative battle macro links.
- Browser semantic import mirrors the same promotion rules so browser-opened scenarios do not regress to plain imported rows.
- Battle outcome EDCD roles now promote through dedicated `branches_on_coward` and `branches_on_revived_loss` links, so the coward/flee paths in opcodes `56`/`107` and the revived-loss path in opcode `2` are no longer lost as generic sound/raw fields.
- Opcode `7` action-data patching now has a guarded semantic test proving the referenced Extra Action Point row remains callable/source-backed even though Realmz copies that row into another record instead of branching immediately.
- Door items now create `calls_macro` links from scenario item records to their `sp5` Extra Action Point row.
- Recursive Extra Action Point reachability now follows EDCD branch links inside already-reachable Extra Action Points.
- Positive battle macro values remain non-callable because Realmz only follows the negative-value path in `getup.c`.

## Corpus Evidence

- The corpus summary records `Data ED3` and `Data EDCD` in 44/44 scenarios.
- The generated byte-roundtrip ledger records `Data ED3` in 87/87 scenario roots with file lengths that are all multiples of the 40-byte `struct door` row size. Observed sizes range from 320 to 147,840 bytes, and every `Data ED3` file roundtrips byte-identically in that ledger.
- Existing ED3 reachability evidence in `F:\Realmz Scenario Utility\docs\scenario-format\ed3-reachability.md` classifies imported non-reachable rows as `needs-runtime-trace`, `orphan-authored-content`, `probable-editor-padding`, or `runtime-mutation-candidate`.

## Providence Follow-Up

- Follow-up: `editor-ui`, `validation`, `parser-only`.
- Rename default UI labels from `Imported ED3 Rows` to an author-facing label such as `Imported Extra AP Data` or `Advanced Imported Scripts`.
- Keep `Data ED3` visible only in Advanced Details.
- Add a clear distinction between `Clear Action Point` and `Remove Action Point From Map` where the map reference exists.
- Promote a row to callable macro only when it is user-authored or reached from a source-backed path in `docs/generated/extra-ap-reachability-source-map.json`.
- Add project-level reachability analysis that scans Action Points, Extra Action Points, EDCD rows, Global hooks, battles, monsters, timed encounters, and random rectangles. Use that to separate callable macros from unreferenced imported Extra AP data.

## Writer Gate

Action Point and Extra Action Point writes can continue through the existing `struct door` command path. `src-tauri/src/realmz.rs` parses and writes every byte in each 40-byte row, and the focused roundtrip tests `doors_round_trip` and `extra_action_points_round_trip` cover map Action Points and `Data ED3` rows. `Data EDCD` is similarly fully owned as five signed shorts per 10-byte row and covered by `extracodes_round_trip`.

Normal read/write preserves imported rows. The desktop exporter now pads `Data ED3` and `Data EDCD` back to their imported fixed-row byte length when an authoring command clears or removes the highest imported row, so normal export cannot accidentally compact those files. A future true "compact/remove imported rows" command would need to be explicit and destructive; ordinary clear/reuse controls should continue preserving row positions.
