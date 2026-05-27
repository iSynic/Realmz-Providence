# Archaeology Priorities

Providence archaeology is editor-first: reverse engineering work should unlock a specific authoring surface, validation rule, or export guarantee. Realmz source is the runtime authority; Divinity Manual and binary evidence are the editor-authority; the scenario corpus is the breadth check.

## Evidence Backlog Policy

Every target uses the same evidence card shape:

- **User-facing unlock**: what Providence can author, validate, or explain afterward.
- **Realmz anchors**: source files, structs, converters, and runtime consumers under `F:\Realmz`.
- **Divinity evidence**: manual chapter, binary/dialog evidence, screenshots, or Ghidra function/address notes.
- **Byte layout**: record size, endian behavior, owned fields, preserved bytes, and cache/runtime split.
- **Corpus evidence**: observed file/resource frequency and representative scenarios.
- **Providence follow-up**: one of `parser-only`, `parser-writer`, `editor-ui`, `validation`, `docs-only`, or `preserve-only`.

An editor slice is ready only when byte layout, runtime meaning, validation behavior, and export ownership are classified. Unknown bytes stay preserved and visible.

## Priority Order

| Rank | Target | Why It Comes Now | Follow-up Slice |
| ---: | --- | --- | --- |
| 1 | Scenario shell, startup, and release | Enables creating a Realmz-loadable scenario without cloning Tutorial. | parser-writer, editor-ui, validation |
| 2 | Map tile intelligence | Makes the new Maps workbench match Divinity's tile semantics instead of only rendering art. | parser-writer, editor-ui, validation |
| 3 | Dungeon geometry and interaction bits | Turns dungeon authoring from raw bitfields into safe wall/door/secret controls. | parser-writer, editor-ui, validation |
| 4 | Core records for full scenario construction | Completes monsters, items, spells, races, castes, battles, shops, treasure, encounters, and notes. | parser-writer, editor-ui, validation |
| 5 | Scripts and runtime state semantics | Explains remaining action/EDCD/cache behaviors without mixing authored source and generated state. | parser-only, validation, editor-ui |
| 6 | Resource authoring | Lets Providence manage all art/sound/text resources Divinity can create or reference. | parser-writer, editor-ui, validation |

## Current High-Value Finding

The first follow-up archaeology pass tightened `Map tile intelligence`: Realmz source proves that standard tile attributes come from landlook `mapstats` records in bundled/custom `* BD` files, while scenario `Data Solids` only supplies solidity for special negative map values. This makes the next Maps editor slice clearer:

- parse bundled landlook `* BD` files into `TileAttributeProfile`;
- keep `Data Solids` as special/icon tile solidity evidence;
- group palette tiles from source-backed `mapstats` fields;
- keep landlook attribute writing disabled until Divinity binary write routines or fixtures prove the writer surface.

Detailed evidence lives in `docs/format-evidence-cards/map-tile-runtime-anchors.md` and `docs/generated/tile-attribute-evidence.json`.

The second follow-up archaeology pass tightened `Dungeon geometry and interaction bits`: Realmz source proves `Data DL` is a bitfield with source-backed masks for walls, door orientation, stairs, pillars, hidden/revealed secret state, directional secret pass-through, and note/interaction evidence. This makes the next dungeon editor slice concrete:

- add a `DungeonCellProfile` helper with named masks and raw visibility;
- replace raw dungeon painting with named primitives;
- keep directional secret/pass-through guided rather than a single vague toggle;
- require fixture checks before broad writer controls.

Detailed evidence lives in `docs/format-evidence-cards/dungeon-runtime-anchors.md` and `docs/generated/dungeon-bitfield-evidence.json`.

The third follow-up archaeology pass tightened `Scenario shell, startup, and release`: Realmz source proves the marker/main scenario file layout and the exact first-start source files `setupnewgame` copies into runtime caches. This makes blank scenario creation a concrete editor target:

- parse and write the marker/main scenario file fields for party level target, maximum party level, startup land level, startup coordinates, registration code segments, and creator/user string;
- parse and write `Data CI` as eighteen fixed `Str255` contact/release fields;
- validate the minimum first-start source files before claiming a Providence-created scenario is Realmz-loadable;
- preserve resource-fork `RLMZ` and the 320-byte marker-file tail until Divinity/resource writer evidence explains them.

Detailed evidence lives in `docs/format-evidence-cards/scenario-startup-runtime-anchors.md` and `docs/generated/scenario-shell-evidence.json`.

The fourth follow-up archaeology pass tightened `Resource authoring` for the current Maps work: Realmz source proves negative map field values are rendered as current landlook base terrain plus a normalized `cicn` icon, not as terrain-atlas tiles. This makes the Maps V4 rendering fix precise:

- resolve negative field values through icon resources before falling back to terrain/color;
- preserve raw field values such as `-1091` while previewing normalized icon candidates such as `-91`;
- use `Data Solids` only for raw `-1..-998` special/icon solidity evidence;
- label opcode `12` changes as runtime script mutations rather than static placed art.

Detailed evidence lives in `docs/format-evidence-cards/resource-icon-runtime-anchors.md` and `docs/generated/resource-icon-evidence.json`.

The fifth follow-up archaeology pass tightened `Core records for full scenario construction`: Realmz source now separates scenario-authored records from shared/override rules-library records. This changes the editor dependency order:

- make Text/messages the central editable target record surface;
- add item/spell/race/caste pickers with shared-vs-scenario override badges before pretending those are all scenario-local editors;
- promote `Data MD` monsters next, because battles, encounters, treasure, shops, and scripts all benefit from stable monster/item/spell/icon pickers;
- treat `Data MENU` and runtime caches as generated state evidence, not authored source.

Detailed evidence lives in `docs/format-evidence-cards/core-rules-record-runtime-anchors.md` and `docs/generated/core-rules-record-evidence.json`.

The sixth follow-up archaeology pass tightened `Text/messages`: Realmz source proves `Data SD2` is the central 256-byte `Str255` message pool, while simple/complex encounter inline buffers are display text passed to `ParamText`. This clears up the confusing Encounter Text UI:

- punctuation inside encounter display text is not executable behavior unless later Divinity evidence proves editor-only annotation;
- branch/action behavior belongs to decoded encounter result/action rows;
- the Text tool should become the central message authoring workbench;
- prompt search controls should behave as message target pickers, not text search fields.

Detailed evidence lives in `docs/format-evidence-cards/text-message-runtime-anchors.md` and `docs/generated/text-message-evidence.json`.

The current Text/Assets editor pass adds two open archaeology questions rather than inventing UI:

- Divinity's Strings screen exposes a `Sound` value. Providence should not add this field until Realmz source, Divinity binary write routines, or before/after scenario fixtures identify where it is stored and how runtime consumes it.
- Divinity's text export/import workflow is now confirmed by the Divinity Guide as plain text separated by an Apple-symbol tag padded with spaces. Providence implements that workflow for `Data SD2` strings, but any future classic-Mac interop needs a fixture before claiming byte-for-byte Divinity file compatibility.

The Assets pass also formalizes a resource-origin split for future archaeology: scenario-owned assets, Realmz runtime library assets, Divinity editor/reference assets, and UI-only reference art must stay distinct in both pickers and map painting.
The Divinity Guide picture/sound chapter is concrete enough for editor implementation: scenario picture imports should allocate inside PICT IDs `30000..30128` with `30128` reserved for the title picture, and custom sounds should allocate inside `snd ` IDs `200..500`. This is an authoring constraint, not a new Realmz runtime behavior.

The seventh follow-up archaeology pass tightened `Core records` around monsters: Realmz source proves `Data MD` is the 210-byte scenario-authored monster template file. This makes a Monster editor concrete:

- parse/write `Data MD` as dense 210-byte records with raw-byte preservation;
- treat `Data MENU` as generated bestiary evidence, not authored source;
- expose battle grid references as signed monster IDs where negative values flip the loaded monster side flag;
- link spawn/add-ally script opcodes and monster death macros back to `Data MD` records;
- validate icon, item, spell, and death macro references before export.

Detailed evidence lives in `docs/format-evidence-cards/monster-record-runtime-anchors.md` and `docs/generated/monster-record-evidence.json`.

The eighth follow-up archaeology pass tightened `Core records` around battles: Realmz source proves `Data BD` is a 346-byte scenario-authored battle record. This makes the Battle editor concrete:

- present battle records as a 13x13 monster placement grid;
- resolve each nonzero grid cell to `Data MD` by absolute value;
- expose negative grid entries as a side/friendly toggle instead of a strange negative monster id;
- use central `Data SD2` pickers for before/after battle messages;
- expose `battlemacro` as sign-sensitive combat-round macro evidence until Divinity labels are proven.

Detailed evidence lives in `docs/format-evidence-cards/battle-record-runtime-anchors.md` and `docs/generated/battle-record-evidence.json`.

The ninth follow-up archaeology pass tightened `Core records` around items, treasure, and shops. Realmz source proves the authoring split:

- `Data TD` is the 48-byte scenario treasure source file;
- `Data SD` is the 3,002-byte scenario shop source file;
- first-start copies `Data SD` into runtime `CS`, and shop mutations alter `CS`;
- item definitions resolve through 200-record families: shared `Data ID` for IDs 0-799 and the active scenario's `Data NI` for supply/special IDs 800-999;
- Divinity's Item Editor promise is custom item authoring in the 900-999 range, with built-in items kept as reference/copy sources;
- Providence should surface scenario `Data NI` in item pickers before deepening custom item editing.

Detailed evidence lives in `docs/format-evidence-cards/item-treasure-shop-runtime-anchors.md` and `docs/generated/item-treasure-shop-evidence.json`.

The tenth follow-up archaeology pass tightened `Core records` around simple and complex encounters. Realmz source proves the source/runtime split and corrects the complex encounter model:

- `Data ED` and `Data ED2` are source files copied to runtime `CE` and `CE2`;
- runtime opcodes can eliminate choices or replace result rows in the caches;
- simple encounters have four choice results and four 80-byte display buffers;
- complex encounters have one action result, one word result, eight action-picker group flags, ten spell tests, five item tests, thief hooks, and nine 40-byte display buffers;
- corpus `Data ED` files include tail/packing confidence debt, so Providence should preserve tails before aggressive simple encounter rewrites.

Detailed evidence lives in `docs/format-evidence-cards/encounter-record-runtime-anchors.md` and `docs/generated/encounter-record-evidence.json`.

The eleventh follow-up archaeology pass tightened `Core records` around thief/rogue and timed encounters. Realmz source proves the source/runtime/save-state split:

- `Data TD2` is a 118-byte thief/rogue encounter source file copied to runtime `CT`;
- thief actions mutate runtime flags such as trap detected/disarmed/sprung state and save as `Data H1`;
- `Data TD3` is a 40-byte timed encounter source file copied to runtime `CTD3`;
- timed encounters gate macro execution by day, percent, item, quest, land/dungeon location, random rectangle, and coordinate;
- opcode `54` mutates runtime timed encounter state, not source `Data TD3`.

Detailed evidence lives in `docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md` and `docs/generated/thief-timed-encounter-evidence.json`.

The twelfth follow-up archaeology pass tightened `Core records` around Rules data: spells, races, and castes. Realmz source proves these should be presented as shared/override rules libraries before they become full editable scenario records:

- spells are 30-byte byte-only records; shared `Data S` is 525 spells, while scenario `Data Spell` fills the fifth 105-spell class and carries resource/tail evidence;
- packed spell IDs resolve to class, level, and slot through `loadspell2`;
- third-party scenarios can override races and castes with scenario-local `Data Race` and `Data Caste`, falling back to shared files when absent;
- scenario `Data Race` overrides are 30 x 408-byte records;
- `Data Caste` records are 30 x 576-byte records;
- existing rough Providence library record summaries for these families are parser confidence debt and should be corrected before Rules editing.

Detailed evidence lives in `docs/format-evidence-cards/rules-spell-race-caste-runtime-anchors.md` and `docs/generated/rules-spell-race-caste-evidence.json`.

The thirteenth follow-up archaeology pass tightened `Scenario shell, startup, and release` around party restrictions. Realmz source proves `Data RI` is the concrete Scenario Restrictions file:

- `Data RI` is one 320-byte `restrictinfo` record when present;
- it contains a `Str255` description, `maxpc`, `maxlevel`, 30 race flags, and 30 caste flags;
- despite source field names `canrace` and `cancaste`, nonzero flags ban that race/caste during party selection;
- the local output corpus has `Data RI` in 24 of 28 scenarios, always 320 bytes;
- Providence now tracks and parses `Data RI` as source-backed semantic restriction evidence, but write support remains fixture-gated.

Detailed evidence lives in `docs/format-evidence-cards/scenario-party-restrictions-runtime-anchors.md` and `docs/generated/scenario-party-restrictions-evidence.json`.

The fourteenth follow-up archaeology pass tightened `Scripts and runtime state semantics` around Global macro hooks. Realmz source proves `Global` is one 60-byte authored source file containing 30 signed-short macro hook slots:

- slot `0` executes when a new game starts through `mainscreeninit`;
- slot `1` executes during party death/loss handling and can participate in revive behavior;
- slot `2` executes before ending the current game;
- slot `4` executes before entering a shop;
- slot `5` executes before entering a temple;
- slots `3` and `6-29` have no source-backed runtime consumer yet and must remain preserved evidence, even when nonzero in the corpus.

Detailed evidence lives in `docs/format-evidence-cards/global-macro-runtime-anchors.md` and `docs/generated/global-macro-evidence.json`.

The fifteenth follow-up archaeology pass tightened `Core records` around map records. Realmz source proves `Data MD2` is a 340-byte `struct maps` record used by the scenario Maps menu and map-note UI:

- the first 30 shorts are ten `cicn` marker triples: icon id, x, y;
- `startx`, `starty`, `level`, `isdungeon`, and `iconsize` drive rendered map previews;
- nonzero `pictid` switches the record to a `PICT`-backed view, optionally clipped by `rect`;
- negative `show` dispatches a movie path and remains preserve-cautious until Divinity labels it;
- the trailing `Str255` is the visible map note text;
- local corpus usage is heavy: 427 records, 370 notes, 1,181 nonzero icon slots, and 53 picture-backed records across 28 output scenarios.

Detailed evidence lives in `docs/format-evidence-cards/map-record-runtime-anchors.md` and `docs/generated/map-record-evidence.json`.

The sixteenth follow-up archaeology pass tightened `Map tile intelligence` around raw outdoor field values. Realmz source proves the signed short in `Data LD` is a layered field value, not simply a terrain tile id:

- positive visible terrain values resolve through the current landlook and `mapstats`;
- negative values render as current landlook base terrain plus normalized `cicn` icon art;
- positive values over `999` carry door/action/secret field state and are normalized by clearing note/path bits and subtracting thousand bands;
- note and path marker bits are positive-value field state; path can be runtime mutation after movement;
- values beyond `+/-2999` participate in hidden/undetected secret-area handling.

Detailed evidence lives in `docs/format-evidence-cards/map-field-value-runtime-anchors.md` and `docs/generated/map-field-value-evidence.json`.

The seventeenth follow-up archaeology pass tightened `Map tile intelligence` around random levels and random rectangles. Realmz source proves `Data RD` and `Data RDD` are 644-byte `randlevel` records:

- every level has up to 20 random rectangles;
- `percent` is checked as `Rand(10000) <= percent`, so the UI should call it "times in 10000";
- rectangles are checked from index 19 down to 0, so overlap priority is source-backed;
- each rectangle can fire three extra Action Point doors before battle selection;
- positive extra AP percents are one-shot because Realmz zeroes them after firing; negative percents repeat;
- `option`, `sound`, and `text` form a prompt/surprise path before random battle;
- opcodes `23`, `-23`, `92`, and `106` mutate random-level data at runtime.

Detailed evidence lives in `docs/format-evidence-cards/random-level-runtime-anchors.md` and `docs/generated/random-level-evidence.json`.

The eighteenth follow-up archaeology pass tightened `Map tile intelligence` around dark/LOS rendering. Realmz source proves `Dark Level` and `Use LOS` are real authored `Data RD` flags, but their visible effect is runtime-state dependent:

- `setupnewgame` generates outdoor `CL` records from `Data DD`, `Data LD`, and `Data RD`, then appends a zeroed `site[90][90]` cache to each outdoor level;
- dungeon `CD` records do not include `site`;
- `centerpict` draws black tile `252` when `randlevel.uselos` is true and `site[x][y]` is false;
- `cansee` marks visible outdoor cells in `site` after consulting `mapstats[hit].los`;
- `randlevel.isdark` applies a party-centered darkness mask instead of changing terrain art.

Detailed evidence lives in `docs/format-evidence-cards/outdoor-visibility-runtime-anchors.md` and `docs/generated/outdoor-visibility-evidence.json`.

## Divinity Binary Workflow

Use Ghidra against the Mac Divinity binary and data files under `F:\Divinity CD`. Each binary-derived claim must cite one of:

- a function/address or call graph location;
- a dialog/control resource or visible label;
- a screenshot tied to a manual chapter;
- an observed file/resource write after changing one field.

Start with these screens in order: Scenario Startup Information, Edit Land Tiles, Dungeon Editor, Monster/Item/Spell/Race/Caste editors, Special Land Tiles / Import Picture, and Release/Security/Registration dialogs.

## Corpus And Fixture Workflow

The current breadth source is the 44-scenario inventory generated by Realmz Scenario Utility. For each decoded field, record:

- corpus histogram;
- one vanilla or Divinity-authored scenario example;
- one writer fixture when Providence will edit the field;
- preserve-only status when a field is understood enough to explain but not enough to write.

Generated runtime/cache files remain evidence, not authored export sources.

## Artifacts

- Evidence cards live in `docs/format-evidence-cards/`.
- Seed coverage lives in `docs/generated/coverage-matrix.json`.
- Seed corpus usage lives in `docs/generated/corpus-field-usage.json`.
- Tile attribute evidence lives in `docs/generated/tile-attribute-evidence.json`.
- Map field-value evidence lives in `docs/generated/map-field-value-evidence.json`.
- Random level evidence lives in `docs/generated/random-level-evidence.json`.
- Outdoor visibility evidence lives in `docs/generated/outdoor-visibility-evidence.json`.
- Dungeon bitfield evidence lives in `docs/generated/dungeon-bitfield-evidence.json`.
- Scenario shell/startup evidence lives in `docs/generated/scenario-shell-evidence.json`.
- Scenario party restriction evidence lives in `docs/generated/scenario-party-restrictions-evidence.json`.
- Resource/icon tile rendering evidence lives in `docs/generated/resource-icon-evidence.json`.
- Core rules/record split evidence lives in `docs/generated/core-rules-record-evidence.json`.
- Text/message evidence lives in `docs/generated/text-message-evidence.json`.
- Monster record evidence lives in `docs/generated/monster-record-evidence.json`.
- Battle record evidence lives in `docs/generated/battle-record-evidence.json`.
- Item/treasure/shop evidence lives in `docs/generated/item-treasure-shop-evidence.json`.
- Encounter record evidence lives in `docs/generated/encounter-record-evidence.json`.
- Thief/timed encounter evidence lives in `docs/generated/thief-timed-encounter-evidence.json`.
- Spell/race/caste rules evidence lives in `docs/generated/rules-spell-race-caste-evidence.json`.
- Global macro hook evidence lives in `docs/generated/global-macro-evidence.json`.
- Map record evidence lives in `docs/generated/map-record-evidence.json`.
- External technical evidence remains linked to `F:\Realmz Scenario Utility\docs\scenario-format` instead of copied wholesale.
