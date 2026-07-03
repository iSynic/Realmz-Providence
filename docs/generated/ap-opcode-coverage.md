# Action Point Opcode Coverage

Generated from Providence's action catalog and the Divinity/manual opcode crosswalk.

## Summary

- authorable-now: 49
- edcd-backed-guided: 69
- ignored-empty: 1
- macro-only-context-gated: 1
- not-used-no-dispatch: 10

## Coverage

| Opcode | Status | Title | Storage | Shape | Notes |
| ---: | --- | --- | --- | --- | --- |
| -23 | edcd-backed-guided | Alter Random Rectangle Information of a Land Level | Data EDCD | random-region-mutation |  |
| -14 | authorable-now | Pick Inverse Characters | direct-id |  |  |
| 0 | ignored-empty | Empty | direct-id |  |  |
| 1 | authorable-now | Display String | message |  |  |
| 2 | edcd-backed-guided | Battle | Data EDCD | battle |  |
| 3 | edcd-backed-guided | Player Option | Data EDCD | choice |  |
| 4 | authorable-now | Simple Encounter | simple-encounter |  |  |
| 5 | authorable-now | Complex Encounter | complex-encounter |  |  |
| 6 | authorable-now | Load shop | shop |  |  |
| 7 | edcd-backed-guided | Change Action Point Codes | Data EDCD | action-data-patching |  |
| 8 | authorable-now | Same as Other Action Point | same-map-action-point |  |  |
| 9 | authorable-now | Play Sound | sound |  |  |
| 10 | authorable-now | Give Treasure | direct-id |  |  |
| 11 | authorable-now | Give Victory Points | direct-id |  |  |
| 12 | edcd-backed-guided | Change Land Tile | Data EDCD | tile-mutation |  |
| 13 | edcd-backed-guided | Enable Action Point | Data EDCD | trigger-mutation |  |
| 14 | authorable-now | Pick Characters | direct-id |  |  |
| 15 | edcd-backed-guided | Heal/Hurt Picked | Data EDCD | damage-heal |  |
| 16 | edcd-backed-guided | Heal/Hurt Party | Data EDCD | damage-heal |  |
| 17 | edcd-backed-guided | Cast Spell on Picked | Data EDCD | spell-cast |  |
| 18 | edcd-backed-guided | Cast Spell on Party | Data EDCD | spell-cast |  |
| 19 | edcd-backed-guided | Display Random String | Data EDCD | random-message |  |
| 20 | edcd-backed-guided | Teleport | Data EDCD | teleport |  |
| 21 | edcd-backed-guided | Branch on Possession of Specific Item | Data EDCD | item-branch |  |
| 22 | edcd-backed-guided | Alter Item Status | Data EDCD | item-mutation |  |
| 23 | edcd-backed-guided | Alter Random Rectangle Information of a Land Level | Data EDCD | random-region-mutation |  |
| 24 | authorable-now | Exit Action Point And Keep Codes | direct-id |  |  |
| 25 | authorable-now | Exit Action Point and Delete Action Point | direct-id |  |  |
| 26 | authorable-now | Get Click | direct-id |  |  |
| 27 | authorable-now | Display Picture | picture |  |  |
| 28 | authorable-now | Redraw Screen | direct-id |  |  |
| 29 | authorable-now | Give / Display Map | direct-id |  |  |
| 30 | edcd-backed-guided | Pick on Check Vs. Attribute / Special Abilities | Data EDCD | ability-check-pick |  |
| 31 | edcd-backed-guided | Branch on Check Vs. Attribute • Special Abilities | Data EDCD | ability-check-branch |  |
| 32 | authorable-now | Offer Temple | direct-id |  |  |
| 33 | edcd-backed-guided | Take Gold | Data EDCD | gold |  |
| 34 | authorable-now | Break Encounter Loop (Usable only within encounters) | direct-id |  |  |
| 35 | authorable-now | Eliminate Simple Encounter Option | simple-encounter |  |  |
| 36 | authorable-now | Capture • Restore Party's Equipment | direct-id |  |  |
| 37 | edcd-backed-guided | Enter • Exit Dungeon | Data EDCD | dungeon-move |  |
| 38 | edcd-backed-guided | Continue On Possession, Else Branch Within Encounters. | Data EDCD | force-branch |  |
| 39 | authorable-now | Extend Action Point Script | extra-action-point |  |  |
| 40 | edcd-backed-guided | Branch on Party Condition | Data EDCD | party-condition-branch |  |
| 41 | edcd-backed-guided | Eliminate Other Encounter Choice | Data EDCD | encounter-mutation |  |
| 42 | edcd-backed-guided | Branch on Percent Chance | Data EDCD | percent-branch |  |
| 43 | edcd-backed-guided | Give Condition | Data EDCD | condition |  |
| 44 | authorable-now | Eliminate Complex Encounter Choice | direct-id |  |  |
| 45 | edcd-backed-guided | Teleport Only | Data EDCD | teleport |  |
| 46 | edcd-backed-guided | Branch on Quest (See code 72 for more options) | Data EDCD | force-branch |  |
| 47 | authorable-now | Set • Clear Quest | direct-id |  |  |
| 48 | edcd-backed-guided | Selective Battle | Data EDCD | selective-battle |  |
| 49 | authorable-now | Offer Banking | direct-id |  |  |
| 50 | edcd-backed-guided | Pick On Race • Caste • Race Class • Caste Class • Gender | Data EDCD | race-caste-gender-selector |  |
| 51 | edcd-backed-guided | Alter Shop | Data EDCD | shop-mutation |  |
| 52 | edcd-backed-guided | Pick on Miscellaneous | Data EDCD | character-selector |  |
| 53 | edcd-backed-guided | Pick on Character Caste | Data EDCD | caste-selector |  |
| 54 | edcd-backed-guided | Alter Time Encounter | Data EDCD | timed-encounter-mutation |  |
| 55 | edcd-backed-guided | Branch on Picked | Data EDCD | picked-branch |  |
| 56 | edcd-backed-guided | Branch on Battle Outcome | Data EDCD | battle-outcome-branch |  |
| 57 | edcd-backed-guided | Change Land Tile Set | Data EDCD | render-mutation |  |
| 58 | edcd-backed-guided | Branch on Difficulty Level | Data EDCD | force-branch |  |
| 59 | edcd-backed-guided | Branch on Tile ID Check | Data EDCD | force-branch |  |
| 60 | edcd-backed-guided | Drop Party Money | Data EDCD | party-money-state |  |
| 61 | edcd-backed-guided | Shift Party X: and Y: Location | Data EDCD | position-shift |  |
| 62 | authorable-now | Display Scrolling Text | direct-id |  |  |
| 63 | edcd-backed-guided | Alter Game Time | Data EDCD | time-mutation |  |
| 64 | edcd-backed-guided | Branch on Game Time | Data EDCD | game-time-branch |  |
| 65 | edcd-backed-guided | Award Random Item(s) | Data EDCD | random-items |  |
| 66 | authorable-now | Set Camping Ability | direct-id |  |  |
| 67 | edcd-backed-guided | Branch on Item Charges | Data EDCD | item-charge-branch |  |
| 68 | edcd-backed-guided | Alter Party Fatigue | Data EDCD | fatigue |  |
| 69 | edcd-backed-guided | Set Spell Casting • Recharging Flags | Data EDCD | spell-flags |  |
| 70 | edcd-backed-guided | Save and Restory Party Postion | Data EDCD | save-restore-position |  |
| 71 | authorable-now | Disable • Enable X: Y: Display | direct-id |  |  |
| 72 | edcd-backed-guided | Branch on Range of Quests | Data EDCD | range-branch |  |
| 73 | edcd-backed-guided | Load Shop and Restrict Items Accepted | Data EDCD | restricted-shop |  |
| 74 | edcd-backed-guided | Take • Give Spell Points To Picked Characters | Data EDCD | spell-points |  |
| 75 | edcd-backed-guided | Branch on Spell Points | Data EDCD | range-branch |  |
| 76 | edcd-backed-guided | Increment • Decrement Quest Value | Data EDCD | quest-value |  |
| 77 | edcd-backed-guided | Branch on Quest Value | Data EDCD | false-true-branch |  |
| 78 | edcd-backed-guided | Branch on Tile Parameters | Data EDCD | false-true-branch |  |
| 79 | not-used-no-dispatch | Not Used | direct-id |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 80 | not-used-no-dispatch | Not Used | direct-id |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 81 | edcd-backed-guided | Branch on Character Condition | Data EDCD | condition-branch |  |
| 82 | authorable-now | Turn Cleric Turning OFF. | direct-id |  |  |
| 83 | authorable-now | Turn Cleric Turning ON. | direct-id |  |  |
| 84 | authorable-now | Legacy Registration Check | direct-id |  | Realmz source has a legacy registration-check dispatcher case. Classic Realmz could enforce scenario registration here; modern open-source builds keep the dispatcher but comment out enforcement. |
| 85 | edcd-backed-guided | Branch on Random | Data EDCD | random-branch |  |
| 86 | edcd-backed-guided | Branch on Miscellaneous | Data EDCD | misc-conditional-branch |  |
| 87 | edcd-backed-guided | Branch on Special Character (NPC) Present | Data EDCD | conditional-branch |  |
| 88 | authorable-now | Drop Special Character from Party | direct-id |  |  |
| 89 | authorable-now | Add Special Character to Party | direct-id |  |  |
| 90 | edcd-backed-guided | Take Away Victory Points | Data EDCD | party-state |  |
| 91 | authorable-now | Drop All Equipment | direct-id |  |  |
| 92 | edcd-backed-guided | Alter Size of Random Rectangle | Data EDCD | random-region-shape-mutation |  |
| 93 | authorable-now | Turn Compass On | direct-id |  |  |
| 94 | authorable-now | Turn Compass Off | direct-id |  |  |
| 95 | authorable-now | Change Look Direction | direct-id |  |  |
| 96 | authorable-now | Force Party To Use 3D View In Dungeons | direct-id |  |  |
| 97 | authorable-now | Allow Use of 3D or 2D Look Down View In Dungeons | direct-id |  |  |
| 98 | authorable-now | Require Registration | direct-id |  |  |
| 99 | authorable-now | Get Scenario Registration | direct-id |  |  |
| 100 | authorable-now | End Battle | direct-id |  |  |
| 101 | authorable-now | Back Up Party | direct-id |  |  |
| 102 | authorable-now | Level Up Picked Characters | direct-id |  |  |
| 103 | edcd-backed-guided | Continue/Set on Boat / Camping Status | Data EDCD | boat-camp-state |  |
| 104 | authorable-now | Disable Random Battles | battle |  |  |
| 105 | authorable-now | Suspend • Activate Allies | direct-id |  |  |
| 106 | edcd-backed-guided | Set Darkland / Line of Site Status | Data EDCD | dark-level-state |  |
| 107 | edcd-backed-guided | Improved Selective Battle | Data EDCD | improved-selective-battle |  |
| 108 | edcd-backed-guided | Alter Picked Characters | Data EDCD | selected-character-state |  |
| 109 | not-used-no-dispatch | Not Used | direct-id |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 110 | not-used-no-dispatch | Not Used | direct-id |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 111 | authorable-now | Return From Gosub | direct-id |  |  |
| 112 | authorable-now | POP The Stack | direct-id |  |  |
| 113 | not-used-no-dispatch | Not Used | direct-id |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 114 | not-used-no-dispatch | Not Used | direct-id |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 115 | not-used-no-dispatch | Not Used | direct-id |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 116 | not-used-no-dispatch | Not Used | direct-id |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 117 | not-used-no-dispatch | Not Used | direct-id |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 118 | not-used-no-dispatch | Not Used | direct-id |  | Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring. |
| 119 | authorable-now | Revive NPC After Combat | direct-id |  |  |
| 120 | edcd-backed-guided | Alter NPC • Monster During Combat | Data EDCD | combat-monster-mutation |  |
| 121 | macro-only-context-gated | De-animate Lower Undead (Monster & Battle Macros Only) | Data EDCD | unused-edcd-load | Realmz source dispatches this only during combat and loads the ID as an Extra Code row; Providence keeps ordinary AP imports preserved and treats macro/combat surfaces as the intentional authoring path. |
| 122 | edcd-backed-guided | Cause Fumble (Monster Macro Only) | Data EDCD | fumble |  |
| 123 | edcd-backed-guided | Cause Rout (Monster & Battle Macros Only) | Data EDCD | rout |  |
| 124 | edcd-backed-guided | Spawn Monster (Monster & Battle Macros Only) | Data EDCD | spawn |  |
| 125 | edcd-backed-guided | Destroy Related Monsters (Monster & Battle Macros Only) | Data EDCD | destroy-related |  |
| 126 | edcd-backed-guided | Battle Macro Criteria | Data EDCD | battle-macro |  |
| 127 | authorable-now | Continue If Monster Present (Monster & Battle Macros Only) | direct-id |  |  |

## Special Opcode Notes

- Opcode 84: Realmz source has a legacy registration-check dispatcher case. Providence supports authoring it for old-school Realmz compatibility; modern open-source builds keep the dispatcher but comment out enforcement.
- Opcode 121: De-animate Lower Undead is useful, but source behavior is combat-gated. Ordinary Action Point imports are preserved; macro/combat authoring remains the intended surface.

## Wrath Crosscheck Note

Wrath AP 32/33 screenshot parity should be checked against the actual imported trigger selection, because the supplied Divinity and Providence screenshots appear to show neighboring Action Points rather than a guaranteed same selected row.

Use an Evidence Lab before/after fixture when a Divinity screenshot and imported Providence row disagree, so we can separate indexing drift from import/labeling bugs.

