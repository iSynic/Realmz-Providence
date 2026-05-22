# Divinity Parity Map

Providence treats Divinity Manual 7.0 as the feature coverage reference, but the product goal is not to clone Divinity screen-for-screen. The editor should expose the same Realmz scenario authoring power through modern, guided workflows while exporting scenario folders that Realmz already accepts.

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
| Land Editor / Land Layout | Maps | Author tile painting and Action Point placement; inspect map layout evidence | Land layout/start records, map-level flags, random rectangle authoring |
| Scenario Startup Information | Scenario | Inspect scenario/contact/startup records where decoded | User-facing startup editor and typed scenario commands |
| Action Points / GOSUBs | Scripts | Author Action Points, macros, CODE/ID slots, EDCD rows, reordering, duplication, deletion, and inline diagnostics | Broader opcode-specific forms and richer branch visualizations |
| Scripting Codes 1-29 | Scripts | Guided opcode picker with descriptions, target picker, EDCD shape hints | Complete manual-derived notes and opcode examples |
| Scripting Codes 30-59 | Scripts | Guided opcode picker with descriptions, target picker, EDCD shape hints | Complete manual-derived notes and opcode examples |
| Scripting Codes 60-89 | Scripts | Guided opcode picker with descriptions, target picker, EDCD shape hints | Complete manual-derived notes and opcode examples |
| Scripting Codes 90-End | Scripts | Guided opcode picker with descriptions, target picker, EDCD shape hints | Complete manual-derived notes and opcode examples |
| HUB | Workbench | Modern domain rail replaces Divinity HUB | Add explicit Divinity chapter cross-reference affordance |
| Battle Editor | Combat | Inspect battle records and links | Battle record forms and export writer support |
| Monster Editor | Combat | Inspect monster records and resource links | Monster record forms and icon assignment |
| Monster Scrapbook | Combat/Library | Inspect library catalog entries | Copy/adapt scrapbook entries into scenario records |
| Treasure Editor | Economy | Inspect treasure records and links | Treasure form, item reward picker, gold/reward validation |
| Item Editor | Economy | Inspect item references | Item form and export writer support |
| Shop Editor | Economy | Inspect shop records and script links | Shop inventory/pricing editor |
| Simple Encounter Editor | Encounters | Inspect simple encounters and action links | Simple encounter form and validation |
| Complex Encounter Editor | Encounters | Inspect complex encounters and action links | Complex encounter branch editor |
| Rogue Encounter Editor | Encounters | Inspect thief/rogue encounter records | Rogue encounter form |
| Time Encounter Editor | Encounters | Inspect timed encounters | Timed encounter schedule editor |
| Map Editor | Maps | Inspect map records and map links | Map note/start authoring |
| Dungeon Editor | Maps | Inspect dungeon levels, render profiles, LOS/darkness evidence | Dungeon geometry and flag authoring |
| Macros / Quests | Scripts | Author macros and quest flag script links; validate missing targets | Dedicated quest registry and macro graph view |
| Monster Mash | Combat/Library | Inspect shared monster icon material | Scenario icon import/copy workflow |
| Vault of Arcana | Economy/Library | Inspect shared item/icon material | Copy/adapt vault entries into scenario records |
| Adding Monster & Item Icons | Assets | Import managed picture/icon/sound assets; preview resource forks | Icon assignment to monster/item records |
| Creating Special Land Tiles | Assets/Maps | Import special land tile assets and negative cicn IDs | Special tile placement and release validation |
| Pictures & Sounds | Assets/Text/Scripts | Managed assets, target picker for PICT/snd actions | Resource ID conflict resolution and richer previews |
| Standard Land Tile Editor | Assets/Maps | Inspect/render standard tilesets | Tile atlas editing remains future work |
| Spell Editor | Rules | Inspect spells and references | Spell record form and validation |
| Race Editor | Rules | Inspect races and references | Race record form and restriction integration |
| Caste Editor | Rules | Inspect castes and references | Caste record form and restriction integration |
| Text Import / Export / Spell Checking | Text | Inspect text resources and messages | Message editor, text import/export, spell-check workflow |
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
- Compatibility diagnostics: unknown opcode, missing target, missing/malformed EDCD, dangling macro, duplicate/out-of-range slot, invalid coordinate, and unusual chance values.

## Compatibility Rules

- Realmz remains authoritative. Providence must export the scenario layout Realmz already accepts.
- Imported data that is not yet safely editable must be preserved, not rewritten destructively.
- User-facing edit controls should exist only where Providence has a typed command path and known export behavior.
- Raw fields stay visible for expert auditing, but normal authoring should prefer guided controls and validation.

## Next Milestones

1. Finish opcode-specific forms for the highest-use scripting families: messages/media, teleport/map mutation, branches/macros, quest flags, battle/encounter starts, treasure/shop actions.
2. Add scenario startup and blank scenario creation.
3. Promote map layout, random rectangles, and dungeon flags from inspection into authoring.
4. Build record editors for encounters, combat, economy, rules, text, and assets in that order.
