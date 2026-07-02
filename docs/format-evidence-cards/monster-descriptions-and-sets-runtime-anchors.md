# Evidence Card: Monster Descriptions And Monster Sets

## User-Facing Unlock

Providence can stop treating `Data DES`, `Data MD1`, and `Data MD-1` as unrelated mystery files. They are part of the monster authoring surface:

- `Data DES` is the monster description text pool used by Realmz bestiary/monster inspection.
- `Data MD1` and `Data MD-1` are alternate monster template sets selected by the runtime `monsterset` preference.
- All monster set files use the same 210-byte `struct monster` layout as `Data MD`.

This unlocks a safer Monster workbench plan: parse all monster sets, show descriptions alongside monster templates, preserve unknown/extra description slots, and expose direct set editing only where fixtures prove Divinity's monster editor behavior.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:159` | Defines the 210-byte `struct monster` template used by `Data MD` and monster-set variants. |
| `F:\Realmz\src\realmz_orig\convert.c:236` | `CvtMonsterToPc` converts the short fields in monster templates. |
| `F:\Realmz\src\realmz_orig\beast.c:56` | Bestiary/monster display opens `Data MD`. |
| `F:\Realmz\src\realmz_orig\beast.c:58` | If `monsterset` is nonzero, Realmz appends the numeric set value to the `Data MD` filename. This yields names such as `Data MD1` and `Data MD-1`. |
| `F:\Realmz\src\realmz_orig\beast.c:74` | Bestiary seeks by `specific * sizeof monpick` when a specific monster id is requested. |
| `F:\Realmz\src\realmz_orig\beast.c:76` | Bestiary seeks by `(menupos[index] - 1) * sizeof monpick` for menu-selected monsters. |
| `F:\Realmz\src\realmz_orig\beast.c:113` | Bestiary opens `Data DES` for monster description text. |
| `F:\Realmz\src\realmz_orig\beast.c:117` | `Data DES` seeks by `specific * 256` or menu position `* 256`. |
| `F:\Realmz\src\realmz_orig\partyselect.c:262` | Party selection presents monster set choices. |
| `F:\Realmz\src\realmz_orig\partyselect.c:266` | Choosing a monster set writes `monsterset = itemHit - 55`, allowing `-1`, `0`, and `1` in observed UI paths. |
| `F:\Realmz\src\realmz_orig\save-direction-order.c:421` | `monsterset` is saved in save-game preferences/state. |
| `F:\Realmz\src\realmz_orig\spelllist.c:168` | Summon/polymorph logic also appends `monsterset` to `Data MD` before choosing a random monster. |
| `F:\Realmz\src\realmz_orig\newland.c:1052` | Add-ally script logic appends `monsterset` to `Data MD` before loading the ally template. |

## Byte Layout Notes

### `Data DES`

- Fixed record size: 256 bytes.
- Runtime use: Pascal-style text is read directly into a dialog item.
- Indexing: same menu/specific monster index used for `Data MD`, but corpus files can contain more description slots than active monster records.
- Endian behavior: none; this is text/byte data.
- Writer status: parser/writer-backed with raw preservation. Default UI editing remains gated until Divinity Monster editor behavior is confirmed.

### `Data MD1` / `Data MD-1`

- Fixed record size: 210 bytes, same as `Data MD`.
- Runtime use: selected when `monsterset` is nonzero.
- Filename construction: `getfilename("Data MD")` followed by appending `monsterset`.
- Writer status: parser/writer-backed through the normal `Data MD` monster record codec. Providence preserves raw bytes by default and writes the original source filename (`Data MD1` or `Data MD-1`). Direct selected-set editing, selected-set `Switch With`, and full-record `Copy Current To All Sets` are fixture-supported. Divinity's generated `Create Sets` command remains gated.

## Divinity Fixture Update: Monster Set Authoring

`F:/Divinity - Codex/docs/handoffs/monster-sets-create-sets-to-providence.md` records fixture evidence for Divinity monster-set authoring:

- `fixture-proven`: Normal Monsters edits `Data MD`.
- `fixture-proven`: Monster Monsters edits `Data MD1`.
- `fixture-proven`: Mega Monsters edits `Data MD-1`.
- `fixture-proven`: all three files use the same 210-byte monster record layout.
- `fixture-proven`: `Copy Current To All Sets` copies the full active 210-byte monster record to the same monster index in all three set files.
- `fixture-proven`: `Switch With` operates inside the currently selected monster set and swaps shared `Data DES` description slots for the two monster indexes.
- `fixture-proven`: Divinity's `Create Sets` writes generated stronger/weaker values into `Data MD1` and `Data MD-1` for mapped fields; it does not simply copy the full Normal record.
- `fixture-proven with caveat`: broad-field fixture copied attack specials, attack rows 2-5, immunities, money, spells, items, weapon, icon, magic-to-hit, conditions, and death macro from Normal into both alternate sets.
- `fixture-proven`: broad-field fixture scaled saves, spell points, and experience for alternate sets.
- `fixture-proven`: the spell-points/experience grid gives enough points to implement experience scaling for normal-range values.
- `fixture-proven with caveat`: spell points follow a repeatable scaling/cap pattern for normal-range values, but high value `30000` exposes overflow/clamp inconsistency.
- `fixture-proven`: visible `Req Weap = -2 Sharp Only` did not persist into record rel `7`; visible `Can Be = 1 Yes` did not persist into record rel `45`.
- `unknown`: exact Mega spell-point rounding, some high-value clamp behavior, and the persistence path for the visible required-weapon / can-summon dropdowns remain unresolved.

The binary follow-up refreshed Capstone/crossref indexes and successfully imported `CODE_1_Mac_Libraries.bin` into Ghidra, but raw CODE segmentation did not recover a complete or reliable `Create Sets` routine. DATA string anchors prove filename presence, not write ownership or formulas. The fixture handoff is therefore the current source of truth for the generator.

### `Create Sets` Fixture Map

The mapped Divinity behavior is:

| Field group | Data MD1 / Monster Monsters | Data MD-1 / Mega Monsters | Evidence |
| --- | --- | --- | --- |
| rel `0` hit dice | normal hit dice `+ 6` | normal hit dice `+ 15` | correlated formula from fixture grid |
| rel `1` bonus stamina | normal hit dice `+` normal bonus `+ 6` | normal hit dice `+` normal bonus `+ 31` | correlated formula from fixture grid |
| rel `2` agility | normal agility `+ 1` | normal agility `+ 3` | correlated formula from fixture grid |
| rel `4` movement max | normal movement `+ 2` | normal movement `+ 4` | correlated formula from fixture grid |
| rel `5` armor | normal armor `+ 10` | normal armor `+ 30` | correlated formula from fixture grid |
| rel `6` magic resist | normal magic resist `+ 10` | normal magic resist `+ 25` | correlated formula from fixture grid |
| rel `18` attack count | copied from Normal | copied from Normal | fixture-proven |
| rel `19` magic attack count | copied from Normal | copied from Normal | fixture-proven |
| rel `20..21` attack 1 damage | copied from Normal | copied from Normal | fixture-proven |
| rel `22` attack 1 form | not propagated by observed fixture | not propagated by observed fixture | fixture-proven |
| rel `23` attack 1 special | copied from Normal | copied from Normal | fixture-proven single-point |
| rel `24..39` attack rows 2-5 | copied from Normal | copied from Normal | fixture-proven single-point |
| rel `40` damage bonus | normal damage bonus `+ 2` | normal damage bonus `+ 5` | correlated formula from fixture grid |
| rel `41` cast percent | copied from Normal | copied from Normal | fixture-proven |
| rel `42` run percent | `floor(normal * 3 / 4)` | `floor(normal * 11 / 20)` | correlated formula from fixture grid |
| rel `43` surrender percent | `floor(normal * 3 / 4)` | `floor(normal * 11 / 20)` | correlated formula from fixture grid |
| rel `44` missile percent | copied from Normal | copied from Normal | fixture-proven |
| rel `46..51` saves | normal save `+ 10` | normal save `+ 25` | fixture-proven single-point |
| rel `52..57` immunities | copied from Normal | copied from Normal | fixture-proven single-point |
| rel `58..63` money | copied from Normal | copied from Normal | fixture-proven single-point |
| rel `64..83` spells | copied from Normal | copied from Normal | fixture-proven single-point |
| rel `84..95` items | copied from Normal | copied from Normal | fixture-proven single-point |
| rel `96..97` weapon | copied from Normal | copied from Normal | fixture-proven single-point |
| rel `98..99` icon | copied from Normal | copied from Normal | fixture-proven single-point |
| rel `100..101` spell points | likely `floor(normal * 133 / 100)` for uncapped normal values; high values can overflow | roughly doubled for low values and capped at `999` for high values; exact rounding unresolved | correlated multi-point fixture |
| rel `102..103` experience | `floor(normal * 5 / 4)` for normal-range values | `floor(normal * 25 / 16)` for normal-range values | fixture-proven multi-point formula |
| rel `121` magic-to-hit | copied from Normal | copied from Normal | fixture-proven single-point |
| rel `122..161` conditions | copied from Normal | copied from Normal | fixture-proven single-point |
| rel `166..167` death macro | copied from Normal | copied from Normal | fixture-proven single-point |

### Spell Points, Experience, And Clamp Probe

`F:/Divinity - Codex/docs/handoffs/monster-sets-create-sets-to-providence.md` adds fixture `monster-sets-create-sets-sp-xp-clamp-rel7-45-hax`.

Observed normal-range generation:

| Normal SP | Data MD1 SP | Data MD-1 SP | Normal XP | Data MD1 XP | Data MD-1 XP |
| ---: | ---: | ---: | ---: | ---: | ---: |
| `10` | `13` | `19` | `100` | `125` | `156` |
| `77` | `102` | `153` | `888` | `1110` | `1387` |
| `300` | `399` | `598` | `1200` | `1500` | `1875` |
| `999` | `999` | `999` | `2000` | `2500` | `3125` |

High-value observation:

| Normal SP | Data MD1 SP | Data MD-1 SP | Normal XP | Data MD1 XP | Data MD-1 XP |
| ---: | ---: | ---: | ---: | ---: | ---: |
| `30000` | `-25636` | `999` | `30000` | `-28036` | `30000` |

Evidence interpretation:

- `fixture-proven`: Monster Monsters experience uses `floor(normal * 5 / 4)` for normal-range values.
- `fixture-proven`: Mega Monsters experience uses `floor(normal * 25 / 16)` for normal-range values.
- `fixture-proven`: Monster Monsters high-value experience can overflow signed 16-bit storage.
- `fixture-proven`: Mega Monsters high-value experience did not follow the normal-range formula in the observed `30000` case.
- `correlated`: Monster Monsters spell points match `floor(normal * 133 / 100)` for uncapped values, with observed cap at `999` for the `999` case and signed overflow for `30000`.
- `correlated`: Mega Monsters spell points are roughly doubled for low values and capped at `999` for high values, but exact rounding is not proven from the available points.
- `fixture-proven`: negative damage bonus, negative run percent, high surrender percent, and signed-byte boundary saves were accepted by Divinity and then generated using stored signed-byte values.
- `fixture-proven`: visible `Req Weap = -2 Sharp Only` did not persist to rel `7`.
- `fixture-proven`: visible `Can Be = 1 Yes` did not persist to rel `45`.

## Corpus Evidence

The byte-roundtrip audit found these files in every visible known-valid scenario root:

| File | Frequency | Size Pattern |
| --- | ---: | --- |
| `Data DES` | 87/87 | All observed sizes are divisible by 256. |
| `Data MD1` | 87/87 | All observed sizes are divisible by 210. |
| `Data MD-1` | 87/87 | All observed sizes are divisible by 210. |

Representative observed sizes:

| File | Size | Records |
| --- | ---: | ---: |
| `Data DES` | 55,296 | 216 description slots |
| `Data DES` | 74,496 | 291 description slots |
| `Data DES` | 121,856 | 476 description slots |
| `Data MD1` | 28,770 | 137 monster records |
| `Data MD-1` | 28,980 | 138 monster records |
| `Data MD1` | 70,560 | 336 monster records |

## Providence Follow-Up

- Implemented UI: Scenario Monsters now treats `Data MD`, `Data MD1`, and `Data MD-1` as variants of the same monster-ID family, with direct selected-set editing, exact copy-to-all, selected-set switch behavior, and a Battle preview selector.
- Providence deliberately exposes `Generate Variants` as a safer editor-authored generator instead of cloning Divinity's lossy `Create Sets` behavior exactly.
- `Data DES` parser/writer support now exposes description slots by monster index and preserves extra slots.
- In normal UI, call these "Monster Sets" and "Monster Descriptions" rather than showing raw filenames.
- Keep full Divinity-compatible `Create Sets` hidden until Mega spell-point rounding, high-value clamp behavior, and rel `7` / rel `45` persistence are resolved, or implement only a clearly labeled fixture-backed subset.

## Writer Gate

`Data DES`, `Data MD1`, and `Data MD-1` can be round-tripped through Providence's fixed-record writers with raw preservation. Direct selected-set editing now uses the same MonsterRecord command surface selected by active set. Before implementing the full Divinity `Create Sets` command, Providence still needs:

- exact Mega spell-point rounding proof or a stronger Ghidra segmentation pass that recovers the formula;
- high-value clamp/overflow policy for spell points and experience;
- a persistence path for required-weapon/distance rel `7` and can-summon/NPC rel `45`, if those visible Divinity controls are real authored fields;
- validation for description slots that have no matching active monster template before bulk set operations touch descriptions.
