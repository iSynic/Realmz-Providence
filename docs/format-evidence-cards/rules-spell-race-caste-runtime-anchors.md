# Runtime Note: Spells, Races, And Castes

## User-Facing Unlock

This note turns the current Rules tool from an inspect-only catalog into a clear authoring roadmap. Providence can safely expose spell, race, and caste pickers now, with shared-vs-scenario override badges, while holding back full write controls until Divinity writer evidence and fixtures prove the override file defaults.

The most important editor correction is that Rules data is not one uniform scenario-local record family:

- standard spells come from shared `:Data Files:Data S`;
- scenario custom spells are loaded from scenario `Data Spell` into the fifth spell class only;
- standard races and castes come from shared `Data Race` / `Data Caste`;
- third-party scenarios can override races and castes with scenario-local `Data Race` / `Data Caste`.

## Runtime Model

Realmz loads shared rule data at startup and resolves scenario overrides during scenario selection or profile loading.

| Family | Shared Source | Scenario Override | Runtime Meaning |
| --- | --- | --- | --- |
| Spells | `:Data Files:Data S` | Scenario `Data Spell` plus resource fork evidence | `spelldata[5][7][15]`; packed spell IDs resolve to class, level, slot. |
| Races | `:Data Files:Data Race` | Scenario `Data Race` for third-party scenarios | `struct race`; character creation, aging, movement, item usability, default icons. |
| Castes | `:Data Files:Data Caste` | Scenario `Data Caste` for third-party scenarios | `struct caste`; class stats, level-up behavior, spellcasting, starting items, item usability. |

Providence should label these records as library/override rules data. Scenario records that reference spells, races, or castes can use pickers immediately, but editing the rule definitions themselves needs a separate Rules authoring slice.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:58` | Defines `struct race`, including combat modifiers, stat limits, caste permissions, age bands, default icon set, item type permissions, and descriptors. |
| `F:\Realmz\src\realmz_orig\structs.h:93` | Defines `struct caste`, including special abilities, spellcaster tables, stat limits, level-up gains, class metadata, victory table, starting money/items, attacks, and item type permissions. |
| `F:\Realmz\src\realmz_orig\structs.h:259` | Defines byte-only `struct spell`, including range, targeting, hit/save modifiers, damage/duration fields, visuals, sounds, class, combat/camp availability, and target type. |
| `F:\Realmz\src\realmz_orig\convert.c:9` | `CvtRaceToPc` identifies race owned short/long fields and byte fields to preserve. |
| `F:\Realmz\src\realmz_orig\convert.c:31` | `CvtCasteToPc` identifies caste owned short/long fields and byte fields to preserve. |
| `F:\Realmz\src\realmz_orig\convert.h:150` | Spells are byte-only records, so no endian conversion is applied. |
| `F:\Realmz\src\realmz_orig\main.c:1183` | Startup loads shared spell data from `:Data Files:Data S`. |
| `F:\Realmz\src\realmz_orig\main.c:1189` | Startup calls `openrace` and reads race records to build base-move evidence. |
| `F:\Realmz\src\realmz_orig\misc.c:2492` | `openrace` uses scenario `Data Race` only for third-party scenarios, otherwise shared `Data Race`, with fallback to shared if the scenario file is missing. |
| `F:\Realmz\src\realmz_orig\misc.c:2504` | `opencaste` uses scenario `Data Caste` only for third-party scenarios, otherwise shared `Data Caste`, with fallback to shared if the scenario file is missing. |
| `F:\Realmz\src\realmz_orig\misc.c:2752` | Scenario selection looks for scenario `Data Spell`. |
| `F:\Realmz\src\realmz_orig\misc.c:2756` | Scenario `Data Spell` fills `spelldata[4]` with 105 spell records. |
| `F:\Realmz\src\realmz_orig\misc.c:2760` | Scenario `Data Spell` is also opened as a resource file, so names/resource evidence must be preserved. |
| `F:\Realmz\src\realmz_orig\loadspell.c:5` | `loadspell2` decodes packed spell IDs. |
| `F:\Realmz\src\realmz_orig\spellselect.c:24` | Spell selection derives max spell level from caste spellcaster table. |
| `F:\Realmz\src\realmz_orig\race.c:14` | Race selection loads race profiles through `openrace`. |
| `F:\Realmz\src\realmz_orig\class.c:41` | Caste selection loads caste profiles through `opencaste`. |
| `F:\Realmz\src\realmz_orig\showitems-showspecial.c:262` | Item usability checks race/caste item types, exact race/caste requirements, and descriptor/class restrictions. |

## Spell Layout

`struct spell` is 30 bytes and contains only byte fields. Shared `Data S` is 15,750 bytes in the local output tree, which is 525 records: five spell classes, seven levels, fifteen slots.

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 1 | `range1` | Range lower/primary evidence. |
| 1 | 1 | `range2` | Range upper/secondary evidence. |
| 2 | 1 | `queicon` | Queued spell icon. |
| 3 | 1 | `tohitbonus` | Hit modifier. |
| 4 | 1 | `savebonus` | Save modifier. |
| 5 | 1 | `fixedtargetnum` | Fixed target count. |
| 6 | 1 | `canrotate` | Rotatable area/target evidence. |
| 7 | 1 | `saveadjust` | Save adjustment. |
| 8 | 1 | `cannot` | Restriction/effect flag; Divinity label needed. |
| 9 | 1 | `resistadjust` | Resistance modifier. |
| 10 | 1 | `cost` | Spell point cost. |
| 11 | 1 | `damage1` | Base damage field. |
| 12 | 1 | `damage2` | Base damage field. |
| 13 | 1 | `powerdam1` | Power-scaled damage field. |
| 14 | 1 | `powerdam2` | Power-scaled damage field. |
| 15 | 1 | `duration1` | Duration field. |
| 16 | 1 | `duration2` | Duration field. |
| 17 | 1 | `powerdur1` | Power-scaled duration field. |
| 18 | 1 | `powerdur2` | Power-scaled duration field. |
| 19 | 1 | `spelllook1` | Visual/effect ID evidence. |
| 20 | 1 | `spelllook2` | Visual/effect ID evidence. |
| 21 | 1 | `sound1` | Sound ID evidence. |
| 22 | 1 | `sound2` | Sound ID evidence. |
| 23 | 1 | `targettype` | Targeting behavior. |
| 24 | 1 | `size` | Area/shape size. |
| 25 | 1 | `special` | Special behavior selector. |
| 26 | 1 | `damagetype` | Damage/resistance family. |
| 27 | 1 | `spellclass` | Class/category used by encounters and spell behavior. |
| 28 | 1 | `incombat` | Combat availability. |
| 29 | 1 | `incamp` | Camp availability. |

Packed spell IDs use `1101 + class * 1000 + level * 100 + slot`, where class, level, and slot are zero-based in runtime arrays but one-based in the visible ID encoding. `loadspell2` ignores IDs below `1101`.

Scenario `Data Spell` is 9,016 bytes in all 17 local scenarios that include it. Runtime reads only 105 spell records into `spelldata[4]` and then opens the same file as a resource file. Treat the extra bytes/resource evidence as preserve-first until Divinity write evidence explains the exact data/resource packaging.

## Race Layout

`Data Race` scenario override records are 408 bytes. Local scenario override files are 12,240 bytes, which is exactly 30 records.

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 16 | `plusminustohit[8]` | Hit modifiers. |
| 16 | 28 | `specialability[14]` | Race special ability values. |
| 44 | 16 | `drvbonus[8]` | Damage/resistance/vulnerability bonuses. |
| 60 | 12 | `attbonus[6]` | Attribute bonuses. |
| 72 | 24 | `minmax[12]` | Attribute min/max values. |
| 96 | 16 | `spare[8]` | Preserve. |
| 112 | 80 | `conditions[40]` | Condition/level evidence. |
| 192 | 2 | `maxage` | Maximum age. |
| 194 | 2 | `doesnotdie` | Mortality/age evidence. |
| 196 | 2 | `basemove` | Base movement. |
| 198 | 2 | `magres` | Magic resistance. |
| 200 | 2 | `twohand` | Two-hand modifier. |
| 202 | 2 | `missile` | Missile modifier. |
| 204 | 4 | `numofattacks[2]` | Initial/max attack evidence. |
| 208 | 30 | `cancaste[30]` | Allowed caste flags. |
| 238 | 20 | `agerange[5][2]` | Age band ranges. |
| 258 | 75 | `agechange[5][15]` | Age-band stat deltas. |
| 333 | 1 | `canregenerate` | Regeneration flag. |
| 334 | 2 | `defaulticonset` | Default icon set. |
| 336 | 8 | `itemtypes[2]` | Allowed item type bitset. |
| 344 | 2 | `descriptors` | Race descriptor/class bitset. |
| 346 | 62 | `spacer[31]` | Preserve. |

## Caste Layout

`Data Caste` records are 576 bytes. Local shared and scenario override files are 17,280 bytes, which is exactly 30 records.

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 56 | `specialability[2][14]` | Base and level/random special ability values. |
| 56 | 16 | `drvbonus[8]` | Damage/resistance/vulnerability bonuses. |
| 72 | 12 | `attbonus[6]` | Attribute bonuses. |
| 84 | 24 | `spellcasters[4][3]` | Spellcaster availability/start/max level evidence. |
| 108 | 24 | `minmax[12]` | Attribute min/max values. |
| 132 | 80 | `conditions[40]` | Conditions gained by level. |
| 212 | 2 | `canusemissile` | Missile weapon permission. |
| 214 | 2 | `getsmissilebonus` | Missile bonus behavior. |
| 216 | 4 | `stamina[2]` | Level-up stamina values. |
| 220 | 4 | `strength[2]` | Level-up strength values. |
| 224 | 4 | `dodge[2]` | Level-up dodge values. |
| 228 | 4 | `tohit[2]` | Level-up to-hit values. |
| 232 | 4 | `missile[2]` | Level-up missile values. |
| 236 | 4 | `hand2hand[2]` | Level-up hand-to-hand values. |
| 240 | 8 | `spare1[2]`, `spare2[2]` | Preserve. |
| 248 | 2 | `casteclass` | Caste class used by item restrictions. |
| 250 | 2 | `minimumagegroup` | Minimum age group. |
| 252 | 2 | `movebonus` | Movement bonus. |
| 254 | 2 | `magres` | Magic resistance. |
| 256 | 2 | `twohand` | Two-hand modifier. |
| 258 | 2 | `maxstaminabonus` | Max stamina gain cap. |
| 260 | 2 | `bonusattacks` | Bonus attacks. |
| 262 | 2 | `maxattacks` | Max attacks. |
| 264 | 120 | `victory[30]` | Experience/victory progression evidence. |
| 384 | 2 | `startmoney` | Starting money. |
| 386 | 40 | `startitems[20]` | Starting item IDs. |
| 426 | 10 | `attacks[10]` | Attack level thresholds. |
| 436 | 8 | `itemtypes[2]` | Allowed item type bitset. |
| 444 | 2 | `defaulticon` | Default icon. |
| 446 | 2 | `maxspellsattacks` | Spell/attack cap evidence. |
| 448 | 2 | `spellssofar` | Spell progression evidence. |
| 450 | 126 | `spacer[63]` | Preserve. |

## Corpus Evidence

| File | Local Frequency | Size Evidence | Notes |
| --- | ---: | --- | --- |
| `Data Spell` | 17 / 44 scenarios | all observed scenario files are 9,016 bytes | Runtime reads 105 byte-only spell records into custom class slot, plus resource evidence. |
| `Data Race` | 7 / 44 scenarios | all observed scenario override files are 12,240 bytes = 30 x 408 | Scenario override behavior is source-backed for third-party scenarios. |
| `Data Caste` | 4 / 44 scenarios | all observed files are 17,280 bytes = 30 x 576 | Scenario override behavior is source-backed for third-party scenarios. |
| Shared `Data S` | bundled output | 15,750 bytes = 525 x 30 | Five classes, seven levels, fifteen slots. |
| Shared `Data Race` | bundled output | 28,800 bytes | Shared file includes extra packaging or variant data; treat as library evidence until split is decoded. |
| Shared `Data Caste` | bundled output | 17,280 bytes = 30 x 576 | Matches scenario override size. |

## Providence Implications

- Rules should have **picker/library mode** first: spells, races, and castes should be searchable targets with source badges.
- Scenario-local `Data Race`, `Data Caste`, and `Data Spell` should show as overrides, not as ordinary scenario records.
- Older rough library record summaries treated `Data Race`/`Data Caste` as 288-byte records and `Data Spell`/`Data S` as 112/126-byte records. The source-backed record sizes above should remain the Rules parser baseline.
- The Spell picker should decode packed IDs and also support class IDs under `7` where complex encounters intentionally match spell classes instead of exact spells.
- Race/Caste item usability validation should use `itemtypes`, exact race/caste restrictions, descriptor/class restrictions, and specific race/caste requirements once item pickers are stable.
- Full Rules editing should remain gated until Divinity binary/manual evidence confirms field labels, default files, and write/export packaging.

## Validation Candidates

- Packed spell IDs below `1101` are non-spell/special IDs unless the consuming field explicitly permits class IDs.
- Exact spell IDs should resolve to a known class/level/slot or custom spell override.
- Race IDs and caste IDs should resolve through scenario overrides first, then shared data.
- `Data Race` scenario override length should be divisible by 408.
- `Data Caste` scenario override length should be divisible by 576.
- Scenario `Data Spell` should preserve resource/tail evidence and expose only the 105 source-backed spell records until packaging is decoded.
- Caste starting item IDs should resolve through the item picker.
- Race `cancaste` and caste/race restrictions should warn when a scenario setup requires an impossible race/caste pair.

## Divinity Evidence Still Needed

- Spell editor field labels, grouping, class labels, default values, and resource/name save behavior.
- Race editor field labels for descriptors, `cancaste`, age changes, item type permissions, and special ability rows.
- Caste editor field labels for spellcaster table, victory table, starting items, attack thresholds, and item type permissions.
- Whether Divinity writes complete 30-record race/caste override files every time or supports partial variants.
- Exact scenario `Data Spell` data/resource packaging and name mapping.

## Providence Follow-Up Slice

1. Add shared-vs-override badges to Rules library records.
2. Add spell/race/caste pickers used by Scripts, Encounters, Monsters, Items, and Scenario restrictions.
3. Add Rules validation using source-backed resolver behavior.
4. Add full Rules editors only after Divinity binary write evidence and writer fixtures are ready.
