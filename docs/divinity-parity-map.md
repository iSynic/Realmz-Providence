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
| Scenario Startup Information | Scenario | Author marker/main startup shell, Data CI contact info, and optional Data RI party restrictions; preserve legacy security segments | Blank scenario resource defaults and release/security workflow |
| Action Points / GOSUBs | Action Point Hub | Author Action Points, callable/reachable macros, CODE/ID slots, EDCD rows, reordering, duplication, deletion, and inline diagnostics; preserve non-reachable ED3 rows as evidence | Broader opcode-specific forms and richer branch visualizations |
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
| Item Editor | Economy | Browse built-in item families and imported scenario `Data NI` special items; item pickers now distinguish scenario items from Realmz library items | Full 900-999 custom item editor, including names/descriptions/icons |
| Adding Monster & Item Icons | Assets | Import managed picture/icon/sound assets; preview resource forks | Icon assignment to monster/item records |
| Creating Special Land Tiles | Assets/Maps | Import, preview, place, validate, and preserve special land/icon tiles as negative Realmz field values | Special tile asset creation/editing |
| Pictures & Sounds | Assets/Strings/Action Point Hub | Managed scenario assets, Realmz library resources, Divinity/UI reference assets, target picker for PICT/snd actions | Resource ID conflict resolution and richer previews |
| Standard Land Tile Editor | Assets/Maps | Full current-landlook atlas browser, per-tile property inspector, paint-from-inspector action, and decoded attribute grouping from landlook `mapstats`; `Data Solids` remains special/icon solidity evidence | Tile-attribute writing remains future work |
| Spell Editor | Rules | Scenario `Data Spell` override records are parsed into a source-backed editor for the 30 runtime bytes, with metadata-only names/descriptions and shared catalog reference | Decode exact resource/name packaging and richer spell validation |
| Race Editor | Rules | Scenario `Data Race` overrides are parsed into editable source-backed fields for stats, age bands, caste permissions, item usability, descriptors, and conditions | Resource-fork names and remaining Divinity binary label checks |
| Caste Editor | Rules | Scenario `Data Caste` overrides are parsed into editable source-backed matrices for stats, spellcasting, progression, item usability, conditions, and starting items | Finish Divinity label/order archaeology for advanced matrices |
| Text Import / Export / Spell Checking | Strings | Author `Data SD2` message records and `Data OD` two-choice option labels from script context, validate classic byte limits, preserve imported bytes, search/find occurrences, export/import plain text spell-check files, and find long strings for cleanup | Divinity string sound-field archaeology |
| Scenario Security / Registration Codes | Scenario/Scripts | Preserve marker/main registration code segments and inspect registration/security scripts | Legacy security field editor and compatibility warnings |
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

## Scenario Authoring Contract

The Scenario tool is now an authoring-first workbench for the source-backed files Realmz checks before first play:

- Marker/main scenario file: recommended party level, maximum party level, startup land level, startup X/Y view coordinates, creator/user check string, preserved registration/security code segments, and preserved trailing bytes.
- `Data CI`: editable contact and release-facing strings, using the eighteen fixed Str255 fields documented by the scenario shell evidence card.
- `Data RI`: optional party restriction record for maximum party characters, maximum candidate level, banned race IDs, banned caste IDs, and restriction message.
- Load readiness: checks the marker shell, Scenario resource fork, startup land/coordinates, and first-start authored outdoor files.

Blank scenario creation is still a later slice because minimum resource-fork defaults and release/security UI behavior need more Divinity binary or fixture evidence. Imported marker/code bytes remain preserved unless Providence owns the edited field.

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

## Strings And Assets Contract

The Strings workbench now follows Divinity's one-record-at-a-time flow while keeping a searchable list optional. It supports previous/next navigation, Go To String, find first/next occurrence, create, duplicate, clear, byte-limit validation, export/import plain text spell-check files using Divinity-style separators, find-long-string cleanup, and links back to known uses. The adjacent Option Labels tab authors two-choice labels from `Data OD` with the 24-byte classic text limit, duplicate/clear/create controls, and usage links from player-option script rows. `TEXT`, `STR#`, and style resources remain readable references with a back path from detail view.

The Divinity Strings screenshot shows a `Sound` field, but Providence does not expose that as an editable message field until Realmz source, scenario data, or Divinity binary evidence proves where it is stored and how Realmz consumes it.

Assets are split by authoring role rather than raw resource inventory. `Scenario Assets` are project-owned resources that Providence can import, replace, rename, delete, and export. Divinity's picture/sound authoring flow reserves scenario picture PICT IDs `30000..30128` with `30128` as the title picture, and custom scenario sounds use `snd ` IDs `200..500`. `Realmz Library` is built-in runtime/reference material. `Divinity Reference` includes editor/manual/UI resources and should not appear as placeable scenario art unless it is also a valid Realmz resource target. `Advanced Inventory` remains available for raw resource browsing.

## Next Milestones

1. Finish opcode-specific forms for media, teleport/map mutation, branches/macros, quest flags, and higher-order EDCD actions.
2. Add blank scenario resource defaults and release/security checklist authoring.
3. Promote map layout and deeper dungeon flags from inspection into authoring.
4. Expand target record shells into full record editors for monsters, items, spells, races, castes, assets, and release/security metadata.
