# Divinity Parity Map

Providence treats Divinity Manual 7.0 as the feature coverage reference, but the product goal is not to clone Divinity screen-for-screen. The editor should expose the same Realmz scenario authoring power through modern, guided workflows while exporting scenario folders that Realmz already accepts.

The technical evidence layer under this roadmap lives in `F:\Realmz Scenario Utility\docs\scenario-format`. Providence links to those local source-backed findings rather than copying the full doc set. The Divinity Manual remains the UX/capability reference; the scenario-format docs are the byte-layout, runtime-consumer, opcode, EDCD, resource, and reachability reference used to decide what can be edited, preserved, validated, or exported.

See `docs/scenario-format-integration.md` for the Providence-specific integration policy.

See `docs/archaeology-priorities.md` for the editor-first reverse-engineering backlog. That backlog ranks format targets by authoring value, runtime importance, Divinity coverage, parse/write confidence, and corpus frequency before they become new Providence editor work.

## Coverage Legend

- `Inspect`: Providence can import and explain the data.
- `Author`: Providence has user-facing edit controls.
- `Validate`: Providence flags incomplete, unsafe, or unsupported edits.
- `Export`: Providence writes Realmz-standard files for that subsystem.
- `Preserve`: Providence passes imported data through unchanged when it cannot safely author it yet.

## Manual Chapter Coverage

| Divinity area | Providence domain | Current state | Next editor work |
| --- | --- | --- | --- |
| Getting Started | Project/Scenario | Inspect imported projects; desktop save/export exists | Blank scenario creation flow |
| Land Editor / Land Layout | Maps | Author tile painting, region fill/replace, Action Point placement, random rectangles, map flags, and special/icon tile placement; inspect map layout evidence | Land layout/start records and deeper dungeon geometry |
| Scenario Startup Information | Scenario | Inspect scenario/contact/startup records where decoded | User-facing startup editor and typed scenario commands |
| Action Points / GOSUBs | Scripts | Author Action Points, callable/reachable macros, CODE/ID slots, EDCD rows, reordering, duplication, deletion, and inline diagnostics; preserve non-reachable ED3 rows as evidence | Broader opcode-specific forms and richer branch visualizations |
| Scripting Codes 1-29 | Scripts | Guided opcode picker with descriptions, target picker, EDCD shape hints | Complete manual-derived notes and opcode examples |
| Scripting Codes 30-59 | Scripts | Guided opcode picker with descriptions, target picker, EDCD shape hints | Complete manual-derived notes and opcode examples |
| Scripting Codes 60-89 | Scripts | Guided opcode picker with descriptions, target picker, EDCD shape hints | Complete manual-derived notes and opcode examples |
| Scripting Codes 90-End | Scripts | Guided opcode picker with descriptions, target picker, EDCD shape hints | Complete manual-derived notes and opcode examples |
| HUB | Workbench | Modern domain rail replaces Divinity HUB | Add explicit Divinity chapter cross-reference affordance |
| Battle Editor | Combat | Author usable battle shells with grid, distance, before/after messages, battle macro, preservation of unsupported bytes, and `Data BD` export | Monster record pickers and full battle option coverage |
| Monster Editor | Combat | Inspect monster records and resource links | Monster record forms and icon assignment |
| Monster Scrapbook | Combat/Library | Inspect library catalog entries | Copy/adapt scrapbook entries into scenario records |
| Treasure Editor | Economy | Author usable treasure shells with item slots, exp, gold, gems, jewelry, preservation of unsupported bytes, and `Data TD` export | Item reward picker and richer reward validation |
| Item Editor | Economy | Inspect item references | Item form and export writer support |
| Shop Editor | Economy | Author usable shop shells with item IDs, quantities, inflation, preservation of unsupported bytes, and `Data SD` export | Item picker, bulk fill, and pricing quality checks |
| Simple Encounter Editor | Encounters | Author usable simple encounter shells with action rows, text buffers, shell flags, preservation of unsupported bytes, and `Data ED` export | Branch-oriented encounter workflow |
| Complex Encounter Editor | Encounters | Author usable complex encounter shells with action rows, text buffers, shell flags, preservation of unsupported bytes, and `Data ED2` export | Word/spell/item/thief branch workflow |
| Rogue Encounter Editor | Encounters | Inspect thief/rogue encounter records | Rogue encounter form |
| Time Encounter Editor | Encounters | Inspect timed encounters | Timed encounter schedule editor |
| Map Editor | Maps | Author map tiles, APs, random rectangles, map flags, special/icon tiles, and source-backed map-record fields | Map note/start authoring beyond decoded MD2 fields |
| Dungeon Editor | Maps | Inspect dungeon levels, render profiles, LOS/darkness evidence | Dungeon geometry and flag authoring |
| Macros / Quests | Scripts | Author macros and quest flag script links; validate missing targets | Dedicated quest registry and macro graph view |
| Monster Mash | Combat/Library | Inspect shared monster icon material | Scenario icon import/copy workflow |
| Vault of Arcana | Economy/Library | Inspect shared item/icon material | Copy/adapt vault entries into scenario records |
| Adding Monster & Item Icons | Assets | Import managed picture/icon/sound assets; preview resource forks | Icon assignment to monster/item records |
| Creating Special Land Tiles | Assets/Maps | Import, preview, place, validate, and preserve special land/icon tiles as negative Realmz field values | Special tile asset creation/editing |
| Pictures & Sounds | Assets/Text/Scripts | Managed assets, target picker for PICT/snd actions | Resource ID conflict resolution and richer previews |
| Standard Land Tile Editor | Assets/Maps | Inspect/render standard tilesets; group tiles with source-backed landlook `mapstats`; use `Data Solids` as special/icon solidity evidence | Tile atlas and tile-attribute writing remains future work |
| Spell Editor | Rules | Inspect spells and references | Spell record form and validation |
| Race Editor | Rules | Inspect races and references | Race record form and restriction integration |
| Caste Editor | Rules | Inspect castes and references | Caste record form and restriction integration |
| Text Import / Export / Spell Checking | Text | Author `Data SD2` message records from script context, validate 255-byte limit, preserve imported bytes, and export Realmz message files | Text import/export and spell-check workflow |
| Scenario Security / Registration Codes | Scenario/Scripts | Inspect registration/security-related scripts | Legacy security field editor and compatibility warnings |
| Release Checklist | Linter/Export | Validation and export readiness panels exist | Divinity-style release checklist with Realmz compatibility gates |
| Realmz Win95/98/NT4, FAQ, What's New, License | Docs | Reference only | No editor feature work unless scenario compatibility demands it |

## Scripts V1 Contract

Scripts are the first parity milestone because they drive most scenario behavior. Providence now keeps raw Realmz CODE/ID slots visible while adding guided authoring:

- Action Point and macro lifecycle: create, duplicate, rename, move, delete.
- Slot lifecycle: apply, clear, duplicate, and swap between adjacent slots.
- Opcode authoring: category browser, search, descriptions, raw CODE/ID controls.
- Target authoring: semantic pickers for messages, sounds, pictures, encounters, shops, treasures, maps, monsters, quest flags, and macros where decoded targets exist.
- EDCD authoring: create/update/delete rows with named fields for known shapes.
- Compatibility diagnostics: unknown opcode, missing target, missing/malformed EDCD, missing decoded EDCD targets, dangling macro, duplicate/out-of-range slot, invalid coordinate, and unusual chance values.
- Data ED3 policy: reachable rows become callable macros; non-reachable rows stay visible in ED3 Evidence until duplicated/promoted or proven reachable by source-backed links.
- Dispatcher policy: active nonzero CODE values ignored by `newland.c` are reported as dispatcher no-ops, not unsupported behavior.

## Scripts V2 Contract

Scripts V2 adds target record authoring around the script workbench. The implementation deliberately borrows Adventure Engine's visual scripting ergonomics, especially grouped step catalogs, ordered step lists, selected-step detail forms, typed target pickers, docked/floating detail surfaces, and inline per-field diagnostics. Providence keeps Realmz as the canonical runtime: descriptors map visual steps onto `CODE`, `ID`, optional `EDCD`, trigger headers, and fixed scenario target files.

New writable target families:

- `Data SD2`: message records.
- `Data BD`: battle shells.
- `Data TD`: treasure shells.
- `Data SD`: shop shells.
- `Data ED`: simple encounter shells.
- `Data ED2`: complex encounter shells.

See `docs/scripts-v2-authoring.md` for the author-facing workflow, including Action Point capacity, deletion-as-clear, focused/floating layout, macros vs ED3 evidence, EDCD-backed target creation, diagnostics smokes, and preserved imported bytes.

## Maps V4 Contract

Maps now follows the Divinity mental model that terrain tiles, special land tiles, icon-backed values, and raw used values are all placeable Realmz map-field values. The Paint palette is the single authoring surface for those values:

- `Landlook Tiles`: standard atlas-backed land or dungeon tiles.
- `Special / Icons`: negative `cicn`/special land values from project assets, library evidence, icon resources, and values already used by the current map.
- `Used In This Map`: every raw value present on the current level.
- `Attributes`: decoded metadata groups where Providence has source-backed evidence.
- `Raw / Advanced`: compatibility values and map-used values outside the visible atlas range.

The current source-backed tile attribute layer is split deliberately. Standard positive land tiles use landlook `mapstats` from Realmz `* BD` files for movement sound, movement cost, solidity, shore/path behavior, boat/water requirements, LOS blocking, fly/float script flags, and combat/forest hints. Scenario `Data Solids` is retained as the special negative/icon tile solidity table for raw values like `-35` or `-223`; it is not the full Divinity Standard Land Tile Editor table. The documentation section can link to these anchors: `#maps-v4-contract`, `#compatibility-rules`, `#tile-values`, `#special-land-tiles`, `#tile-attributes`, and the local source evidence in `F:\Realmz Scenario Utility\docs\scenario-format`.

## Compatibility Rules

- Realmz remains authoritative. Providence must export the scenario layout Realmz already accepts.
- Imported data that is not yet safely editable must be preserved, not rewritten destructively.
- User-facing edit controls should exist only where Providence has a typed command path and known export behavior.
- Raw fields stay visible for expert auditing, but normal authoring should prefer guided controls and validation.

## Next Milestones

1. Finish opcode-specific forms for media, teleport/map mutation, branches/macros, quest flags, and higher-order EDCD actions.
2. Add scenario startup and blank scenario creation.
3. Promote map layout, random rectangles, and dungeon flags from inspection into authoring.
4. Expand target record shells into full record editors for monsters, items, spells, races, castes, assets, and release/security metadata.
