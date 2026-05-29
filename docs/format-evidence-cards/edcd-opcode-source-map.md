# Evidence Card: Data EDCD Opcode Source Map

## User-Facing Unlock

Providence can stop treating every advanced CODE/ID pair as a guess. This pass source-audits the top-level Realmz dispatcher calls to `loadextracode(id)` and corrects the Scripts/AP editor, semantic graph, and validation tables for opcodes whose `ID` selects a `Data EDCD` row.

The most important user-facing correction is:

- **Opcode 39 / Extend Codes** does **not** use a `Data EDCD` row. Its `ID` directly calls an Extra Action Point row.
- **Opcodes 19, 40, 51, 55, 64, and 106** do use `Data EDCD` rows and should expose typed parameter fields instead of a direct target picker.
- **Battle-like EDCD rows are not interchangeable**: opcodes `2`, `48`, `56`, and `107` use different sound, branch, treasure, and revive fields. Opcode `2` has a deliberate dual-use field: its third EDCD value is a pre-battle sound normally, but becomes the Extra Action Point to run when item 5 enables revive-on-loss.
- **Opcode 7 / Patch Actions** loads an Extra Action Point row from `extracode[2]` and copies its eight script slots into either an Action Point record or an encounter-result cache row. This is a source-backed Extra Action Point reference even though it is a mutation/copy workflow rather than a branch.
- **Damage/heal opcodes 15 and 16** display `abs(extracode[4])`, so negative values still point at messages rather than becoming raw preserved data.
- **Opcode 13 / AP State** mutates Action Point `percent` fields on land/dungeon records. It is EDCD-backed runtime state mutation, not an Extra Action Point call.
- **Opcode 37 / Dungeon Move** uses EDCD fields as destination mode/level/coordinates/heading, not sound/message fields.
- **Opcode 43 / Give Condition** and **opcode 124 / Spawn** both have source-backed sound fields at `extracode[3]`.
- **Opcode 50 and opcode 52 are distinct selector rows** even though both pick characters. Opcode `50` uses race/caste/gender/class fields; opcode `52` uses movement/position/item/percent/current-character selectors.
- **Opcode 92 / Alter Random Rectangle Shape** is a paired EDCD shape: the action `ID` loads the primary row, then Realmz immediately loads `ID + 1` for rectangle shape details.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\misc.c:560` | `loadextracode(id)` seeks `id * sizeof extracode`, reads five signed shorts from `Data EDCD`, and endian-converts them. |
| `F:\Realmz\src\realmz_orig\flashrange-loaddoor.c:43` | `loaddoor2(id)` loads a fixed `struct door` row from `Data ED3`; this is Extra Action Point storage, not EDCD. |
| `F:\Realmz\src\realmz_orig\newland.c:1998` | Opcode `19` loads EDCD and displays a random message in the `extracode[0]..extracode[1]` range. |
| `F:\Realmz\src\realmz_orig\newland.c:2738` | Opcode `39` directly calls `loaddoor2(id)` and restarts script evaluation. |
| `F:\Realmz\src\realmz_orig\newland.c:2745` | Opcode `40` loads EDCD and branches based on `partycondition[extracode[3]]`. |
| `F:\Realmz\src\realmz_orig\newland.c:3174` | Opcode `51` loads EDCD, mutates shop inflation/stock state, and writes the shop cache. |
| `F:\Realmz\src\realmz_orig\newland.c:3306` | Opcode `55` loads EDCD and branches based on whether picked characters exist. |
| `F:\Realmz\src\realmz_orig\newland.c:3514` | Opcode `64` loads EDCD and branches based on current game day/hour. |
| `F:\Realmz\src\realmz_orig\newland.c:828` | Opcode `106` loads EDCD and sets `randlevel.isdark` from `extracode[0] - 1`. |
| `F:\Realmz\src\realmz_orig\newland.c:1444` | Opcode `2` starts a battle/range; `extracode[2]` is an optional sound in normal battles, `extracode[3]` is an optional message, and `extracode[4] == 10` revives the party after combat. |
| `F:\Realmz\src\realmz_orig\newland.c:1493` | When opcode `2` has revive-on-loss enabled, Realmz calls `loaddoor2(extracode[2])` after revival; Divinity documents this as "X-AP on Revived Losses" and warns not to use the optional sound field in those battles. |
| `F:\Realmz\src\realmz_orig\newland.c:1729` | Opcode `7` loads EDCD and patches action data from the Extra Action Point row in `extracode[2]`. |
| `F:\Realmz\src\realmz_orig\newland.c:1735` | Opcode `7` mode `-1` copies the loaded Extra Action Point action slots into a simple encounter result row in the runtime `CE` cache. |
| `F:\Realmz\src\realmz_orig\newland.c:1754` | Opcode `7` mode `-2` copies the loaded Extra Action Point action slots into a complex encounter result row in the runtime `CE2` cache. |
| `F:\Realmz\src\realmz_orig\newland.c:1789` | Opcode `7` default mode copies the loaded Extra Action Point action slots into a land/dungeon Action Point record and saves that level cache. |
| `F:\Realmz\src\realmz_orig\newland.c:1874` | Opcode `13` loads EDCD and mutates Action Point `percent` fields on a selected land/dungeon level or trigger range. |
| `F:\Realmz\src\realmz_orig\newland.c:3069` | Opcode `48` starts a selective battle/range; `extracode[2]` is sound, `extracode[3]` is message, and `extracode[4]` is an optional treasure. |
| `F:\Realmz\src\realmz_orig\newland.c:3133` | Opcode `50` picks characters by race, gender, caste, race descriptor/class, or caste class. Fields `0`, `1`, `2`, and `4` are owned; field `3` is loaded but unused. |
| `F:\Realmz\src\realmz_orig\newland.c:3188` | Opcode `52` picks characters by movement, party position, item ownership/equipment, percent roll, saving throw, current selected character, or exact party position. It uses fields `0`, `1`, and `2`; fields `3..4` are loaded but unused. |
| `F:\Realmz\src\realmz_orig\newland.c:3382` | Opcode `56` starts a battle/range; `extracode[2]` is a coward/flee Extra Action Point, `extracode[3]` is sound, and `extracode[4]` is message. |
| `F:\Realmz\src\realmz_orig\newland.c:705` | Opcode `107` starts an improved selective battle/range; `extracode[2]` is sound, `extracode[3]` is message, and `extracode[4]` is a coward/flee Extra Action Point. |
| `F:\Realmz\src\realmz_orig\newland.c:1934` | Opcode `15` gives damage/heal to picked characters; `extracode[3]` is sound and `abs(extracode[4])` is message. |
| `F:\Realmz\src\realmz_orig\newland.c:1947` | Opcode `16` gives damage/heal to the party; `extracode[3]` is sound and `abs(extracode[4])` is message. |
| `F:\Realmz\src\realmz_orig\newland.c:2655` | Opcode `37` moves between dungeon/land views; EDCD fields are mode, destination level, X, Y, and heading/view flag. |
| `F:\Realmz\src\realmz_orig\newland.c:2831` | Opcode `43` gives a condition to party/picked/alive characters and plays `extracode[3]` for each affected character. |
| `F:\Realmz\src\realmz_orig\newland.c:2045` | Opcode `21` uses zero-based branch modes: `0` Extra Action Point, `1` simple encounter, `2` complex encounter; missing-item behavior `2` displays a message instead of branching. |
| `F:\Realmz\src\realmz_orig\newland.c:2692` | Opcode `38` force branch uses mode `0` for Extra Action Point; modes `1`, `2`, and `3` branch within already-loaded simple/complex action rows rather than external records. |
| `F:\Realmz\src\realmz_orig\newland.c:1310` | Opcode `85` random branch uses zero-based modes over an inclusive target range. |
| `F:\Realmz\src\realmz_orig\newland.c:1194` | Opcode `86` branches on misc party state with zero-based mode stored in `extracode[2]`; Realmz stores `FALSE` first and only branches when the resolved target is nonzero. |
| `F:\Realmz\src\realmz_orig\newland.c:1123` | Opcode `87` branches on allies with zero-based mode stored in `extracode[1]`; missing-ally behavior `2` displays a message. |
| `F:\Realmz\src\realmz_orig\newland.c:140` | Opcode `76` only branches after the quest update when `extracode[3]` is nonzero and the threshold is reached; if it branches, target row `0` is still valid. |
| `F:\Realmz\src\realmz_orig\newland.c:178` | Opcode `77` only branches for false/true sides whose target field is nonzero. |
| `F:\Realmz\src\realmz_orig\newland.c:269` | Opcode `78` follows the same guarded false/true branch pattern as opcode `77`. |
| `F:\Realmz\src\realmz_orig\newland.c:942` | Opcode `92` alters random rectangle metadata, then loads `Data EDCD` row `ID + 1` for absolute/offset/warp bounds. |
| `F:\Realmz\src\realmz_orig\newland.c:351` | Opcode `122` causes a combat fumble; `extracode[0]` is the optional message and `extracode[1]` is the optional sound. Fields `2..4` are loaded but not consumed. |
| `F:\Realmz\src\realmz_orig\newland.c:423` | Opcode `124` spawns monsters from `Data MD`; `extracode[3]` plays as a spawn sound after a monster is placed. |
| `F:\Realmz\src\realmz_orig\newland.c:560` | Opcode `126` can call one combat-round Extra Action Point or an inclusive Extra Action Point range depending on `extracode[2]`. |

## Coverage Guard

The `newland.c` dispatcher audit currently finds **70** top-level `loadextracode(id)` cases. Providence's action table contains **70** matching EDCD-backed opcode shapes, with no missing or extra shape assignments. The Rust semantic test `semantic::opcodes::tests::source_backed_edcd_shape_corrections_match_dispatcher` now locks that source-audited set so future opcode edits cannot silently drop EDCD coverage.

The generated byte-roundtrip ledger records `Data EDCD` in 87/87 scenario roots with file lengths that are all multiples of the 10-byte five-short row size. Observed sizes range from 40 to 648,630 bytes, and every `Data EDCD` file roundtrips byte-identically in that ledger. No known-valid corpus file currently requires partial-tail preservation for `Data EDCD`.

## Corrected Shape Map

| Opcode | Providence Shape | EDCD Fields | Runtime Meaning |
| ---: | --- | --- | --- |
| 2 | `battle` | `battleLow`, `battleHigh`, `soundOrReviveLossMacro`, `message`, `revivePartyFlag` | Starts a battle/range; optional sound/message precede combat normally, but when `revivePartyFlag == 10`, the sound field becomes the Extra Action Point to run after a revived loss. |
| 7 | `action-data-patching` | `levelOrCache`, `targetRecord`, `macro`, `levelKind`, `resultSlot` | Loads Extra Action Point row `macro`, then copies its eight CODE/ID slots into either a simple encounter result row, complex encounter result row, or Action Point record on a loaded land/dungeon level. |
| 13 | `trigger-mutation` | `level`, `singleTrigger`, `percent`, `rangeStartWithSign`, `rangeEnd` | Sets one Action Point percent and/or a range of Action Point percent fields on the selected land/dungeon level. Negative range start selects dungeon cache; positive selects land cache. |
| 20/45 | `teleport` | `levelOrKeep`, `xOrKeep`, `yOrKeep`, `sound`, `message` | `-1` in level/x/y leaves the current value unchanged; sound/message are optional caller effects after movement. |
| 33 | `gold` | `signedAmount`, `failureMarker`, unused, unused, unused | Positive `signedAmount` takes gold directly; zero/negative checks/takes `abs(signedAmount)` through the alternate Realmz path. `failureMarker == -1` triggers the hard-coded failure path. |
| 15/16 | `damage-heal` | `multiplier`, `low`, `high`, `sound`, `message` | Applies damage/heal and displays `abs(message)` when nonzero, so negative message values still resolve to `Data SD2`. |
| 19 | `random-message` | `messageLow`, `messageHigh`, unused, unused, unused | Displays one random scenario message from an inclusive range. |
| 37 | `dungeon-move` | `mode`, `level`, `x`, `y`, `signedHeading` | Moves to dungeon or land coordinates. Field `4` is a signed heading/view flag for dungeon moves, not a message. |
| 39 | none | none | Directly calls Extra Action Point row `ID`. |
| 40 | `party-condition-branch` | `expectedState`, `branchMode`, `branchTarget`, `condition`, unused | Branches when the party condition matches the expected state. |
| 43 | `condition` | `scope`, `condition`, `durationOrDelta`, `sound`, unused | Applies a condition to party/picked/alive characters and plays the configured sound for each affected character. |
| 48 | `selective-battle` | `battleLow`, `battleHigh`, `sound`, `message`, `treasure` | Starts a selective battle/range with optional sound/message and optional treasure reward. |
| 50 | `race-caste-gender-selector` | `selector`, `gender`, `raceCasteOrClass`, unused, `livingOnly` | Picks characters by race, gender, caste, race descriptor/class, or caste class. `livingOnly` restricts selection to living characters when nonzero. |
| 51 | `shop-mutation` | `shop`, `inflationDelta`, `item`, `stockDelta`, unused | Alters shop inflation and/or item stock cache. |
| 52 | `character-selector` | `selector`, `value`, `sourceSet`, unused, unused | Picks characters by movement, position, item, percent, saving throw, current selected character, item-equipped state, or exact party position. `sourceSet` controls all/alive/currently-picked behavior. |
| 54 | `timed-encounter-mutation` | `timedEncounter`, `percentOrKeep`, `incrementOrKeep`, `resetDayFlag`, `dayOffsetOrKeep` | `-1` keeps percent/increment/day-offset fields unchanged; `resetDayFlag` can reset the encounter day to the current game day before applying an offset. |
| 55 | `picked-branch` | `pickedSelector`, `failureBehavior`, unused, `successMacro`, `failureTarget` | Branches to success macro when characters are picked; failure target is macro or message depending on behavior. |
| 56 | `battle-outcome-branch` | `battleLow`, `battleHigh`, `cowardMacro`, `sound`, `message` | Starts a battle/range, then branches to `cowardMacro` if the party flees/cowards out. |
| 63 | `time-mutation` | `mode`, `dayOrDelta`, `hourOrDelta`, `minuteOrDelta`, unused | In set-clock mode, `-1` keeps that clock field unchanged; in offset mode the same fields are deltas. |
| 64 | `game-time-branch` | `dayLimit`, `hourLimit`, unused, `successMacro`, `failureMacro` | Branches by current game day/hour comparison. |
| 65 | `random-items` | `countOrRandomLimit`, `itemLow`, `itemHigh`, unused, unused | Negative `countOrRandomLimit` means choose a random count from `abs(countOrRandomLimit)`. |
| 74 | `spell-points` | `signedRollCount`, `lowOrSound`, `high`, `playSound`, `message` | Negative `signedRollCount` takes spell points; positive gives them. When `playSound` is nonzero, Realmz also plays `lowOrSound` as the sound ID before rolling the amount range. |
| 86 | `misc-conditional-branch` | `testSelector`, `signedTestValue`, `branchMode`, `trueTarget`, `falseTarget` | Branches on party/caste/race/gender/boat/camp/level tests. Negative `signedTestValue` narrows caste/race/gender/class/descriptor tests to picked characters and compares by absolute value. |
| 87 | `conditional-branch` | `allyNameId`, `branchMode`, `falseBehavior`, `trueTarget`, `falseTarget` | Branches on an ally/held-over NPC name. False side either branches through `branchMode` or displays `falseTarget` as a message. |
| 92 | `random-region-shape-mutation` + `random-region-shape-details` | Primary row: `level`, `rect`, `isDungeon`, `percentDelta`, `shapeMode`; secondary row `ID + 1`: `shapeX1`, `shapeY1`, `shapeX2`, `shapeY2`, `shapeFlags` | Mutates a random rectangle in the loaded land/dungeon cache; shape mode `-1` leaves bounds unchanged, `0` sets absolute bounds, `1` offsets left/right and top/bottom together, `2` warps each bound independently. |
| 106 | `dark-level-state` | `darkStatePlusOne`, `stopIfAlready`, unused, unused, unused | Mutates outdoor darkness state for the current random level cache. |
| 107 | `improved-selective-battle` | `battleLow`, `battleHigh`, `sound`, `message`, `cowardMacro` | Starts an improved selective battle/range; `cowardMacro` is called if the party flees/cowards out. |
| 122 | `fumble` | `message`, `sound`, unused, unused, unused | During eligible combat physical attacks, optionally plays `sound` and displays `message`, then drops the active weapon if possible. |
| 124 | `spawn` | unused, `monster`, `countOrRandomLimit`, `sound`, `traitorOverride` | Spawns combat monsters; negative `countOrRandomLimit` chooses a random count from `abs(countOrRandomLimit)`, and Realmz plays `sound` when each monster is placed. |

## Branch Mode Conventions

EDCD branch rows do not share one universal target-mode encoding. Providence now classifies them by source-backed convention:

| Convention | Shapes / Opcodes | Meaning |
| --- | --- | --- |
| One-based external branch | `choice`, `party-condition-branch`, `quest-value` | `1` = Extra Action Point, `2` = simple encounter, `3` = complex encounter. |
| Zero-based external branch | `item-branch`, `item-charge-branch`, `false-true-branch`, `range-branch`, `random-branch`, `misc-conditional-branch`, `conditional-branch` | `0` = Extra Action Point, `1` = simple encounter, `2` = complex encounter. |
| Force branch | `force-branch`, `percent-branch` | `0` = Extra Action Point; `1`, `2`, and `3` are inline simple/complex action-row control paths, not independent external records. |
| Direct macro fields | `picked-branch`, `game-time-branch`, `ability-check-branch`, `condition-branch`, `battle-macro` | Fields explicitly named macro/Extra Action Point call `Data ED3` rows without a mode table. |

Two branch rows also have target fields whose type depends on a behavior field, not only the branch mode:

- `item-branch.missingTarget`: `missingBehavior = 0` branches using the row branch mode; `missingBehavior = 2` displays `missingTarget` as a message.
- `conditional-branch` for opcode `87`: `falseBehavior = 0` branches using the row branch mode; `falseBehavior = 2` displays `falseTarget` as a message.

Zero is a valid row index whenever the branch mode actually chooses an Extra Action Point, simple encounter, or complex encounter and Realmz reaches the branch call. It is only "continue" or "no branch" when the opcode source guards the target field before branching. Known guarded-zero branch rows are:

- `quest-value` opcode `76`: target is ignored unless the threshold field is nonzero and the update reaches the threshold.
- `false-true-branch` opcodes `77` and `78`: false/true target fields of `0` mean that side does not branch.
- `misc-conditional-branch` opcode `86`: resolved true/false target `0` means the branch is skipped.

Providence's editor-side target resolver mirrors these guarded cases. That means row `0` remains a valid Extra Action Point target when Realmz actually calls `loaddoor2(0)`, while the guarded no-branch fields above do not produce missing-target warnings or macro pickers until the stored target is nonzero.

Known unguarded row-zero Extra Action Point paths include action-data patching opcode `7`, ability branch opcode `31`, game-time branch opcode `64`, condition branch opcode `81`, random branch opcode `85`, conditional branch opcode `87`, battle macro opcode `126`, direct Extra Action Point opcode `39`, battle flee/revive macros in opcodes `2`, `56`, and `107`, and the direct success/failure macro fields in opcodes `55` and `64`.

Opcode `7` is a special case: Realmz always loads the Extra Action Point row in `extracode[2]`, but it copies that row's action slots into another record instead of branching into it immediately. Providence should still treat the referenced row as callable/source-backed content for reachability, while labeling the opcode itself as Action Point or encounter-result patching.

Opcode `8` is the inverse correction: Divinity labels it "Same as Other Action Point" and the guide lists extra-code fields for a land ID plus Action Point number, but the Realmz runtime dispatcher does not call `loadextracode()` for this opcode. Source line `newland.c:1810` copies `door[id].code/id` from the currently loaded map into the active Action Point and continues. Providence should not treat opcode `8` as an Extra Action Point / macro target; battle, monster, timed encounter, and global macro fields use direct Extra Action Point references separately.

## Multi-Row EDCD Shapes

Most EDCD-backed opcodes consume exactly one five-short row. Opcode `92` is the known exception in the top-level dispatcher:

1. Realmz loads the primary row selected by the action ID.
2. It saves the current level cache, loads the target land/dungeon level, mutates `randlevel.percent[rect]`, and reads `shapeMode`.
3. It loads `Data EDCD` row `ID + 1` for shape details.
4. It applies the secondary row according to `shapeMode`: no change, absolute rectangle, offset rectangle, or per-bound warp.
5. It saves the target level cache and reloads the previous level.

Writer implication: Providence must treat opcode `92` rows as a pair for validation and editor UI. Editing only the primary row can still preserve bytes, but a safe authoring surface must show and preserve the `ID + 1` row and warn when it is missing.

## Corpus Evidence

`Data EDCD` exists in every known scenario in the current corpus. This pass does not require another full corpus roundtrip; it corrects the static opcode-to-EDCD table against Realmz source and leaves byte-preservation behavior unchanged.

## Divinity Field Notes

The Divinity guide lists an optional sound field for some string-related actions, but Realmz runtime does not consume a sound field for opcode `19`: `newland.c:1998` loads EDCD and `newland.c:2000` directly displays a random `Data SD2` message. Providence should keep opcode `19` as `messageLow/messageHigh` plus three preserved unused fields unless Divinity binary evidence proves a separate editor-only write path. Sound-bearing text flows should stay on source-backed caller records, such as battle, teleport, damage/heal, random-area, thief, and similar shapes that explicitly call `sound(extracode[n])` before displaying text.

## Providence Follow-Up

- Follow-up: `validation`, `editor-ui`, `docs-only`.
- The Scripts/AP EDCD Attachment section should now appear for opcodes `19`, `40`, `51`, `55`, `64`, and `106`.
- Direct target pickers should remain available for opcode `39` because its ID is an Extra Action Point row.
- Battle-family EDCD editors should use opcode-specific field labels for opcodes `2`, `48`, `56`, and `107`; sharing one generic battle variant shape loses byte ownership.
- Character-picking EDCD editors should keep opcode `50` and opcode `52` as separate shapes; sharing one generic selector shape loses field ownership for gender/living-only versus movement/item/source-set rows.
- Opcode `2` editors should label field 3 contextually: sound for ordinary battles, Extra Action Point on revived losses when item 5 equals `10`.
- Damage/heal opcodes `15` and `16` should resolve negative message values by absolute value, matching Realmz runtime.
- Opcode `37` should remain a movement-coordinate editor and must not expose fake sound/message fields.
- Opcodes `43` and `124` should resolve their `sound` fields through the same sound picker/preview path as fumble, teleport, damage/heal, and battle-family rows.
- Opcode `92` editors must expose the secondary `ID + 1` EDCD row; both native and browser semantic import paths should report a missing-secondary-row warning.
- Opcode `122` editors and link resolvers should treat field `1` as a sound resource and field `4` as preserved unused data, not as a message target.
- Text and Assets usage links now resolve source-backed EDCD message/sound fields instead of only direct CODE/ID slots. This covers random message ranges, choice prompts, battle/teleport/damage-heal messages, fumble messages/sounds, spell-point message/sound rows, condition/spawn sounds, and battle-family sounds while keeping opcode `19` out of the direct-message action path.
- Extra Action Point target fields should resolve through the source-backed roots in `docs/generated/extra-ap-reachability-source-map.json`; EDCD alone does not make every numeric field callable.
- Divinity-facing labels still need more polish, but the runtime source map is now corrected.

## Writer Gate

No new writer format is introduced. `Data EDCD` remains five signed-short rows selected by action IDs, with opcode `92` treating the selected row and the immediately following row as one logical authoring unit. Editing is safe only through shape-specific field labels that preserve all values and roundtrip each row unchanged except for owned user edits.
