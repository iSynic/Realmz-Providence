# Runtime Note: Monster Record Anchors

## User-Facing Unlock

This note makes `Data MD` a ready target for the next core-record editor slice. A Monster workbench can expose Realmz-native monster templates with typed fields, icon/item/spell/macro pickers, menu visibility badges, validation, and source-preserving export.

This is also a dependency unlock: battles place monsters, scripts can spawn monsters or add allies, bestiary menus are generated from monster records, and monster death hooks call macros.

## Runtime Model

`Data MD` is a scenario-authored fixed-record file. Each record is a 210-byte `struct monster` template. Runtime combat copies the template into mutable combat state, then randomizes or adjusts fields such as AC, DX, spell points, stamina, saves, magic resistance, weapon selection, and side/friendly state. Those runtime mutations are not authored source data.

`Data MENU` is generated/effective bestiary menu state. It is useful evidence, but the source of monster identity is `Data MD`.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:159` | Defines `struct monster`, including combat stats, attacks, money, spells, items, icon, death macro, and display name. |
| `F:\Realmz\src\realmz_orig\convert.c:236` | `CvtMonsterToPc` converts the owned short fields, confirming endian/write ownership for numeric arrays and macro/resource links. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:277` | Combat opens scenario `Data MD`. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:300` | Battle grid entries seek to `abs(battle.battle[x][y]) * sizeof monster[0]`. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:388` | Negative battle grid entries flip the monster's `traiter` side flag after loading. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:419` | Negative weapon values choose a random weapon category at battle start. |
| `F:\Realmz\src\realmz_orig\menuinit.c:388` | `Data MENU` is read as a cache. |
| `F:\Realmz\src\realmz_orig\menuinit.c:438` | If needed, Realmz rebuilds `Data MENU` from `Data MD`. |
| `F:\Realmz\src\realmz_orig\menuinit.c:450` | Bestiary entries require `hd` and not `notonmenu`; `hd == 255` terminates the list. |
| `F:\Realmz\src\realmz_orig\beast.c:56` | Bestiary opens `Data MD` and displays selected monster fields. |
| `F:\Realmz\src\realmz_orig\beast.c:133` | Bestiary resolves the monster `iconid` through `GetCIcon`. |
| `F:\Realmz\src\realmz_orig\spelllist.c:168` | Summon polymorph path chooses a random `Data MD` monster by size and `cansum == 1`. |
| `F:\Realmz\src\realmz_orig\newland.c:431` | Opcode `124` spawn loads a monster from `Data MD` and builds it into combat. |
| `F:\Realmz\src\realmz_orig\newland.c:1052` | Opcode `89` add ally loads a monster from `Data MD` into the holdover ally list. |
| `F:\Realmz\src\realmz_orig\killbody.c:87` | `todoondeath` triggers a monster death macro. |
| `F:\Realmz\src\realmz_orig\killbody.c:116` | Death macro loads door/macro codes with `loaddoor2(todoondeath)` and executes through `newland`. |

## Byte Layout

The source struct and corpus file sizes agree on a 210-byte record. Offsets below are source-backed for the original struct ordering and should be writer-owned only for decoded fields.

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 1 | `hd` | Hit dice; inactive/empty when zero. Also drives bestiary inclusion. |
| 1 | 1 | `bonus` | Added to rolled stamina at combat build time. |
| 2 | 1 | `dx` | Dexterity/speed; randomized at combat build time. |
| 3 | 1 | `name` | Numeric monster name/id used by script checks and death queue evidence. |
| 4 | 1 | `movementmax` | Movement allowance/template. |
| 5 | 1 | `ac` | Armor class; randomized/difficulty-adjusted at combat build time. |
| 6 | 1 | `magres` | Magic resistance; difficulty-adjusted. |
| 7 | 1 | `dist` | Distance/range behavior evidence. |
| 8 | 1 | `traiter` | Side/friendly flag; can be flipped by negative battle-grid entries. |
| 9 | 1 | `size` | Placement footprint and summon-size matching. |
| 10 | 8 | `type[8]` | Monster type flags; undead/demonic behavior uses indexes 1 and 2. |
| 18 | 1 | `noofattacks` | Attack count. |
| 19 | 1 | `noofmagattacks` | Magical attack count. |
| 20 | 20 | `attacks[5][4]` | Five attack rows with four byte fields each. Divinity labels still needed. |
| 40 | 1 | `damplus` | Damage bonus. |
| 41 | 1 | `castpercent` | Spell-casting chance. |
| 42 | 1 | `runpercent` | Run/flee chance. |
| 43 | 1 | `surrenderpercent` | Surrender chance. |
| 44 | 1 | `misslepercent` | Missile/ranged behavior chance. |
| 45 | 1 | `cansum` | Summon/control flag; random summon path requires `cansum == 1`, turn/control excludes `255`. |
| 46 | 6 | `save[6]` | Saves; difficulty-adjusted at combat build time. |
| 52 | 6 | `spellimmune[6]` | Spell immunity profile. |
| 58 | 6 | `money[3]` | Reward money shorts. |
| 64 | 20 | `spells[10]` | Spell references. Runtime uses packed spell IDs with `loadspell2`. |
| 84 | 12 | `items[6]` | Item references/reward/equipment evidence. |
| 96 | 2 | `weapon` | Equipped weapon; negative values select random weapon categories. |
| 98 | 2 | `iconid` | `cicn`/icon resource reference through `GetCIcon`. |
| 100 | 2 | `spellpoints` | Template spell points; randomized/difficulty-adjusted. |
| 102 | 2 | `exp` | Experience reward. |
| 104 | 2 | `stamina` | Runtime state field; template value is overwritten during combat build. |
| 106 | 2 | `staminamax` | Runtime state field; overwritten during combat build. |
| 108 | 8 | `underneath[2][2]` | Underlying tile/body placement evidence for footprint handling. |
| 116 | 1 | `target` | Runtime targeting state. |
| 117 | 1 | `guarding` | Runtime combat state. |
| 118 | 1 | `notonmenu` | Hides active monster from generated bestiary menu. |
| 119 | 1 | `beenattacked` | Runtime combat state. |
| 120 | 1 | `movement` | Runtime movement state. |
| 121 | 1 | `magtohit` | Runtime combat state. |
| 122 | 40 | `condition[40]` | Default/runtime condition bytes; random summon path selectively copies non-negative entries. |
| 162 | 1 | `lr` | Runtime direction/movement state. |
| 163 | 1 | `up` | Runtime direction/movement state. |
| 164 | 1 | `attacknum` | Runtime attack state. |
| 165 | 1 | `bonusattack` | Bonus attack flag/count evidence. |
| 166 | 2 | `todoondeath` | Monster death macro/door ID. |
| 168 | 2 | `maxspellpoints` | Runtime maximum spell points. |
| 170 | 40 | `monname[40]` | Display name. Bestiary sorting and menu text use this string. |

## Runtime Consumers

### Battle Placement

`Data BD` battle-grid cells contain signed monster IDs. Runtime uses `abs(id)` as the `Data MD` record index. A negative value does not mean a different monster; it flips `traiter` after load, which changes friend/enemy side behavior.

### Bestiary Menu

`Data MENU` contains sorted menu positions. If missing or stale, Realmz rebuilds it from `Data MD` by scanning active records where `hd` is nonzero and `notonmenu` is false. `hd == 255` terminates the scan/list.

### Spawn And Ally Scripts

Opcode `124` spawns monsters by `Data MD` record ID during combat. Opcode `89` adds an ally from `Data MD` into the holdover ally list. Both paths build mutable runtime monsters from template records and apply difficulty/randomization logic.

### Death Macros

If `todoondeath` is nonzero, monster death queues or immediately runs a macro/door through `loaddoor2` and `newland`. The editor should expose this as a macro target picker, not as a raw integer only.

## Corpus Evidence

`Data MD` appears in all 44 analyzed scenarios. Local scenario sizes confirm the 210-byte unit:

| Scenario | Size | Records |
| --- | ---: | ---: |
| War in the Sword Lands | 70,560 | 336 |
| Wrath of the Mind Lords | 63,210 | 301 |
| Grilochs Revenge | 52,710 | 251 |
| Trouble in the Sword Lands | 50,820 | 242 |
| Destroy the Necronomicon | 48,300 | 230 |
| Hax | 46,200 | 220 |
| Half Truth | 44,100 | 210 |
| City of Bywater | 32,550 | 155 |

## Providence Editor Implications

- Add a `Monster` project collection decoded from `Data MD`, preserving the 210-byte raw record.
- Treat stamina, max stamina, movement, target, guard, direction, attack number, and similar runtime state fields as advanced/template evidence unless Divinity proves authoring semantics.
- Show `Data MENU` as generated menu evidence and omit it from export so Realmz rebuilds the cache from `Data MD`.
- Monster pickers should be available to battle grids, spawn/add-ally script opcodes, encounter forms, and bestiary inspection.
- The Battle editor should label negative grid values as "flip side/friendly flag" rather than separate records.
- The Monster editor should use pickers for icon, items, spells, and death macro once those target registries are available.

## Validation Rules

- `Data MD` file length must be divisible by 210.
- Active records should have nonzero `hd` and a non-empty display name unless intentionally hidden/preserved.
- `iconid` should resolve to a known `cicn`/icon resource or warn.
- `items[6]` and `weapon` should resolve through shared item evidence; negative `weapon` values need a random-category label.
- `spells[10]` should validate through the packed spell-ID resolver.
- `todoondeath` should resolve to a callable macro/door target.
- `notonmenu` should be shown as a menu visibility flag.
- `hd == 255` should be guarded because it terminates bestiary menu scanning.
- `cansum` should show summon/control semantics where known and remain raw where not.

## Divinity Evidence Still Needed

- Monster editor labels, defaults, and range limits.
- Attack-row labels and effect/sound/resource mappings.
- Exact UI semantics for `name`, `cansum`, `type[8]`, condition defaults, and `underneath`.
- Random weapon category labels for negative `weapon`.
- Whether Divinity exposes runtime-looking fields or writes them as template defaults.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Build `Data MD` parse/write fixtures before exposing writes.
- Add a Monster editor after item/spell/icon pickers are usable enough to avoid raw-ID-only authoring.
- Add Battle-grid monster placement UI using the same monster picker and signed-side toggle.
