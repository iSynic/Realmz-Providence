# Evidence Card: Opcode / EDCD Crosswalk

## User-Facing Unlock

Providence can now compare Divinity's author-facing Action Point help against the current EDCD shape table and the Realmz runtime dispatcher. This is the working ledger for deciding whether an opcode's `ID` is a direct target, an Extra Action Point, or a `Data EDCD` parameter row.

## Summary

- Total opcodes in crosswalk: 130
- Opcodes with Divinity help: 128
- EDCD-backed opcodes: 70
- Direct Extra Action Point opcodes: 1
- Missing Providence EDCD shapes: none
- Missing Divinity help entries: -14
- Missing Realmz source anchors: none
- EDCD field-comparison gaps: none

## Crosswalk

| Opcode | Divinity Help | Divinity E-Codes | Providence Shape | Providence Fields | Realmz Source | Writer Status |
| ---: | --- | --- | --- | --- | --- | --- |
| -23 | Alter Random Rectangle Information of a Land Level | 1) Land Level ID 2) Rectangle Number To Alter 3) New X ‘s in 10,000 (0 = No Encounters, -1 = Set Invisible Encounter) 4) New Battle Range Low (-1 = No Change) 5) New Battle Rang... | random-region-mutation | level, randomRegion, percent, battleLowOrKeep, battleHighOrKeep | F:\Realmz\src\realmz_orig\newland.c:2302 | writer-ready-data-edcd |
| -14 | Pick Inverse Characters | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1923 | writer-gated-direct-target-family |
| 0 | Empty | None | none | none |  | writer-gated-direct-target-family |
| 1 | Display String | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1430 | writer-gated-direct-target-family |
| 2 | Battle | 1) Battle Number: Low Battle Number for Range Battle 2) High Battle Number for Range Battle 3) Sound to play before battle. (Optional) X-AP on Revived Losses. 4) String to displ... | battle | battleLow, battleHigh, soundOrReviveLossMacro, message, revivePartyFlag | F:\Realmz\src\realmz_orig\newland.c:1444 | writer-ready-data-edcd |
| 3 | Player Option | 1) 1 = Yes: Continue 0 = No: Continue 2) 0 = Back Up, 1 = X-AP, 2 = Within Simple, 3 = Within Complex, 4 = Eliminate 3) X-AP/Branch No. Of Encounter (0-3) 4) Prompt, left side (... | choice | replyPolarity, branchMode, branchTarget, promptA, promptB | F:\Realmz\src\realmz_orig\newland.c:1527 | writer-ready-data-edcd |
| 4 | Simple Encounter | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1569 | writer-gated-direct-target-family |
| 5 | Complex Encounter | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1631 | writer-gated-direct-target-family |
| 6 | Load shop | None Script Tip: If you edit the shop to have an inflation rate of 0%, the shop will act as a storage facility. It will allow the party to store any item there and to later retr... | none | none | F:\Realmz\src\realmz_orig\newland.c:1699 | writer-gated-direct-target-family |
| 7 | Change Action Point Codes | 1) Land ID of Action Point codes to change. -2 = Replace Simple Encounter Script, -3 = Replace Complex Encounter Script 2) AP / Simple Enc ID / Complex Enc ID To Modify 3) Extra... | action-data-patching | levelOrCache, targetRecord, macro, levelKind, resultSlot | F:\Realmz\src\realmz_orig\newland.c:1729 | writer-ready-data-edcd |
| 8 | Same as Other Action Point | 1) Land ID of which Action Point codes you want to use. 2) Action Point No. to use. Script Tip: This is more useful if you have many Action Points that all do the same thing but... | none | none | F:\Realmz\src\realmz_orig\newland.c:1810 | writer-ready-map-action-point-copy |
| 9 | Play Sound | None Script Tip: To keep several sounds from running together you need to put in the ID as a negative. That way you can play several sounds end to end. Otherwise they will all p... | none | none | F:\Realmz\src\realmz_orig\newland.c:1822 | writer-gated-direct-target-family |
| 10 | Give Treasure | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1826 | writer-gated-direct-target-family |
| 11 | Give Victory Points | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1839 | writer-gated-direct-target-family |
| 12 | Change Land Tile | 1) Land/Dungeon level of tile to change 2) X-Coordinate 3) Y-Coordinate 4) New Tile ID 5) 0 = Land Level, 1 = Dungeons | tile-mutation | level, xOrDungeonY, yOrDungeonX, tileValue, isDungeon | F:\Realmz\src\realmz_orig\newland.c:1849 | writer-ready-data-edcd |
| 13 | Enable Action Point | 1) Land/Dungeon Level 2) Action Point Number 3) New % (Negative value = Disabled) 4) Action Point No. Low (Negative = Dungeon, Positive = Land) 5) Action Point No. High (Negativ... | trigger-mutation | level, singleTrigger, percent, rangeStartWithSign, rangeEnd | F:\Realmz\src\realmz_orig\newland.c:1874 | writer-ready-data-edcd |
| 14 | Pick Characters | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1915 | writer-gated-direct-target-family |
| 15 | Heal/Hurt Picked | 1) Multiplier ( - Is Hurt ) 2) Low Range 3) High Range 4) Sound ---Optional--- 5) Message ---Optional--- | damage-heal | multiplier, low, high, sound, message | F:\Realmz\src\realmz_orig\newland.c:1934 | writer-ready-data-edcd |
| 16 | Heal/Hurt Party | 1) Multiplier ( - Is Hurt ) 2) Low Range 3) High Range 4) Sound ---Optional--- 5) Message ---Optional--- | damage-heal | multiplier, low, high, sound, message | F:\Realmz\src\realmz_orig\newland.c:1947 | writer-ready-data-edcd |
| 17 | Cast Spell on Picked | 1) Spell No. to Cast 2) Power Level 3) +/- % To DRVs Modifier 4) 1 = No chance for PCs to DRVs. | spell-cast | spell, powerLevel, saveAdjust, forceAffect, unused | F:\Realmz\src\realmz_orig\newland.c:1963 | writer-ready-data-edcd |
| 18 | Cast Spell on Party | 1) Spell No. to Cast 2) Power Level 3) +/- % To DRVs Modifier 4) 1 = No chance for PCs to DRVs. | spell-cast | spell, powerLevel, saveAdjust, forceAffect, unused | F:\Realmz\src\realmz_orig\newland.c:1988 | writer-ready-data-edcd |
| 19 | Display Random String | 1) Low String Range Number 2) High String Range Number | random-message | messageLow, messageHigh, unused, unused, unused | F:\Realmz\src\realmz_orig\newland.c:1998 | writer-ready-data-edcd |
| 20 | Teleport | 1) Land ID to Teleport To (-1 = No Change) 2) X-Coordinate (-1 = No Change) 3) Y-Coordinate (-1 = No Change) 4) Sound ---Optional--- 5) Message ---Optional--- Script Tip : At fi... | teleport | levelOrKeep, xOrKeep, yOrKeep, sound, message | F:\Realmz\src\realmz_orig\newland.c:2013 | writer-ready-data-edcd |
| 21 | Branch on Possession of Specific Item | 1) Item ID To Check For 2) If Possessed, Branch To: 0 = X-AP, 1 = Simple Encounter, 2 = Complex Encounter 3) If Not Possessed, 0 = Branch as by Item 5, 1 = Continue Codes 2 = St... | item-branch | item, branchMode, missingBehavior, hasTarget, missingTarget | F:\Realmz\src\realmz_orig\newland.c:2059 | writer-ready-data-edcd |
| 22 | Alter Item Status | 1) Item ID To Alter 2) Number of Items to Affect. 3) To Do: 1 = Drop, 2 = Charge, 3 = Change Item to Item ID 4) Charges To Add (- = Drain Charges) 5) New Item ID | item-mutation | item, maxMatches, mode, chargeDelta, replacementItem | F:\Realmz\src\realmz_orig\newland.c:3679 | writer-ready-data-edcd |
| 23 | Alter Random Rectangle Information of a Land Level | 1) Land Level ID 2) Rectangle Number To Alter 3) New X ‘s in 10,000 (0 = No Encounters, -1 = Set Invisible Encounter) 4) New Battle Range Low (-1 = No Change) 5) New Battle Rang... | random-region-mutation | level, randomRegion, percent, battleLowOrKeep, battleHighOrKeep | F:\Realmz\src\realmz_orig\newland.c:2271 | writer-ready-data-edcd |
| 24 | Exit Action Point And Keep Codes | None Script Tip: Code 24 is very common as the last code in an Action Point script. If you wish a specific Action Point to stick around for the entire game, then you need to put... | none | none | F:\Realmz\src\realmz_orig\newland.c:2332 | writer-gated-direct-target-family |
| 25 | Exit Action Point and Delete Action Point | None | none | none | F:\Realmz\src\realmz_orig\newland.c:2337 | writer-gated-direct-target-family |
| 26 | Get Click | None | none | none | F:\Realmz\src\realmz_orig\newland.c:2348 | writer-gated-direct-target-family |
| 27 | Display Picture | None | none | none | F:\Realmz\src\realmz_orig\newland.c:2352 | writer-gated-direct-target-family |
| 28 | Redraw Screen | None | none | none | F:\Realmz\src\realmz_orig\newland.c:2379 | writer-gated-direct-target-family |
| 29 | Give / Display Map | None | none | none | F:\Realmz\src\realmz_orig\newland.c:2399 | writer-gated-direct-target-family |
| 30 | Pick on Check Vs. Attribute / Special Abilities | 1) What Attribute / Special Ability To Check (Negative = Set on Fail) 2) +/- Modifer (Negative values hurt success odds) 3) Who to check: 0 = Picked, 1 = Everyone, 2 = Alive 4)... | ability-check-pick | signedAbilityOrAttribute, adjustment, sourceSet, attributeFlag, unused | F:\Realmz\src\realmz_orig\newland.c:2421 | writer-ready-data-edcd |
| 31 | Branch on Check Vs. Attribute • Special Abilities | 1) What Attribute / Special Ability To Check (Negative = Set on Fail) 2) +/- Modifer (Negative values hurt success odds) 3) 0 = Check Special Ability, 1 = Check Attribute 4) Bra... | ability-check-branch | abilityOrAttribute, adjustment, attributeFlag, successMacro, failureMacro | F:\Realmz\src\realmz_orig\newland.c:2487 | writer-ready-data-edcd |
| 32 | Offer Temple | None | none | none | F:\Realmz\src\realmz_orig\newland.c:2556 | writer-gated-direct-target-family |
| 33 | Take Gold | 1) How Much Gold, Negative Value = Take Gems Instead 2) 0 = Cont If Poss, 1 = Cont If Not Poss, 2 = Force Branch, -1 = Goto Last Code If Not Poss 3) 0 = X-AP, 1 = Within Simple,... | gold | signedAmount, failureMarker, unused, unused, unused | F:\Realmz\src\realmz_orig\newland.c:2566 | writer-ready-data-edcd |
| 34 | Break Encounter Loop (Usable only within encounters) | None | none | none | F:\Realmz\src\realmz_orig\newland.c:2577 | writer-gated-direct-target-family |
| 35 | Eliminate Simple Encounter Option | None | none | none | F:\Realmz\src\realmz_orig\newland.c:2584 | writer-gated-direct-target-family |
| 36 | Capture • Restore Party's Equipment | None Note: All the equipment is restored to the party exactly as it was when it was captured. Any equipment the party has obtained between the time it was captured and then rest... | none | none | F:\Realmz\src\realmz_orig\newland.c:2591 | writer-gated-direct-target-family |
| 37 | Enter • Exit Dungeon | 1) 0 = Goto Dungeon, 1 = Goto Land 2) Dungeon / Land level to goto 3) X-Coord 4) y-Coord 5) Starting Heading: 1 = North, 2 = East, 3 = South, 4 = West. A negative heading value... | dungeon-move | mode, level, x, y, signedHeading | F:\Realmz\src\realmz_orig\newland.c:2655 | writer-ready-data-edcd |
| 38 | Continue On Possession, Else Branch Within Encounters. | 1) Item ID to check for. 2) 0 = Cont On Poss, 1 = Cont not Poss 3) 0 = X-AP, 1 = Within simple, 2 = Within complex 4) X-AP/Branch No. (0-3 if within encounter) 5) Code No. (0 =... | force-branch | testA, testB, branchMode, target, slot | F:\Realmz\src\realmz_orig\newland.c:2696 | writer-ready-data-edcd |
| 39 | Extend Action Point Script | None Code 40 Branch on Party Condition ID Extra Codes ID Use: Allows you to branch to a different Extra Action Point depending on the existence of specific party conditions brou... | none | none | F:\Realmz\src\realmz_orig\newland.c:2738 | writer-ready-data-ed3-direct |
| 40 | Branch on Party Condition | 1) 1 = Branch if condition exists, else continue script. 2 = Branch if condition does not exsist, else continue script. 2) Type of Branch: 0 = No Branch, 1 = X-AP, 2 = Simple En... | party-condition-branch | expectedState, branchMode, branchTarget, condition, unused | F:\Realmz\src\realmz_orig\newland.c:2745 | writer-ready-data-edcd |
| 41 | Eliminate Other Encounter Choice | 1) Simple Encounter No. 2) Choice No. To Eliminate (1-4) | encounter-mutation | simpleEncounter, oneBasedChoiceSlot, unused, unused, unused | F:\Realmz\src\realmz_orig\newland.c:2786 | writer-ready-data-edcd |
| 42 | Branch on Percent Chance | 1) Percent Chance of Doing Item #2, Else Continue Codes 2) 1 = Branch, 2 = Exit & Save Codes, -2 = Exit & Erase Codes 3) 0 = X-AP, 1 = Within Simple, 2 = Within Complex 4) X-AP/... | percent-branch | percent, successBehavior, branchMode, target, slot | F:\Realmz\src\realmz_orig\newland.c:2801 | writer-ready-data-edcd |
| 43 | Give Condition | 1) Affect Who: 0 = Party, 1 = Picked, 2 = Alive 2) Condition Number As Shown On Code Page 3) Duration/Magnitude (Negative Values Are Permanent) 4) Sound ---Optional--- | condition | scope, condition, durationOrDelta, sound, unused | F:\Realmz\src\realmz_orig\newland.c:2831 | writer-ready-data-edcd |
| 44 | Eliminate Complex Encounter Choice | None | none | none | F:\Realmz\src\realmz_orig\newland.c:2828 | writer-gated-direct-target-family |
| 45 | Teleport Only | 1) Land Level ID (-1 = No Change) 2) X-Coord (-1 = No Change) 3) Y-Coord (-1 = No Change) 4) Sound ---Optional--- Note: A value of -1 in E-Code 1, 2 or 3 will tell the game NOT... | teleport | levelOrKeep, xOrKeep, yOrKeep, sound, message | F:\Realmz\src\realmz_orig\newland.c:2869 | writer-ready-data-edcd |
| 46 | Branch on Quest (See code 72 for more options) | 1) Quest ID To Branch On.. 2) 0 = Continue On Quest Set, 1 = Continue If Not Set 3) 0 = X-AP, 1 = Within simple, 2 = Within complex 4) X-AP/Branch No. (0-3) 5) Code No. (0 = Top... | force-branch | testA, testB, branchMode, target, slot | F:\Realmz\src\realmz_orig\newland.c:2875 | writer-ready-data-edcd |
| 47 | Set • Clear Quest | None | none | none | F:\Realmz\src\realmz_orig\newland.c:3064 | writer-gated-direct-target-family |
| 48 | Selective Battle | 1) Low Range of Battle ID 2) High Range of Battle ID 3) Sound ---Optional--- 4) Message ---Optional--- 5) Treasure On Victory | selective-battle | battleLow, battleHigh, sound, message, treasure | F:\Realmz\src\realmz_orig\newland.c:3069 | writer-ready-data-edcd |
| 49 | Offer Banking | None | none | none | F:\Realmz\src\realmz_orig\newland.c:3127 | writer-gated-direct-target-family |
| 50 | Pick On Race • Caste • Race Class • Caste Class • Gender | 1) Type: 0 = Race Check, 1 = Gender Check, 2 = Caste Check, 3 = Race Class Check, 4 = Caste Class Check 2) Gender to Pick: 1 = Male, 2 = Female 3) Race/Race Class/Caste/Caste Cl... | race-caste-gender-selector | selector, gender, raceCasteOrClass, unused, livingOnly | F:\Realmz\src\realmz_orig\newland.c:3137 | writer-ready-data-edcd |
| 51 | Alter Shop | 1) Shop ID To Alter 2) Alter Inflation Rate: +/- Percent 3) Item ID To Add/Reduce 4) Number To Add/Reduce (Negative Value = reduce). | shop-mutation | shop, inflationDelta, item, stockDelta, unused | F:\Realmz\src\realmz_orig\newland.c:3174 | writer-ready-data-edcd |
| 52 | Pick on Miscellaneous | 1) Type Of Check, 0 = Move, 1 = Position, 2 = Item Poss, 3 = % Chance, 4 = Save Vs Attr, 5 = Save Vs Spell Type 2) < Move, < Pos, Item ID, % Chance, Attr No., Spell Type No. 3)... | character-selector | selector, value, sourceSet, unused, unused | F:\Realmz\src\realmz_orig\newland.c:3192 | writer-ready-data-edcd |
| 53 | Pick on Character Caste | 1) Specific Caste Only: See Key Codes 2) Caste Types: 1=Fighter Types, 2=Magical Types, 3=Monk/Rogue 3) Check: 0 = All, 1=Alive Only, 2=Check Picked Only | caste-selector | exactCaste, casteGroup, sourceSet, unused, unused | F:\Realmz\src\realmz_orig\newland.c:3254 | writer-ready-data-edcd |
| 54 | Alter Time Encounter | 1) Time Encounter ID 2) New % Chance Of Activation (-1 = No Change) 3) New Day Increment (-1 = No Change) 4) 1 = Reset to current date 5) Days to add to next activation (-1 = No... | timed-encounter-mutation | timedEncounter, percentOrKeep, incrementOrKeep, resetDayFlag, dayOffsetOrKeep | F:\Realmz\src\realmz_orig\newland.c:3289 | writer-ready-data-edcd |
| 55 | Branch on Picked | 1) Success on: 0 = Any PC is picked, 1-6 = Specific is Picked, (-X) = X Number Picked or more. 2) Type of Branch: 0 = Exit Codes on Fail, 1 = Branch to X-AP on Fail, 2 = String... | picked-branch | pickedSelector, failureBehavior, unused, successMacro, failureTarget | F:\Realmz\src\realmz_orig\newland.c:3306 | writer-ready-data-edcd |
| 56 | Branch on Battle Outcome | 1) Battle Number: Low Battle Number for Range Battle 2) High Battle Number for Range Battle 3) If defeated branch to X-AP, Else -1 = Backstep One 4) Sound. (Optional) 5) String... | battle-outcome-branch | battleLow, battleHigh, cowardMacro, sound, message | F:\Realmz\src\realmz_orig\newland.c:3382 | writer-ready-data-edcd |
| 57 | Change Land Tile Set | 1) 0 = Plains, 3 = Subteranean, 4 = Castle, 5 = Desert, 9 = Swamp, 10 = Snow (When it's done) 2) 0 = Make level Daytime, 1 = Make level Dark 3) Land level to alter. Because the... | render-mutation | landlook, isDark, targetLandLevel, unused, unused | F:\Realmz\src\realmz_orig\newland.c:3453 | writer-ready-data-edcd |
| 58 | Branch on Difficulty Level | 1) Perform if Difficulty is X or Harder: (1 Easy, 2, 3, 4, 5 Hard) If Difficulty is X or Harder, Perfrom Item 2 2) 1 = Branch, 2 = Exit Codes & Save Codes, -2 = Exit Codes & Era... | force-branch | testA, testB, branchMode, target, slot | F:\Realmz\src\realmz_orig\newland.c:2815 | writer-ready-data-edcd |
| 59 | Branch on Tile ID Check | 1) Tile ID To Check For. If Party Is On Tile ID Perform Item 2 2) 1 = Branch, 2 = Exit Codes & Save Codes, -2 = Exit Codes & Erase Codes 3) 0 = X-AP, 1 = Within Simple, 2 = With... | force-branch | testA, testB, branchMode, target, slot | F:\Realmz\src\realmz_orig\newland.c:3564 | writer-ready-data-edcd |
| 60 | Drop Party Money | 1) Type To Take 1 = Gold, 2 = Gem, 3 = Jewelry 2) Take from: 0 = ALL, 1 = Picked | party-money-state | moneyType, pickedOnly, unused, unused, unused | F:\Realmz\src\realmz_orig\newland.c:3590 | writer-ready-data-edcd |
| 61 | Shift Party X: and Y: Location | 1) Not Used 2) Shift X Amount +/- Number of Steps 3) Shift Y Amount +/- Number of Steps 4) 0 = Move Exact Distance, 1 = Random amount from 1 to Values | position-shift | legacyLevel, xShift, yShift, randomize, unused | F:\Realmz\src\realmz_orig\newland.c:3619 | writer-ready-data-edcd |
| 62 | Display Scrolling Text | None Text ID: To add this text to your scenario files you need to use a resource editor such as ResEdit. Create a resource of type "TEXT" with an ID from -200 to -300. Then ente... | none | none | F:\Realmz\src\realmz_orig\newland.c:3603 | writer-gated-direct-target-family |
| 63 | Alter Game Time | 1) 1 = Set Absolute Time, 2 = Offset Game Time 2) Days 3) Hours 4) Minutes E-Code 1 Notes: Set Absolute Time will just change the current game time to the Days, Hours and Minute... | time-mutation | mode, dayOrDelta, hourOrDelta, minuteOrDelta, unused | F:\Realmz\src\realmz_orig\newland.c:3487 | writer-ready-data-edcd |
| 64 | Branch on Game Time | 1) Test Time: Day (-1 = Skips Test For Day) 2) Test Time: Hour (-1 = Skips Test For Hour) 3) ---------------------------- 4) X-AP To Branch To If Before or Equal To Test Time. 5... | game-time-branch | dayLimit, hourLimit, unused, successMacro, failureMacro | F:\Realmz\src\realmz_orig\newland.c:3514 | writer-ready-data-edcd |
| 65 | Award Random Item(s) | 1) Number of Items to Award: X items Negative X Value = Random Number from 1 to X 2) Low ID of Random Items 3) High ID of Random Items | random-items | countOrRandomLimit, itemLow, itemHigh, unused, unused | F:\Realmz\src\realmz_orig\newland.c:3542 | writer-ready-data-edcd |
| 66 | Set Camping Ability | None Example: If a script has Code 66 Id 1 The party will no longer be able to camp. You can turn camping back on with: Code 66 Id 0 | none | none | F:\Realmz\src\realmz_orig\newland.c:2383 | writer-gated-direct-target-family |
| 67 | Branch on Item Charges | 1) Item ID To Check For 2) If Enough Charges, Branch To: 0 = X-AP, 1 = Simple, 2 = Complex 3) Number Of Charges Needed To Meet Requirement 4) X-AP/Encounter No. if charge requir... | item-charge-branch | item, branchMode, minimumCharges, successTarget, failureTarget | F:\Realmz\src\realmz_orig\newland.c:2119 | writer-ready-data-edcd |
| 68 | Alter Party Fatigue | 1) 1 = Set Fatigue to 100%, 2 = Set Fatigue to 0%, 3 = Calculate New Fatigue 2) Calculated Fatigue Value: New Fatigue = Current Fatigue x 1-100% | fatigue | mode, unused, percent, unused, unused | F:\Realmz\src\realmz_orig\newland.c:2174 | writer-ready-data-edcd |
| 69 | Set Spell Casting • Recharging Flags | 1) 0 = Turn Character Spell Casting ON, 1 = Turn Character Spell Casting Off 2) 0 = Turn Monster & NPC Spell Casting ON, 1 = Turn Monster & NPC Spell Casting Off 3) 0 = Turn Spe... | spell-flags | spellcasting, monstercasting, spellcharging, unused, unused | F:\Realmz\src\realmz_orig\newland.c:2199 | writer-ready-data-edcd |
| 70 | Save and Restory Party Postion | 1) 1 = Save Current Postion. 2 = Send Party To Last Saved Position. | save-restore-position | mode, unused, unused, unused, unused | F:\Realmz\src\realmz_orig\newland.c:2213 | writer-ready-data-edcd |
| 71 | Disable • Enable X: Y: Display | None | none | none | F:\Realmz\src\realmz_orig\newland.c:2206 | writer-gated-direct-target-family |
| 72 | Branch on Range of Quests | 1) Low Quest ID Range to Check 2) High Quest ID Range to Check 3) REMARK: This will branch as dictated by #4 if all quests are set. Else script continues. 4) Branch To: 0= X-AP,... | range-branch | testA, testB, falseBehavior, branchMode, target | F:\Realmz\src\realmz_orig\newland.c:2895 | writer-ready-data-edcd |
| 73 | Load Shop and Restrict Items Accepted | 1) Shop ID (-ID = Go Directly To Shop) 2) Low Items ID To Accept #1 3) High Items ID To Accept #1 4) Low Items ID To Accept #2 5) High Items ID To Accept #2 Example: If you want... | restricted-shop | shop, range1Low, range1High, range2Low, range2High | F:\Realmz\src\realmz_orig\newland.c:2934 | writer-ready-data-edcd |
| 74 | Take • Give Spell Points To Picked Characters | 1) Multiplyer: Formula = Multiplyer x Random(Range) 2) Low Range Of Spell Points To Take • Give 3) High Range Of Spell Points To Take • Give Note: Only characters capable of act... | spell-points | signedRollCount, lowOrSound, high, playSound, message | F:\Realmz\src\realmz_orig\newland.c:2978 | writer-ready-data-edcd |
| 75 | Branch on Spell Points | 1) Who To Test: 1 = Picked Characters, 2 = All Alive Characters 2) Amount 0f Spell Points Required For Branch: 3) 0 = Continue Script On Fail, 1 = Exit & Save Codes 0n Fail 4) O... | range-branch | testA, testB, falseBehavior, branchMode, target | F:\Realmz\src\realmz_orig\newland.c:3007 | writer-ready-data-edcd |
| 76 | Increment • Decrement Quest Value | 1) Which Quest Flag To Increment • Decrement 2) Amount to add: +/- 127. Valid value of Quest is -127 through +127. You can't decrease it to less than -127 or increase it to more... | quest-value | quest, delta, branchMode, threshold, target | F:\Realmz\src\realmz_orig\newland.c:125 | writer-ready-data-edcd |
| 77 | Branch on Quest Value | 1) Quest Flag To Test (1 through 100) 2) Test Value: 3) Type of Branch: 0 = X-AP, 1 = Simple Encounter, 2 = Complex Encounter 4) X-AP/ Encounter ID: If Quest Is Less Than Test V... | false-true-branch | testA, testB, branchMode, falseTarget, trueTarget | F:\Realmz\src\realmz_orig\newland.c:166 | writer-ready-data-edcd |
| 78 | Branch on Tile Parameters | 1) Attribute To Test For: 1 = Shoreline, 2 = Is/Needs Boat, 3 = Path, 4 = Blocks LOS, 5 = Need Fly/Float 6 = Special Type (Forests), 7 = Tile ID 2) Use Only For Type 7 Test: Til... | false-true-branch | testA, testB, branchMode, falseTarget, trueTarget | F:\Realmz\src\realmz_orig\newland.c:203 | writer-ready-data-edcd |
| 79 | Not Used | None | none | none |  | writer-gated-not-used |
| 80 | Not Used | None | none | none |  | writer-gated-not-used |
| 81 | Branch on Character Condition | 1) What Condition To Test 2) 0 = Check whole party, -1 = Check Picked, 1-6 Check character by position (1 = Top Character) 3) String ID to Display on Fail. Will then Exit Withou... | condition-branch | condition, characterSelector, unused, trueMacro, falseMacro | F:\Realmz\src\realmz_orig\newland.c:1390 | writer-ready-data-edcd |
| 82 | Turn Cleric Turning OFF. | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1381 | writer-gated-direct-target-family |
| 83 | Turn Cleric Turning ON. | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1374 | writer-gated-direct-target-family |
| 84 | Not Used | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1361 | writer-gated-direct-target-family |
| 85 | Branch on Random | 1) Type:0 = X-AP, 1 = Simple, 2 = Complex 2) Low Range Value. 3) High Range Value. 4) Sound --- Optional --- 5) Message --- Optional --- | random-branch | branchMode, rangeLow, rangeHigh, sound, message | F:\Realmz\src\realmz_orig\newland.c:1329 | writer-ready-data-edcd |
| 86 | Branch on Miscellaneous | 1) Test: 0 = Caste Present, 1 = Race Present, 2 = Gender Present 3 = In Boat, 4 = Camping, 5 = Caste Class Present, 6 = Race Class Present, 7 = Total Party Levels, 8 = Picked Ch... | misc-conditional-branch | testSelector, signedTestValue, branchMode, trueTarget, falseTarget | F:\Realmz\src\realmz_orig\newland.c:1197 | writer-ready-data-edcd |
| 87 | Branch on Special Character (NPC) Present | 1) Monster number to check for. 2) If Present, Branch To: 0 = X-AP, 1 = Simple Encounter, 2 = Complex Encounter 3) If Not Present, 0 = Branch as in Item 2, 1 = Continue Codes 2... | conditional-branch | testSelector, branchModeOrValue, falseBehavior, trueTarget, falseTarget | F:\Realmz\src\realmz_orig\newland.c:1128 | writer-ready-data-edcd |
| 88 | Drop Special Character from Party | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1108 | writer-gated-direct-target-family |
| 89 | Add Special Character to Party | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1050 | writer-gated-direct-target-family |
| 90 | Take Away Victory Points | 1) How Much To Take 2) 0 = Each, 1 = Picked, 2 = Spread Around | party-state | amount, scope, unused, unused, unused | F:\Realmz\src\realmz_orig\newland.c:1027 | writer-ready-data-edcd |
| 91 | Drop All Equipment | None | none | none | F:\Realmz\src\realmz_orig\newland.c:1013 | writer-gated-direct-target-family |
| 92 | Alter Size of Random Rectangle | 1) Land/Dungeon Level Of Rectangle 2) Rectangle Number 3) 0 = On Land, 1 = In a Dungeon 4) +/- to Encounter %, Base 10,000 5) -1 = No Change, 0 = Set Coordinates, 1 = Offset Rec... | random-region-shape-mutation | level, rect, isDungeon, percentDelta, shapeMode | F:\Realmz\src\realmz_orig\newland.c:942 | writer-ready-data-edcd |
| 93 | Turn Compass On | None | none | none | F:\Realmz\src\realmz_orig\newland.c:934 | writer-gated-direct-target-family |
| 94 | Turn Compass Off | None | none | none | F:\Realmz\src\realmz_orig\newland.c:923 | writer-gated-direct-target-family |
| 95 | Change Look Direction | None | none | none | F:\Realmz\src\realmz_orig\newland.c:912 | writer-gated-direct-target-family |
| 96 | Force Party To Use 3D View In Dungeons | None | none | none | F:\Realmz\src\realmz_orig\newland.c:896 | writer-gated-direct-target-family |
| 97 | Allow Use of 3D or 2D Look Down View In Dungeons | None | none | none | F:\Realmz\src\realmz_orig\newland.c:885 | writer-gated-direct-target-family |
| 98 | Require Registration | None | none | none | F:\Realmz\src\realmz_orig\newland.c:870 | writer-gated-direct-target-family |
| 99 | Get Scenario Registration | None | none | none | F:\Realmz\src\realmz_orig\newland.c:841 | writer-gated-direct-target-family |
| 100 | End Battle | None | none | none | F:\Realmz\src\realmz_orig\newland.c:764 | writer-gated-direct-target-family |
| 101 | Back Up Party | None | none | none | F:\Realmz\src\realmz_orig\newland.c:774 | writer-gated-direct-target-family |
| 102 | Level Up Picked Characters | None | none | none | F:\Realmz\src\realmz_orig\newland.c:784 | writer-gated-direct-target-family |
| 103 | Continue/Set on Boat / Camping Status | 1) 1 = Continue codes if in boat, 2 = Continue if NOT in boat. 2) 1 = Continue codes if camping, 2 = Continue if NOT camping. 3) 1 = Set boat status to IN BOAT, 2 = Set boat sta... | boat-camp-state | mode, statusValue, branchModeOrBehavior, targetOrValueA, targetOrValueB | F:\Realmz\src\realmz_orig\newland.c:802 | writer-ready-data-edcd |
| 104 | Disable Random Battles | None | none | none | F:\Realmz\src\realmz_orig\newland.c:823 | writer-gated-direct-target-family |
| 105 | Suspend • Activate Allies | None | none | none | F:\Realmz\src\realmz_orig\newland.c:827 | writer-gated-direct-target-family |
| 106 | Set Darkland / Line of Site Status | 1) 1 = Make Current Land Level Light, 2 = Make Current Land Level Dark 2) 1 = Skip remainder of Action Point if no light change needed. 3) 1 = Current Land Level Uses Line Of Si... | dark-level-state | darkStatePlusOne, stopIfAlready, unused, unused, unused | F:\Realmz\src\realmz_orig\newland.c:828 | writer-ready-data-edcd |
| 107 | Improved Selective Battle | 1) Battle ID -OR- Low Range of Random Battle 2) High Range of Random Battle. ---Optional--- 3) Sound (Optional) 4) String ID (Optional) 5) X-AP to branch to on failure to achive... | improved-selective-battle | battleLow, battleHigh, sound, message, cowardMacro | F:\Realmz\src\realmz_orig\newland.c:705 | writer-ready-data-edcd |
| 108 | Alter Picked Characters | 1) Alter: 1 = Melee Attacks, 2 = Spells Attacks, 3 = Movement, 4 = Damage, 5 = SPs, 6 = Hand2Hand, 7 = Stamina, 8 = AR, 9 = ToHit, 10 = ProJo ToHit, 11 = Magic Resistance, 12 =... | selected-character-state | statSelector, delta, unused, unused, unused | F:\Realmz\src\realmz_orig\newland.c:622 | writer-ready-data-edcd |
| 109 | Not Used | None | none | none |  | writer-gated-not-used |
| 110 | Not Used | None | none | none |  | writer-gated-not-used |
| 111 | Return From Gosub | Not Used | none | none | F:\Realmz\src\realmz_orig\newland.c:110 | writer-gated-direct-target-family |
| 112 | POP The Stack | Not Used | none | none | F:\Realmz\src\realmz_orig\newland.c:118 | writer-gated-direct-target-family |
| 113 | Not Used | None | none | none |  | writer-gated-not-used |
| 114 | Not Used | None | none | none |  | writer-gated-not-used |
| 115 | Not Used | None | none | none |  | writer-gated-not-used |
| 116 | Not Used | None | none | none |  | writer-gated-not-used |
| 117 | Not Used | None | none | none |  | writer-gated-not-used |
| 118 | Not Used | None | none | none |  | writer-gated-not-used |
| 119 | Revive NPC After Combat | Not Used | none | none | F:\Realmz\src\realmz_orig\newland.c:292 | writer-gated-direct-target-family |
| 120 | Alter NPC • Monster During Combat | 1) 1 = Alter NPC, 2 = Alter Monster 2) ID of NPC or Monster to Alter 3) How Many To Alter: 1 to 99 (Default is 1) 4) New Icon ID (-1 = No Change) 5) New Traitor Value (-1 = No C... | combat-monster-mutation | targetClass, monsterId, count, replacementIcon, traitorOverride | F:\Realmz\src\realmz_orig\newland.c:311 | writer-ready-data-edcd |
| 121 | De-animate Lower Undead (Monster & Battle Macros Only) | None Script Tip: A good use for this is to destroy all vampire rats when the main vampire is killed or some other such use. | unused-edcd-load | unused0, unused1, unused2, unused3, unused4 | F:\Realmz\src\realmz_orig\newland.c:341 | writer-ready-data-edcd |
| 122 | Cause Fumble (Monster Macro Only) | 1) Message to Display on Fumble --Optional-- 2) Sound -- Optional -- | fumble | message, sound, unused, unused, unused | F:\Realmz\src\realmz_orig\newland.c:351 | writer-ready-data-edcd |
| 123 | Cause Rout (Monster & Battle Macros Only) | 1) Monster ID that will route 2) Monster ID that will route 3) Monster ID that will route 4) Monster ID that will route 5) Monster ID that will route | rout | monster1, monster2, monster3, monster4, monster5 | F:\Realmz\src\realmz_orig\newland.c:405 | writer-ready-data-edcd |
| 124 | Spawn Monster (Monster & Battle Macros Only) | 1) Type: 0 = Spawn Individual Monsters. 2) Monster ID To Spawn 3) Number To Spawn (Neg = Random 1 to X) 4) Spawn Sound 5) Force Traiter Value: 0 = Default, 1-127 = Force Traiter... | spawn | unused, monster, countOrRandomLimit, sound, traitorOverride | F:\Realmz\src\realmz_orig\newland.c:423 | writer-ready-data-edcd |
| 125 | Destroy Related Monsters (Monster & Battle Macros Only) | 1) Monster ID to Destroy. 2) Number of monsters to destroy (0 = ALL) 3) ------------------- 4) ------------------- 5) 1 = Force Kill Even If Allied To Party NOTE: Item 5. If a m... | destroy-related | monsterId, maxCount, unused, unused, includeTraitorSide | F:\Realmz\src\realmz_orig\newland.c:567 | writer-ready-data-edcd |
| 126 | Battle Macro Criteria | 1) Activate on: 0 = After Round No. X, 1 = % Chance/ Per Round, 2 = Flee/Fail 2) Round No. / % Chance to Activate 3) Activate: 0 = Single Time, 1 = Check Each Round, 2 = Branch... | battle-macro | mode, roundOrPercent, repeatMode, macroLow, macroHigh | F:\Realmz\src\realmz_orig\newland.c:585 | writer-ready-data-edcd |
| 127 | Continue If Monster Present (Monster & Battle Macros Only) | None | none | none | F:\Realmz\src\realmz_orig\newland.c:607 | writer-gated-direct-target-family |

## Gaps To Chase

- Missing Providence EDCD shape: none.
- Missing Divinity help: -14.
- Missing Realmz source anchor: none.
- EDCD field-comparison gaps: none.

## Writer Status Legend

- `writer-ready-data-edcd`: opcode uses a typed five-short `Data EDCD` row.
- `writer-ready-data-ed3-direct`: opcode ID directly selects an Extra Action Point row.
- `writer-ready-map-action-point-copy`: opcode ID copies another Action Point on the current map.
- `writer-ready-direct-code-id`: opcode has direct CODE/ID behavior without EDCD.
- `writer-gated-direct-target-family`: no EDCD row; writer readiness belongs to the referenced record family.
- `writer-gated-missing-edcd-shape`: Realmz consumes EDCD but Providence has no typed shape yet.
- `writer-gated-not-used`: Divinity labels the opcode Not Used and Realmz has no dispatcher case; imported values are preserved.

## Follow-Up Use

- Review rows where Divinity E-Code wording and Providence field names disagree.
- Use the `fieldComparison` arrays in `docs/generated/opcode-edcd-crosswalk.json` for targeted EDCD label fixes.
- Treat rows without a typed EDCD shape as direct CODE/ID workflows unless Realmz source proves `loadextracode(id)`.

