# Runtime Note: Core Records And Rules Library Anchors

## User-Facing Unlock

This note separates scenario-authored content records from shared rules/library records. Providence can use it to decide which tools should become direct scenario editors now, which tools need fallback/source badges, and which "Rules" surfaces should stay read-only until Divinity write evidence proves they are scenario-local.

## Authoring Split

Realmz uses two overlapping data families:

- **Scenario-authored records**: monsters, battles, treasure, shops, encounters, map records, and scenario messages live in the selected scenario folder and are consumed directly by scripts, maps, combat, and first-start cache creation.
- **Shared or override rules data**: item definitions, races, castes, and spells are loaded from shared `Data Files` by default, with some scenario-local override hooks. These need explicit "shared fallback" and "scenario override" UI treatment.
- **Generated/runtime caches**: `Data MENU`, `CS`, `CT`, `CTD3`, `CE`, and `CE2` are useful evidence, but they are not the primary authoring source when their source files exist.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:58` | `struct race` source-backed race/rules profile. |
| `F:\Realmz\src\realmz_orig\structs.h:93` | `struct caste` source-backed caste/rules profile. |
| `F:\Realmz\src\realmz_orig\structs.h:125` | `struct battle` source-backed battle record. |
| `F:\Realmz\src\realmz_orig\structs.h:159` | `struct monster` source-backed monster record with icon, item, spell, and death-action links. |
| `F:\Realmz\src\realmz_orig\structs.h:181` | `struct maps` source-backed `Data MD2` map/note record. |
| `F:\Realmz\src\realmz_orig\structs.h:221` | `struct treasure` source-backed treasure/reward record. |
| `F:\Realmz\src\realmz_orig\structs.h:259` | `struct spell` source-backed spell profile. |
| `F:\Realmz\src\realmz_orig\structs.h:330` | `struct itemattr` source-backed item attribute profile. |
| `F:\Realmz\src\realmz_orig\structs.h:338` | `struct shop` source-backed shop stock record. |
| `F:\Realmz\src\realmz_orig\convert.c:151` | `CvtItemAttrToPc` lists owned endian-converted item fields. |
| `F:\Realmz\src\realmz_orig\structs.h:330` + `F:\Realmz\src\realmz_orig\convert.c:151` | `Data NI` bytes `56..70` map to `itemattr.spare2[7]`; conversion skips these seven words, and source searches find no gameplay consumer. Providence models all seven words canonically, defaults them to zero for fresh records, and round-trips imported values through semantic decode/recompile. |
| `F:\Realmz\src\realmz_orig\convert.c:236` | `CvtMonsterToPc` lists owned endian-converted monster fields. |
| `F:\Realmz\src\realmz_orig\convert.c:275` | `CvtBattleToPc` lists owned endian-converted battle fields. |
| `F:\Realmz\src\realmz_orig\convert.c:282` | `CvtShopToPc` lists owned endian-converted shop fields. |
| `F:\Realmz\src\realmz_orig\main.c:952` | Startup loads the shared item groups from `:Data Files:Data ID`. |
| `F:\Realmz\src\realmz_orig\main.c:1183` | Startup loads shared spell records from `:Data Files:Data S`. |
| `F:\Realmz\src\realmz_orig\misc.c:2492` | `openrace` uses scenario `Data Race` for third-party scenarios when present, otherwise shared `Data Race`. |
| `F:\Realmz\src\realmz_orig\misc.c:2504` | `opencaste` uses scenario `Data Caste` for third-party scenarios when present, otherwise shared `Data Caste`. |
| `F:\Realmz\src\realmz_orig\misc.c:2753` | `selectscenario` optionally opens scenario `Data Spell` and its resource fork. |
| `F:\Realmz\src\realmz_orig\loaditem.c:5` | `loaditem` resolves item IDs into five 200-record groups. |
| `F:\Realmz\src\realmz_orig\loadspell.c:5` | `loadspell2` decodes packed spell IDs into caste, level, and slot. |
| `F:\Realmz\src\realmz_orig\combat.c:37` | Combat loads scenario `Data BD` by battle ID. |
| `F:\Realmz\src\realmz_orig\newland.c:1824` | Treasure opcode loads scenario `Data TD`. |
| `F:\Realmz\src\realmz_orig\loadsavedgame.c:846` | Shops are read from runtime `CS`, which is created from scenario `Data SD`. |
| `F:\Realmz\src\realmz_orig\menuinit.c:388` | `Data MENU` is a monster-menu cache rebuilt from `Data MD`, not the authoring identity source. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:300` | Battle grid entries seek into `Data MD` by `abs(monsterId) * sizeof monster`. |
| `F:\Realmz\src\realmz_orig\combatsetup.c:388` | Negative battle-grid monster IDs flip the loaded monster's side/friendly flag. |
| `F:\Realmz\src\realmz_orig\combat.c:37` | Combat loads `Data BD` battle records directly by battle id. |
| `F:\Realmz\src\realmz_orig\combat.c:45` | `Data BD` before-message IDs display through central `Data SD2` textbox behavior. |
| `F:\Realmz\src\realmz_orig\getup.c:75` | Negative `battlemacro` values activate combat-round macro execution. |
| `F:\Realmz\src\realmz_orig\newland.c:431` | Spawn action loads monsters from `Data MD`. |
| `F:\Realmz\src\realmz_orig\killbody.c:87` | `todoondeath` is a monster death macro hook. |
| `F:\Realmz\src\realmz_orig\loaditem.c:5` | Item IDs resolve by five 200-record shared/library families. |
| `F:\Realmz\src\realmz_orig\newland.c:1823` | Treasure opcode loads scenario `Data TD` directly. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:128` | Scenario `Data SD` shops are copied into runtime `CS`. |
| `F:\Realmz\src\realmz_orig\newland.c:3174` | Shop mutation opcode alters runtime `CS`, not scenario `Data SD`. |
| `F:\Realmz\src\realmz_orig\newland.c:1575` | Simple encounters load from runtime `CE`, copied from scenario `Data ED`. |
| `F:\Realmz\src\realmz_orig\newland.c:1641` | Complex encounters load from runtime `CE2`, copied from scenario `Data ED2`. |
| `F:\Realmz\src\realmz_orig\encounters.c:1004` | Complex encounter spell outcomes match exact spell IDs or spell class IDs. |
| `F:\Realmz\src\realmz_orig\encounters.c:1065` | Complex encounter item outcomes match item IDs. |
| `F:\Realmz\src\realmz_orig\encounters.c:1100` | Complex encounter action-picker outcomes use group flags. |
| `F:\Realmz\src\realmz_orig\encounters.c:17` | Complex encounter thief path loads runtime `CT` by `enc2.thiefsuccess`. |
| `F:\Realmz\src\realmz_orig\textbox-time.c:220` | Timed encounters scan runtime `CTD3`. |
| `F:\Realmz\src\realmz_orig\newland.c:3281` | Opcode `54` mutates runtime timed encounter state. |

## Scenario-Authored Records

These are the safest next authoring targets because Realmz directly opens them from the selected scenario folder or copies them from the scenario into runtime caches:

| Family | File | Runtime Consumers | Editor Status |
| --- | --- | --- | --- |
| Messages | `Data SD2` | text boxes, prompts, script messages, encounter text | Writable shell already exists; should become the central Text tool. |
| Monsters | `Data MD` | combat setup, bestiary/menu cache, summons, death macros | High-value next editor after Maps because battles/encounters need monster pickers. |
| Battles | `Data BD` | combat setup and battle triggers | Writable shell exists; should deepen once monsters are editable. |
| Treasure | `Data TD` | opcode `10` reward path and booty flow | Fully semantic 48-byte writer; fresh records require twenty item slots and no imported byte identity. |
| Shops | `Data SD` | copied to `CS`; shop runtime stock mutates there | Fully semantic 3,002-byte source-row writer; classified foreign suffix data remains annex-only. |
| Simple Encounters | `Data ED` | copied to `CE`; action rows plus text buffers | Writable shell exists; needs prompt/text syntax explanation and better forms. |
| Complex Encounters | `Data ED2` | copied to `CE2`; action rows, spell/item/thief branches | Writable shell exists; needs richer field forms. |
| Thief/Rogue Encounters | `Data TD2` | copied to `CT`; thief encounter flow | Parser/editor still mostly future work. |
| Timed Encounters | `Data TD3` | copied to `CTD3`; time/day trigger checks | Parser/editor still mostly future work. |
| Map Records | `Data MD2` | map UI/map notes/resource links | Marker triples, display/start fields, clip rectangle, and note text are writer-proven; bytes `74..76` remain preserved. |

## Shared/Override Rules Records

These need UI badges that say whether the data is shared, scenario-local, or unresolved:

| Family | Source | Runtime Behavior | Providence Policy |
| --- | --- | --- | --- |
| Items | Shared `:Data Files:Data ID` plus active scenario `Data NI` | `loaditem` resolves IDs into five 200-item groups: weapons, armor, accessories/helms, magic, supplies/special | Built-in IDs 0-799 remain library/reference data. Scenario `Data NI` supplies IDs 800-999; Divinity custom item editing starts at 900. Bytes `56..70` are source-backed canonical spare words with no known gameplay consumer. |
| Spells | Shared `:Data Files:Data S`; optional scenario `Data Spell` resource path is opened by `selectscenario` | `loadspell2` decodes packed IDs as caste/level/slot | Treat custom spell resources as high-priority archaeology before enabling scenario-local spell editing. |
| Races | Shared `Data Race`; scenario `Data Race` override for third-party scenarios when present | `openrace` falls back to shared data | Editor can show shared fallback vs scenario override. Writer needs override fixture. |
| Castes | Shared `Data Caste`; scenario `Data Caste` override for third-party scenarios when present | `opencaste` falls back to shared data | Editor can show shared fallback vs scenario override. Writer needs override fixture. |

## Record Size Evidence

Source structs and local corpus file sizes agree on these authoring units:

| File | Unit Evidence | Notes |
| --- | --- | --- |
| `Data MD` | 210-byte monster records | Local Bywater: 32,550 bytes = 155 records. |
| `Data BD` | `sizeof battle` runtime seek unit | Local Bywater: 88,922 bytes = 257 records at 346 bytes each. |
| `Data TD` | 48-byte treasure records | Local Bywater: 3,648 bytes = 76 records. |
| `Data SD` | 3,002-byte shop records | Local Bywater: 63,042 bytes = 21 records. |
| `Data ID` | 100-byte itemattr records | Shared output: 80,000 bytes = 800 records split into weapons/armor/helms/magic. |
| `Data NI` | 100-byte itemattr records | Bywater supply defaults: 20,000 bytes = 200 records. |
| `Data MD2` | 340-byte map records | Local Bywater: 6,800 bytes = 20 records. |
| `Data CI` | 4,608-byte contact record | Eighteen `Str255` fields. |
| `Data Race` | `sizeof race`; shared file has 30 records | Shared output: 28,800 bytes; scenario overrides observed at 12,240 bytes, so custom variants may be partial/subset and need fixture checks. |
| `Data Caste` | `sizeof caste`; shared/scenario files observed at 17,280 bytes | Override behavior is source-backed; exact record count/UI grouping needs Divinity evidence. |
| `Data Spell` | scenario custom file observed at 9,016 bytes | `selectscenario` opens it, but writer semantics need a focused spell-resource pass. |

Focused Rules anchors refine these rough units:

- `struct spell` is a 30-byte byte-only record; shared `Data S` is 525 records, while scenario `Data Spell` fills the fifth 105-record class and carries resource/tail evidence.
- Scenario `Data Race` overrides are 30 x 408-byte `struct race` records.
- `Data Caste` files are 30 x 576-byte `struct caste` records.
- Older rough Providence library summaries used 288-byte race/caste and 112/126-byte spell units; source-backed Rules inventory should use the refined units above.

## Dependency Order For Editor Work

1. **Text/messages**: make `Data SD2` the real Text workbench because scripts, encounters, shops, and map notes all point at it.
2. **Items as pickers, not full editors yet**: expose shared item library evidence so treasure/shop/monster editors can be usable without pretending scenario-local item writing is solved.
3. **Monsters**: promote `Data MD` to a full editor, linking icons, items, spells, and death macros.
   - Runtime anchors now prove battle placement, generated bestiary cache rules, spawn/add-ally usage, signed battle-grid side flips, and `todoondeath` macro execution. See `monster-record-runtime-anchors.md`.
4. **Battles**: deepen `Data BD` once monster placement has a real picker and grid semantics are fixture-backed.
   - Runtime anchors now prove the 13x13 signed monster grid, before/after message references, distance field, and negative battle macro activation. See `battle-record-runtime-anchors.md`.
5. **Treasure/Shops**: treasure and ordinary shop storage are fully canonical; continue improving item-picker workflow and the source/runtime cache explanation.
   - Runtime anchors now prove complete treasure/shop source-record compilation, the shop source/runtime cache split, item-family ID ranges, random treasure values, and runtime shop mutation behavior. See `item-treasure-shop-runtime-anchors.md`.
6. **Encounters**: deepen simple/complex/thief/timed encounters after messages, actions, items, spells, and monsters have stable pickers.
   - Runtime anchors now prove simple/complex headers, inline buffers, runtime cache mutation, and complex spell/item/thief/word/action outcomes. See `encounter-record-runtime-anchors.md`.
   - Thief/timed anchors now prove `Data TD2` and `Data TD3` record sizes, source/cache split, timed gates, and thief trap state mutation. See `thief-timed-encounter-runtime-anchors.md`.
7. **Race/Caste/Spell overrides**: add scenario override editors only after Divinity binary/write fixtures prove default files, record counts, names/resources, and export behavior.
   - Runtime anchors now prove spell/race/caste resolver behavior, packed spell IDs, and source-backed override record sizes. See `rules-spell-race-caste-runtime-anchors.md`.

## Validation Rules

- Scenario-authored records should validate dangling references to messages, icons, items, spells, monsters, macros, sounds, and maps.
- Text/message behavior is detailed in `text-message-runtime-anchors.md`, including the split between central `Data SD2` messages and encounter inline display buffers.
- Shared fallback references should be warnings only when Providence can resolve them through bundled/shared data.
- `Data MENU` should be labeled generated/effective monster menu evidence, never the source of monster identity when `Data MD` is present.
- Runtime caches (`CS`, `CT`, `CTD3`, `CE`, `CE2`) should be shown as generated state evidence, not authoring files.
- Race/caste/spell editors must show whether a value comes from shared Realmz data or a scenario override.

## Divinity Evidence Still Needed

- Monster, Item, Spell, Race, Caste, Battle, Treasure, Shop, Rogue/Thief, Time Encounter, and Map Note editor screens.
- Field labels, option lists, defaults, and hidden validation.
- Whether Divinity writes scenario-local item definitions or only shared/library item resources in the available build.
- Custom spell `Data Spell` file/resource layout and ID/name mapping.
- Race/caste override defaults and whether partial custom files are valid by design.
