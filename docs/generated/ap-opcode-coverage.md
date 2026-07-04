# Action Point Opcode Coverage

Generated from Providence's action catalog, the Divinity/manual opcode crosswalk, and extracted Divinity opcode help.

## Summary

- authorable-now: 49
- edcd-backed-guided: 69
- ignored-empty: 1
- macro-only-context-gated: 1
- not-used-no-dispatch: 10

## Audit Triage

- combat-macro-only: 1
- covered-in-current-ui: 101
- intentionally-preserved: 11
- legacy-compatible: 3
- needs-manual-evidence: 1
- step-only-no-options: 13

## Evidence Confidence

- catalog-only: 2
- manual-backed: 65
- manual-plus-preservation: 10
- source-backed: 53

## Coverage

| Opcode | Gap | Confidence | Title | Manual ID | Providence Fields | Storage | Related | Chooser | Notes |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| -23 | covered-in-current-ui | source-backed | Alter Random Rectangle Information of a Land Level | Extra Codes ID | Land Level ID; Rectangle Number To Alter; New X ‘s In 10,000; New Battle Range Low -> battle; New Battle Range High -> battle | Data EDCD | 23 | Hidden chooser alias of 23; Providence shows one Change Random Encounter Area action; selecting a dungeon map target writes -23, and selecting a land map target writes 23. |  |
| -14 | needs-manual-evidence | catalog-only | Pick Inverse Characters | ID | ID -> direct-id | direct-id |  |  |  |
| 0 | intentionally-preserved | catalog-only | Empty | ID | ID -> direct-id | direct-id |  |  |  |
| 1 | covered-in-current-ui | manual-backed | Display String | String Number to Display | String Number To Display -> message | message |  |  |  |
| 2 | covered-in-current-ui | source-backed | Battle | Extra Codes ID | Battle Number -> battle; Battle High -> battle; Sound To Play Before Battle -> sound; String To Display Before Battle -> message; Revive Party Flag | Data EDCD |  |  | Field 2 is normally the optional pre-battle sound. When field 4 equals 10, Realmz revives the party after a loss and then calls loaddoor2(field 2), so the same field is the Extra Action Point to run on revived losses. Divinity warns not to specify an optional sound for revive battles. |
| 3 | covered-in-current-ui | source-backed | Player Option | Extra Codes ID | Reply Polarity; Branch Mode; X-AP/Branch No. Of Encounter (0-3) -> extra-action-point-or-encounter; Prompt, Left Side (Optional) -> message-or-option-label; Prompt, Right Side (Optional) -> message-or-option-label | Data EDCD |  |  |  |
| 4 | covered-in-current-ui | manual-backed | Simple Encounter | Simple Encounter ID | Simple Encounter ID -> simple-encounter | simple-encounter |  |  |  |
| 5 | covered-in-current-ui | manual-backed | Complex Encounter | Complex Encounter ID | Complex Encounter ID -> complex-encounter | complex-encounter |  |  |  |
| 6 | covered-in-current-ui | manual-backed | Load shop | Shop ID | Shop ID -> shop | shop |  |  |  |
| 7 | covered-in-current-ui | manual-backed | Change Action Point Codes | Extra Codes ID | Level / Cache; Target Record -> extra-action-point-or-encounter; Macro -> extra-action-point-or-encounter; For AP Replacement; For Encounter Script Replacement | Data EDCD |  |  | Realmz loads Extra Action Point row field 2 with loaddoor2(), then copies that row's eight CODE/ID slots into a simple encounter result row, complex encounter result row, or Action Point record on a loaded land/dungeon level. This makes field 2 a source-backed Extra Action Point reference even though opcode 7 mutates/copies records instead of branching immediately. |
| 8 | covered-in-current-ui | manual-backed | Same as Other Action Point | Extra Codes ID | Same-map Action Point -> same-map-action-point | same-map-action-point |  |  | Realmz does not call loadextracode() for opcode 8. It copies door[id].code/id from the currently loaded map into the active Action Point, so this is a same-map Action Point copy and not a Data ED3 macro/Extra AP call. |
| 9 | covered-in-current-ui | manual-backed | Play Sound | Sound ID of sound you wish to play. | ID -> sound | sound |  |  |  |
| 10 | covered-in-current-ui | manual-backed | Give Treasure | Treasure ID | Treasure ID -> direct-id | direct-id |  |  |  |
| 11 | covered-in-current-ui | manual-backed | Give Victory Points | Amount of Victory Points to give. | Amount Of Victory Points To Give -> direct-id | direct-id |  |  |  |
| 12 | covered-in-current-ui | source-backed | Change Land Tile | Extra Codes ID | Level; X-Coordinate; Y-Coordinate; New Tile ID; Is Dungeon | Data EDCD |  |  |  |
| 13 | covered-in-current-ui | manual-backed | Enable Action Point | Extra Codes ID | Land/Dungeon Level; Action Point Number; New % (Negative Value = Disabled); Action Point No. Low; Action Point No. High | Data EDCD |  |  | Realmz sets one Action Point percent and/or a range of Action Point percent fields on the selected land/dungeon level. This EDCD row mutates Action Point state and does not call Data ED3. |
| 14 | covered-in-current-ui | manual-backed | Pick Characters | Number of characters to pick | Number Of Characters To Pick -> direct-id | direct-id |  |  |  |
| 15 | covered-in-current-ui | manual-backed | Heal/Hurt Picked | Extra Codes ID | Multiplier ( - Is Hurt ); Low Range; High Range; Sound ---Optional--- -> sound; Message ---Optional--- -> message | Data EDCD |  |  | Realmz displays abs(extracode[4]) as the message target, so negative values are still message references. |
| 16 | covered-in-current-ui | manual-backed | Heal/Hurt Party | Extra Codes ID | Multiplier ( - Is Hurt ); Low Range; High Range; Sound ---Optional--- -> sound; Message ---Optional--- -> message | Data EDCD |  |  | Realmz displays abs(extracode[4]) as the message target, so negative values are still message references. |
| 17 | covered-in-current-ui | source-backed | Cast Spell on Picked | Extra Codes ID | Spell No. To Cast; Power Level; +/- % To DRVs Modifier; Force Affect | Data EDCD |  |  |  |
| 18 | covered-in-current-ui | source-backed | Cast Spell on Party | Extra Codes ID | Spell No. To Cast; Power Level; +/- % To DRVs Modifier; Force Affect | Data EDCD |  |  |  |
| 19 | covered-in-current-ui | manual-backed | Display Random String | Extra Codes ID | Low String Range Number -> message; High String Range Number -> message | Data EDCD |  |  | Realmz displays one random Data SD2 message from messageLow..messageHigh and does not call sound() for this opcode. |
| 20 | covered-in-current-ui | source-backed | Teleport | Extra Codes ID | Land ID To Teleport To; X-Coordinate (-1 = No Change); Y-Coordinate (-1 = No Change); Sound ---Optional--- -> sound; Message ---Optional--- Script Tip -> message | Data EDCD |  |  | Realmz leaves level/x/y unchanged when the corresponding field is -1; opcode 45 uses the same EDCD shape for teleport-only behavior. |
| 21 | covered-in-current-ui | source-backed | Branch on Possession of Specific Item | Extra Codes ID | Item ID To Check For -> extra-action-point-or-encounter; If Possessed, Branch To -> extra-action-point-or-encounter; Missing Behavior -> extra-action-point-or-encounter; X-AP/Encounter No. If Possessed -> extra-action-point-or-encounter; Missing Target -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 22 | covered-in-current-ui | source-backed | Alter Item Status | Extra Codes ID | Item ID To Alter -> item; Number Of Items To Affect; To Do; Charges To Add (- = Drain Charges); New Item ID -> item | Data EDCD |  |  |  |
| 23 | covered-in-current-ui | source-backed | Alter Random Rectangle Information of a Land Level | Extra Codes ID | Land Level ID; Rectangle Number To Alter; New X ‘s In 10,000; New Battle Range Low -> battle; New Battle Range High -> battle | Data EDCD | -23 | Canonical chooser action for -23; Providence shows one Change Random Encounter Area action; selecting a dungeon map target writes -23, and selecting a land map target writes 23. |  |
| 24 | covered-in-current-ui | manual-backed | Exit Action Point And Keep Codes | None | ID -> direct-id | direct-id |  |  |  |
| 25 | step-only-no-options | manual-backed | Exit Action Point and Delete Action Point | None | Step only | direct-id |  |  |  |
| 26 | step-only-no-options | manual-backed | Get Click | None | Step only | direct-id |  |  |  |
| 27 | covered-in-current-ui | manual-backed | Display Picture | Picture Resource ID to display | Picture Resource ID To Display -> picture | picture |  |  |  |
| 28 | covered-in-current-ui | manual-backed | Redraw Screen | 0 = Enable Camping 1 = Disable Camping | ID -> direct-id | direct-id |  |  |  |
| 29 | covered-in-current-ui | manual-backed | Give / Display Map | Map Number to give or display. | Map Number To Give Or Display -> direct-id | direct-id |  |  |  |
| 30 | covered-in-current-ui | source-backed | Pick on Check Vs. Attribute / Special Abilities | Extra Codes ID | Signed Ability / Attribute; +/- Modifer; Who To Check; Attribute Flag | Data EDCD |  |  | Realmz uses abs(extracode[0]) for the ability/attribute index. A negative value reverses the picked-character result after the check. |
| 31 | covered-in-current-ui | source-backed | Branch on Check Vs. Attribute • Special Abilities | Extra Codes ID | Ability / Attribute -> extra-action-point-or-encounter; +/- Modifer -> extra-action-point-or-encounter; Attribute Flag -> extra-action-point-or-encounter; Branch To X-AP On Success -> extra-action-point-or-encounter; Branch To X-AP On Fail Note -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 32 | covered-in-current-ui | manual-backed | Offer Temple | Inflation Rate of Temple (100 = 100% or Normal Prices) | Inflation Rate Of Temple -> direct-id | direct-id |  |  |  |
| 33 | covered-in-current-ui | source-backed | Take Gold | Amount of gold to take | Signed Amount; Failure Marker | Data EDCD |  |  | Realmz takes positive amounts directly and uses abs(amount) through its alternate path for zero/negative amounts; failureMarker -1 enters the hard-coded failure branch. |
| 34 | step-only-no-options | manual-backed | Break Encounter Loop (Usable only within encounters) | None | Step only | direct-id |  |  |  |
| 35 | covered-in-current-ui | manual-backed | Eliminate Simple Encounter Option | Simple Encounter Option (1 to 4) To Eliminate. | Simple Encounter Option -> simple-encounter | simple-encounter |  |  |  |
| 36 | covered-in-current-ui | manual-backed | Capture • Restore Party's Equipment | 0 = Restore Equipment, 1 = Capture Equipment | ID -> direct-id | direct-id |  |  |  |
| 37 | covered-in-current-ui | source-backed | Enter • Exit Dungeon | Extra Codes ID | Mode; Dungeon / Land Level To Goto; X-Coord; Y-Coord; Starting Heading | Data EDCD |  |  | Realmz uses the row to move between dungeon/land views; fields 3 and 4 are coordinate/heading data, not sound/message data. |
| 38 | covered-in-current-ui | source-backed | Continue On Possession, Else Branch Within Encounters. | Extra Codes ID | Item ID To Check For -> extra-action-point-or-encounter; Test B -> extra-action-point-or-encounter; Branch Mode -> extra-action-point-or-encounter; X-AP/Branch No -> extra-action-point-or-encounter; Code No. (0 = Top Code/ID) E-Code -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 39 | covered-in-current-ui | manual-backed | Extend Action Point Script | Extra Action Point ID to use as a continuation of current AP. | Extra Action Point -> extra-action-point | extra-action-point |  |  |  |
| 40 | covered-in-current-ui | manual-backed | Branch on Party Condition | Extra Codes ID | Expected State -> extra-action-point-or-encounter; Type Of Branch -> extra-action-point-or-encounter; X-AP/Encounter No -> extra-action-point-or-encounter; Party Condition To Check For -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 41 | covered-in-current-ui | source-backed | Eliminate Other Encounter Choice | Extra Codes ID | Simple Encounter No -> simple-encounter; Choice No. To Eliminate (1-4) | Data EDCD |  |  |  |
| 42 | covered-in-current-ui | source-backed | Branch on Percent Chance | Extra Codes ID | Percent -> extra-action-point-or-encounter; Success Behavior -> extra-action-point-or-encounter; Branch Mode -> extra-action-point-or-encounter; X-AP/Branch No. (0-3) -> extra-action-point-or-encounter; Code No. (0 = Top Code/ID) E-Code -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 43 | covered-in-current-ui | manual-backed | Give Condition | Extra Codes ID | Affect Who; Condition; Duration/Magnitude; Sound ---Optional--- -> sound | Data EDCD |  |  | Realmz plays extracode[3] when applying the condition to each eligible character. |
| 44 | covered-in-current-ui | manual-backed | Eliminate Complex Encounter Choice | Branch To Eliminate (0-3) | Branch To Eliminate (0-3) -> direct-id | direct-id |  |  |  |
| 45 | covered-in-current-ui | source-backed | Teleport Only | Extra Codes ID | Land Level ID (-1 = No Change); X-Coord (-1 = No Change); Y-Coord (-1 = No Change); Sound ---Optional--- Note -> sound; Message -> message | Data EDCD |  |  |  |
| 46 | covered-in-current-ui | source-backed | Branch on Quest (See code 72 for more options) | Extra Codes ID | Quest ID To Branch On -> extra-action-point-or-encounter; Test B -> extra-action-point-or-encounter; Branch Mode -> extra-action-point-or-encounter; X-AP/Branch No. (0-3) -> extra-action-point-or-encounter; Code No -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 47 | covered-in-current-ui | manual-backed | Set • Clear Quest | Quest ID to Set/Clear | Quest ID To Set/Clear -> direct-id | direct-id |  |  |  |
| 48 | covered-in-current-ui | manual-backed | Selective Battle | Extra Codes ID | Low Range Of Battle ID -> battle; High Range Of Battle ID -> battle; Sound ---Optional--- -> sound; Message ---Optional--- -> message; Treasure On Victory | Data EDCD |  |  | Field 4 is an optional treasure, not a branch target. |
| 49 | covered-in-current-ui | manual-backed | Offer Banking | None | ID -> direct-id | direct-id |  |  |  |
| 50 | covered-in-current-ui | source-backed | Pick On Race • Caste • Race Class • Caste Class • Gender | Extra Codes ID | Type; Gender To Pick; Race Caste / Class; Who To Check | Data EDCD |  |  |  |
| 51 | covered-in-current-ui | manual-backed | Alter Shop | Extra Codes ID | Shop ID To Alter -> shop; Alter Inflation Rate; Item ID To Add/Reduce -> item; Number To Add/Reduce | Data EDCD |  |  |  |
| 52 | covered-in-current-ui | source-backed | Pick on Miscellaneous | Extra Codes ID | Selector; Value; Source Set | Data EDCD |  |  |  |
| 53 | covered-in-current-ui | source-backed | Pick on Character Caste | Extra Codes ID | Specific Caste Only; Caste Types; Check | Data EDCD |  |  |  |
| 54 | covered-in-current-ui | source-backed | Alter Time Encounter | Extra Codes ID | Time Encounter ID; New % Chance Of Activation; New Day Increment (-1 = No Change); Reset Day Flag; Days To Add To Next Activation | Data EDCD |  |  | Realmz uses -1 to keep percent, increment, and day-offset fields unchanged; resetDayFlag resets the encounter day to the current game day before applying the offset. |
| 55 | covered-in-current-ui | manual-backed | Branch on Picked | Extra Codes ID | Success On -> extra-action-point-or-encounter; Type Of Branch -> extra-action-point-or-encounter; X-AP On Success -> extra-action-point-or-encounter; Failure Target -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 56 | covered-in-current-ui | manual-backed | Branch on Battle Outcome | Extra Codes ID | Battle Number -> battle; Battle High -> battle; Coward Macro -> extra-action-point-or-encounter; Sound. (Optional) -> sound; Message -> message | Data EDCD |  |  | Field 2 is an Extra Action Point called when the party flees/cowards out; fields 3 and 4 are sound/message. |
| 57 | covered-in-current-ui | source-backed | Change Land Tile Set | Extra Codes ID | Landlook; Is Dark; Target Land Level -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 58 | covered-in-current-ui | source-backed | Branch on Difficulty Level | Extra Codes ID | Test A -> extra-action-point-or-encounter; Test B -> extra-action-point-or-encounter; Branch Mode -> extra-action-point-or-encounter; X-AP/Branch No. (0-3) -> extra-action-point-or-encounter; Code No. (0 = Top Code/ID) E-Code -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 59 | covered-in-current-ui | source-backed | Branch on Tile ID Check | Extra Codes ID | Test A -> extra-action-point-or-encounter; Test B -> extra-action-point-or-encounter; Branch Mode -> extra-action-point-or-encounter; X-AP/Branch No. (0-3) -> extra-action-point-or-encounter; Code No. (0 = Top Code/ID) E-Code -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 60 | covered-in-current-ui | source-backed | Drop Party Money | Extra Codes ID | Money Type; Take From | Data EDCD |  |  |  |
| 61 | covered-in-current-ui | source-backed | Shift Party X: and Y: Location | Extra Codes ID | Shift X Amount +/- Number Of Steps; Shift Y Amount +/- Number Of Steps; Randomize | Data EDCD |  |  |  |
| 62 | covered-in-current-ui | manual-backed | Display Scrolling Text | Text ID To Display | TEXT Resource -> text-resource | direct-id |  |  |  |
| 63 | covered-in-current-ui | source-backed | Alter Game Time | Extra Codes ID | Mode; Days; Hours; Minutes E-Code 1 Notes | Data EDCD |  |  | In set-clock mode, -1 keeps each clock field unchanged; in offset mode, the same fields are added as deltas. |
| 64 | covered-in-current-ui | manual-backed | Branch on Game Time | Parameter Row | Test Time -> extra-action-point-or-encounter; Test Time -> extra-action-point-or-encounter; Success Macro -> extra-action-point-or-encounter; Failure Macro -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 65 | covered-in-current-ui | source-backed | Award Random Item(s) | Parameter Row | Number Of Items To Award; Low ID Of Random Items -> item; High ID Of Random Items -> item | Data EDCD |  |  | Realmz treats a negative first field as a random item count limit via Rand(abs(extracode[0])); positive values are fixed counts. |
| 66 | covered-in-current-ui | manual-backed | Set Camping Ability | 0 = Enable Camping 1 = Disable Camping | ID -> direct-id | direct-id |  |  |  |
| 67 | covered-in-current-ui | source-backed | Branch on Item Charges | Extra Codes ID | Item ID To Check For -> extra-action-point-or-encounter; If Enough Charges, Branch To -> extra-action-point-or-encounter; Minimum Charges -> extra-action-point-or-encounter; Success Target -> extra-action-point-or-encounter; Failure Target -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 68 | covered-in-current-ui | source-backed | Alter Party Fatigue | Extra Codes ID | Mode; Calculated Fatigue % | Data EDCD |  |  |  |
| 69 | covered-in-current-ui | source-backed | Set Spell Casting • Recharging Flags | Extra Codes ID | Spellcasting; Monstercasting -> monster; Spellcharging | Data EDCD |  |  |  |
| 70 | covered-in-current-ui | source-backed | Save and Restory Party Postion | Extra Codes ID | Mode | Data EDCD |  |  |  |
| 71 | covered-in-current-ui | manual-backed | Disable • Enable X: Y: Display | 0 = Turn X: Y: Display On. 1 = Turn X: Y: Display Off. | ID -> direct-id | direct-id |  |  |  |
| 72 | covered-in-current-ui | source-backed | Branch on Range of Quests | Extra Codes ID | Low Quest ID Range To Check -> extra-action-point-or-encounter; High Quest ID Range To Check -> extra-action-point-or-encounter; REMARK -> extra-action-point-or-encounter; Branch To -> extra-action-point-or-encounter; X-AP ID / Ecounter ID To Branch To -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 73 | covered-in-current-ui | source-backed | Load Shop and Restrict Items Accepted | Extra Codes ID | Shop ID -> shop; Low Items ID To Accept #1; High Items ID To Accept #1; Low Items ID To Accept #2; High Items ID To Accept #2 Example | Data EDCD |  |  |  |
| 74 | covered-in-current-ui | source-backed | Take • Give Spell Points To Picked Characters | Extra Codes ID | Multiplier; Low Range / Sound -> sound; High Range; Play Sound -> sound; Message -> message | Data EDCD |  |  | Realmz uses abs(extracode[0]) as roll count; a negative first field takes spell points. If playSound is nonzero, field 1 is also passed to sound() before the roll range is applied. |
| 75 | covered-in-current-ui | source-backed | Branch on Spell Points | Extra Codes ID | Who To Test -> extra-action-point-or-encounter; Test B -> extra-action-point-or-encounter; False Behavior -> extra-action-point-or-encounter; On Success Branch To -> extra-action-point-or-encounter; X-AP / Encounter ID Note -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 76 | covered-in-current-ui | source-backed | Increment • Decrement Quest Value | Extra Codes ID | Quest -> quest; Amount To Add; Auto Branch Type; Threshold; Target -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 77 | covered-in-current-ui | source-backed | Branch on Quest Value | Extra Codes ID | Quest Flag -> extra-action-point-or-encounter; Test Value -> extra-action-point-or-encounter; Branch Type -> extra-action-point-or-encounter; Less Than Target -> extra-action-point-or-encounter; Equal Or Greater Target -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 78 | covered-in-current-ui | source-backed | Branch on Tile Parameters | Extra Codes ID | Attribute To Test For -> extra-action-point-or-encounter; Use Only For Type 7 Test -> extra-action-point-or-encounter; Type Of Branch -> extra-action-point-or-encounter; False Target -> extra-action-point-or-encounter; X-AP / Encounter ID If Test = TRUE -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 79 | intentionally-preserved | manual-plus-preservation | Not Used | ID | ID -> direct-id | direct-id |  |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 80 | intentionally-preserved | manual-plus-preservation | Not Used | ID | ID -> direct-id | direct-id |  |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 81 | covered-in-current-ui | source-backed | Branch on Character Condition | Extra Codes ID | What Condition To Test -> extra-action-point-or-encounter; Character Selector -> extra-action-point-or-encounter; Branch To X-AP On Success -> extra-action-point-or-encounter; Branch To X-AP On Fail -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 82 | step-only-no-options | manual-backed | Turn Cleric Turning OFF. | None | Step only | direct-id |  |  |  |
| 83 | step-only-no-options | manual-backed | Turn Cleric Turning ON. | None | Step only | direct-id |  |  |  |
| 84 | legacy-compatible | source-backed | Legacy Registration Check | ID | Step only | direct-id |  |  | Realmz source has a legacy registration-check dispatcher case. Classic Realmz could enforce scenario registration here; modern open-source builds keep the dispatcher but comment out enforcement. |
| 85 | covered-in-current-ui | source-backed | Branch on Random | Extra Codes ID | Type -> extra-action-point-or-encounter; Low Range Value -> extra-action-point-or-encounter; High Range Value -> extra-action-point-or-encounter; Sound --- Optional --- -> sound; Message --- Optional --- -> message | Data EDCD |  |  |  |
| 86 | covered-in-current-ui | manual-backed | Branch on Miscellaneous | Extra Codes ID | Test -> extra-action-point-or-encounter; Signed Test Value -> extra-action-point-or-encounter; Branch Type -> extra-action-point-or-encounter; X-AP/Encounter No. If Test = TRUE -> extra-action-point-or-encounter; False Target -> extra-action-point-or-encounter | Data EDCD |  |  | Opcode 86 stores the zero-based branch mode in field 2. For caste/race/gender/class/descriptor tests, a negative test value compares abs(value) only against picked characters. |
| 87 | covered-in-current-ui | source-backed | Branch on Special Character (NPC) Present | Extra Codes ID | Monster Number To Check For -> extra-action-point-or-encounter; If Present, Branch To -> extra-action-point-or-encounter; False Behavior -> extra-action-point-or-encounter; X-AP/Encounter No. If Present -> extra-action-point-or-encounter; False Target -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 88 | covered-in-current-ui | manual-backed | Drop Special Character from Party | Monster Number to Drop | Monster Number To Drop -> direct-id | direct-id |  |  |  |
| 89 | covered-in-current-ui | manual-backed | Add Special Character to Party | Monster Number | Monster Number -> direct-id | direct-id |  |  |  |
| 90 | covered-in-current-ui | source-backed | Take Away Victory Points | Codes ID | How Much To Take; Scope | Data EDCD |  |  |  |
| 91 | step-only-no-options | manual-backed | Drop All Equipment | None | Step only | direct-id |  |  |  |
| 92 | covered-in-current-ui | manual-backed | Alter Size of Random Rectangle | ID of First of two consecutive Extra Codes IDs. | Land/Dungeon Level Of Rectangle; Rectangle Number; Is Dungeon; +/- To Encounter %, Base 10,000; Shape Mode | Data EDCD |  |  | Realmz loads the action ID row, mutates randlevel.percent[rect], then loads ID+1 to apply no-change, absolute, offset, or per-bound warp rectangle updates. |
| 93 | step-only-no-options | manual-backed | Turn Compass On | None | Step only | direct-id |  |  |  |
| 94 | step-only-no-options | manual-backed | Turn Compass Off | None | Step only | direct-id |  |  |  |
| 95 | covered-in-current-ui | manual-backed | Change Look Direction | Direction to face the party. (Dungeons only) 1 = N, 2 = E, 3 = S, 4 = Wt, -1 = Random Direction. | Direction To Face The Party -> direct-id | direct-id |  |  |  |
| 96 | step-only-no-options | manual-backed | Force Party To Use 3D View In Dungeons | None | Step only | direct-id |  |  |  |
| 97 | step-only-no-options | manual-backed | Allow Use of 3D or 2D Look Down View In Dungeons | None | Step only | direct-id |  |  |  |
| 98 | legacy-compatible | manual-backed | Require Registration | None | Step only | direct-id |  |  |  |
| 99 | legacy-compatible | manual-backed | Get Scenario Registration | None | Step only | direct-id |  |  |  |
| 100 | step-only-no-options | manual-backed | End Battle | None | Step only | direct-id |  |  |  |
| 101 | step-only-no-options | manual-backed | Back Up Party | None | Step only | direct-id |  |  |  |
| 102 | step-only-no-options | manual-backed | Level Up Picked Characters | None | Step only | direct-id |  |  |  |
| 103 | covered-in-current-ui | source-backed | Continue/Set on Boat / Camping Status | Extra Codes ID | Mode; Status Value; Branch Mode / Behavior | Data EDCD |  |  |  |
| 104 | covered-in-current-ui | manual-backed | Disable Random Battles | 1 = Allow random battles, 0 = Disable random battles. | ID -> battle | battle |  |  |  |
| 105 | covered-in-current-ui | manual-backed | Suspend • Activate Allies | 1 = Suspend Allies, 2 = Activate Allies | ID -> direct-id | direct-id |  |  |  |
| 106 | covered-in-current-ui | manual-backed | Set Darkland / Line of Site Status | Extra Codes ID | Dark State Plus One; Stop If Already | Data EDCD |  |  |  |
| 107 | covered-in-current-ui | manual-backed | Improved Selective Battle | Extra Codes ID | Battle Low -> battle; Battle High -> battle; Sound (Optional) -> sound; String ID (Optional) -> message; Coward Macro -> extra-action-point-or-encounter | Data EDCD |  |  | Field 4 is an Extra Action Point called when the party flees/cowards out; field 2 is sound. |
| 108 | covered-in-current-ui | source-backed | Alter Picked Characters | Extra Codes ID | Alter; Amount To Increase / Decrease | Data EDCD |  |  |  |
| 109 | intentionally-preserved | manual-plus-preservation | Not Used | ID | ID -> direct-id | direct-id |  |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 110 | intentionally-preserved | manual-plus-preservation | Not Used | ID | ID -> direct-id | direct-id |  |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 111 | covered-in-current-ui | manual-backed | Return From Gosub | Not Used | ID -> direct-id | direct-id |  |  |  |
| 112 | covered-in-current-ui | manual-backed | POP The Stack | Not Used | ID -> direct-id | direct-id |  |  |  |
| 113 | intentionally-preserved | manual-plus-preservation | Not Used | ID | ID -> direct-id | direct-id |  |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 114 | intentionally-preserved | manual-plus-preservation | Not Used | ID | ID -> direct-id | direct-id |  |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 115 | intentionally-preserved | manual-plus-preservation | Not Used | ID | ID -> direct-id | direct-id |  |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 116 | intentionally-preserved | manual-plus-preservation | Not Used | ID | ID -> direct-id | direct-id |  |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 117 | intentionally-preserved | manual-plus-preservation | Not Used | ID | ID -> direct-id | direct-id |  |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 118 | intentionally-preserved | manual-plus-preservation | Not Used | ID | ID -> direct-id | direct-id |  |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 119 | covered-in-current-ui | manual-backed | Revive NPC After Combat | Not Used | ID -> direct-id | direct-id |  |  |  |
| 120 | covered-in-current-ui | source-backed | Alter NPC • Monster During Combat | Extra Codes ID | Target Type -> extra-action-point-or-encounter; NPC / Monster ID -> monster; Count; New Icon ID; New Traitor Value | Data EDCD |  |  |  |
| 121 | combat-macro-only | source-backed | De-animate Lower Undead (Monster & Battle Macros Only) | None |  | Data EDCD |  |  | Realmz source dispatches this only during combat and loads the ID as an Extra Code row; Providence keeps ordinary AP imports preserved and treats macro/combat surfaces as the intentional authoring path. |
| 122 | covered-in-current-ui | manual-backed | Cause Fumble (Monster Macro Only) | Extra Codes ID | Message -> message; Sound -- Optional -- -> sound | Data EDCD |  |  | Realmz displays extracode[0] as an optional message and plays extracode[1] as an optional sound during eligible combat fumbles. Fields 2, 3, and 4 are loaded but not consumed. |
| 123 | covered-in-current-ui | source-backed | Cause Rout (Monster & Battle Macros Only) | Extra Codes ID | Monster ID That Will Route -> monster; Monster ID That Will Route -> monster; Monster ID That Will Route -> monster; Monster ID That Will Route -> monster; Monster ID That Will Route -> monster | Data EDCD |  |  |  |
| 124 | covered-in-current-ui | manual-backed | Spawn Monster (Monster & Battle Macros Only) | Extra Codes ID | Monster ID To Spawn -> monster; Number To Spawn; Spawn Sound -> sound; Force Traiter Value | Data EDCD |  |  | Realmz treats a negative count as a random limit via Rand(abs(extracode[2])), spawns monsters from Data MD, and plays extracode[3] after placing each spawned monster when the value is nonzero. |
| 125 | covered-in-current-ui | source-backed | Destroy Related Monsters (Monster & Battle Macros Only) | Extra Codes ID | Monster ID To Destroy -> monster; Number Of Monsters To Destroy; Include Traitor Side | Data EDCD |  |  |  |
| 126 | covered-in-current-ui | source-backed | Battle Macro Criteria | Extra Action Point Code ID | Activate On; Round No. / % Chance To Activate; Activate; Macro No. -OR- Random Macro -> extra-action-point-or-encounter; Random Macro (High Range) Note -> extra-action-point-or-encounter | Data EDCD |  |  |  |
| 127 | covered-in-current-ui | manual-backed | Continue If Monster Present (Monster & Battle Macros Only) | Monster ID To Test | Monster ID To Test -> direct-id | direct-id |  |  |  |

## Special Opcode Notes

- Opcode 84: Realmz source has a legacy registration-check dispatcher case. Providence supports authoring it for old-school Realmz compatibility; modern open-source builds keep the dispatcher but comment out enforcement.
- Opcode 121: De-animate Lower Undead is useful, but source behavior is combat-gated. Ordinary Action Point imports are preserved; macro/combat authoring remains the intended surface.

## Wrath Crosscheck Note

Wrath AP 32/33 screenshot parity should be checked against the actual imported trigger selection, because the supplied Divinity and Providence screenshots appear to show neighboring Action Points rather than a guaranteed same selected row.

Use an Evidence Lab before/after fixture when a Divinity screenshot and imported Providence row disagree, so we can separate indexing drift from import/labeling bugs.

