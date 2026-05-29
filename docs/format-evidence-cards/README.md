# Format Evidence Cards

These cards are the working archaeology backlog for Providence editor coverage. Each card should stay focused on one authoring unlock and should avoid claiming writer support until byte layout, runtime meaning, validation behavior, and export ownership are classified.

## Cards

- `scenario-shell-startup-release.md`: blank scenario creation, startup metadata, restrictions, contact/release/security evidence.
- `scenario-startup-runtime-anchors.md`: source-backed marker/main startup file layout, `Data CI`, first-start source files, and blank scenario validation rules.
- `scenario-party-restrictions-runtime-anchors.md`: source-backed `Data RI` party restriction layout, runtime race/caste/level/party-count gates, and Scenario tool follow-up.
- `map-tile-intelligence.md`: tile attributes, `Data Solids`, landlook behavior, special/icon values, movement and LOS metadata.
- `map-tile-runtime-anchors.md`: source-backed runtime split between landlook `mapstats` and special negative `Data Solids`.
- `map-field-value-runtime-anchors.md`: source-backed raw outdoor map field-value layers: terrain, negative icons, positive state bands, note/path bits, and secret/action normalization.
- `random-level-runtime-anchors.md`: source-backed `Data RD`/`Data RDD` random-level layout, random rectangle runtime checks, extra AP one-shot behavior, and map flag semantics.
- `outdoor-visibility-runtime-anchors.md`: source-backed split between authored dark/LOS flags and generated outdoor `site[90][90]` exploration cache.
- `dungeon-geometry-interaction-bits.md`: dungeon walls, doors, secrets, stairs, movement constraints, and render bits.
- `dungeon-runtime-anchors.md`: source-backed dungeon bitfield masks, runtime consumers, and first safe authoring candidates.
- `core-records-full-construction.md`: monsters, items, spells, races, castes, battles, treasure, shops, encounters, and map notes.
- `core-rules-record-runtime-anchors.md`: scenario-authored records vs shared/override rules-library records and editor dependency order.
- `rules-spell-race-caste-runtime-anchors.md`: source-backed spell/race/caste layouts, shared-vs-scenario override behavior, packed spell IDs, and Rules tool parser debt.
- `monster-record-runtime-anchors.md`: source-backed `Data MD` monster template layout, bestiary cache generation, battle placement, spawn/add-ally use, and death macro hooks.
- `battle-record-runtime-anchors.md`: source-backed `Data BD` 13x13 monster grid, before/after messages, combat distance, and battle macro behavior.
- `map-record-runtime-anchors.md`: source-backed `Data MD2` map records, map notes, preview starts, picture-backed views, and embedded icon markers.
- `item-treasure-shop-runtime-anchors.md`: shared item-library ID families, source-backed `Data TD` treasure records, source-backed `Data SD` shop records, and runtime `CS` shop-cache mutation.
- `encounter-record-runtime-anchors.md`: source-backed simple/complex encounter headers, runtime `CE`/`CE2` cache split, action rows, prompts, inline buffers, and complex spell/item/thief/word/action outcomes.
- `thief-timed-encounter-runtime-anchors.md`: source-backed `Data TD2` thief/rogue encounters, `Data TD3` timed encounters, runtime `CT`/`CTD3` cache mutation, and save-state split.
- `text-message-runtime-anchors.md`: central `Data SD2` message records, encounter inline display buffers, prompt pickers, and text validation.
- `scripts-runtime-state-semantics.md`: opcodes, EDCD, ED3 reachability, global macros, random/timed dispatch, and runtime cache separation.
- `action-point-extra-ap-storage-reachability.md`: Action Point, Extra Action Point, Macro/GOSUB, and ED3 reachability terminology and promotion rules.
- `strings-data-od-string-sound.md`: Divinity Strings editor, `Data SD2`, `Data OD`, text import/export, and unresolved String Sound field.
- `custom-landlook-writers.md`: Divinity Edit Land Tiles, custom landlook files, `mapstats`, combat build grids, and writer gate.
- `dungeon-editor-writer-safety.md`: Dungeon Editor authoring safety gates for walls, doors, stairs, secrets, and Action Point integration.
- `resource-fork-taxonomy-authoring.md`: resource fork taxonomy across scenario-owned, Realmz library, Divinity reference, and UI-only assets.
- `runtime-caches-vs-authored-source.md`: generated/runtime cache classification and UI/export policy.
- `scenario-music-and-format-files.md`: scenario-local custom music modules and zero-byte `Format` compatibility marker files.
- `global-macro-runtime-anchors.md`: source-backed `Global` hook slots for scenario start, party death, end/quit, shop, and temple macro dispatch.
- `resource-authoring.md`: `PICT`, `cicn`, `snd `, `STR#`, `TEXT`, `styl`, `RLMZ`, shared fallback, and resource writing.
- `resource-icon-runtime-anchors.md`: source-backed negative map field rendering through base terrain plus normalized `cicn` icons.

## Update Rules

- Add Realmz source anchors before adding editor controls.
- Add Divinity manual, binary, or screenshot evidence before matching Divinity labels/defaults.
- Add corpus examples before deciding a rare field is safe to hide.
- Add writer fixtures before changing export behavior.
- Mark unknown bytes as preserved until ownership is proven.
