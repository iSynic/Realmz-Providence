pub(super) const READS: &[(&str, &str, &str)] = &[
    (
        "special-land-solidity.preview",
        "Review one explicit 1024-byte Data Solids table before initializing absent scenario collision rules. Existing rules cannot be replaced by this workflow.",
        "path",
    ),
    (
        "land-cell.open",
        "Read a Land cell's native secret and special-art passability state. Shared solidity changes affect every placement of the same resource; this does not calculate party reachability.",
        "identity x:integer y:integer offset:integer?",
    ),
    (
        "land-cell.preview",
        "Preview a secret, special-art solidity or placement removal through the native cell planner. Inspect every affected-map page before committing shared solidity.",
        "identity edit:object offset:integer?",
    ),
    (
        "smart-terrain.open",
        "Inspect reviewed Smart Terrain families for the exact resolved atlas. Missing custom-art mappings remain unavailable.",
        "identity",
    ),
    (
        "smart-terrain.reshape",
        "Calculate fill/grow/shrink/clear of a bounded selection mask without changing the map.",
        "identity mask:array operation",
    ),
    (
        "smart-terrain.preview",
        "Preview native Smart Terrain, including neighbor changes, protected cells and unresolved artwork. Preserve the exact atlas and mapping revisions.",
        "identity intent:object",
    ),
    (
        "random-region.open",
        "Read a native random-region slot and the twenty-slot precedence inventory. Slots are 0–19; Right and Bottom are exclusive edges. Presence is not runtime eligibility.",
        "mapIdentity slot:integer",
    ),
    (
        "random-region.preview",
        "Validate a random region through the native planner and reference checks. Overlaps report the higher-priority native slot; imported unchanged residue remains preserved.",
        "mapIdentity region:object",
    ),
    (
        "paint-resources.list",
        "Browse local and built-in palettes/stamps for this map, including exact availability reasons. Local resource edits are separate from project Undo.",
        "identity query? kind? scope? offset:integer? limit:integer?",
    ),
    (
        "paint-resources.open",
        "Read one exact stamp/palette and its native geometry, cells and availability before placement.",
        "identity resourceIdentity",
    ),
    (
        "map-stamp.preview",
        "Preview a catalog stamp at an origin through native marker/feature preservation. Local stamps require the returned resourceRevision; missing artwork is not inferred.",
        "identity resourceIdentity resourceRevision:integer? origin:object",
    ),
    (
        "monster-appearance.list",
        "Browse exact Monster base/facing artwork pairs and availability. Use a resolved pair's native iconId rather than inventing resource numbers.",
        "query? offset:integer? limit:integer?",
    ),
    (
        "monster-appearance.open",
        "Inspect a bounded base/facing artwork pair through scenario-before-application resolution. Image blocks retain exact resource identities in structured metadata.",
        "iconId:integer",
    ),
    (
        "rule.catalog",
        "Browse Race or Caste ownership, available custom slots and explicit rule-source selection. Author numbers are 0–29; classicId and canonical identities remain 1–30.",
        "kind source? scope? query?",
    ),
    (
        "rule.open-authoring",
        "Read a complete native Race/Caste draft, reciprocal eligibility, copy provenance and ownership. Stock/reference definitions are read-only.",
        "kind classicId:integer source?",
    ),
    (
        "rule.used-by",
        "Page through exact owning fields referencing a Race or Caste. Each page contains at most 64 uses.",
        "kind classicId:integer offset:integer?",
    ),
    (
        "rule.allocation.review",
        "Allocate a vacant custom Race/Caste identity through native ownership and incoming-use checks. Optionally copy an exact reviewed source; no existing slot is replaced.",
        "kind destinationClassicId:integer? copySource:object?",
    ),
    (
        "rule.clear.review",
        "Prepare a scenario-owned Race/Caste reset and inspect its incoming uses. Stock rows are protected and the native identity is retained.",
        "kind classicId:integer",
    ),
    (
        "rule.draft.prepare",
        "Validate a complete Race/Caste draft, native geometry, current family/library provenance, references and reciprocal eligibility without applying it.",
        "draft:object",
    ),
    (
        "level-settings.open",
        "Inspect a level's editable name, darkness, line of sight and renderer choices. Source metadata and random regions are not editable through this form.",
        "identity",
    ),
    (
        "level-settings.artwork",
        "Preview a supported Landlook through exact scenario-before-application artwork resolution. Unavailable custom artwork is not inferred.",
        "identity landlook:integer",
    ),
    (
        "level-settings.preview",
        "Review named level settings without changing the project. Page through all affected levels before changing a shared Custom Landlook erase tile.",
        "identity edit:object offset:integer?",
    ),
    (
        "scenario-startup.validate",
        "Validate startup fields, the native marker filename and an existing Land start without applying changes.",
        "startup:object",
    ),
    (
        "scenario-contact.validate",
        "Validate the native Data CI fields and MacRoman byte limits without applying changes.",
        "contact:object",
    ),
    (
        "scenario-restrictions.validate",
        "Validate native party restrictions and reference numbering without applying changes.",
        "restrictions:object",
    ),
    (
        "item.draft.prepare",
        "Validate the exact item draft and inspect text-byte feedback, field changes and native effects without applying it.",
        "draft:object",
    ),
    (
        "item.clear.review",
        "Prepare an item reset with incoming uses. Clearing retains the native identity; apply its returned draft to commit.",
        "recordIndex:integer",
    ),
    (
        "player-map.list",
        "List Player Maps and the next native slot. Author-facing numbers are native IDs plus one; at most twenty maps are addressable.",
        "offset:integer? limit:integer?",
    ),
    (
        "player-map.open",
        "Read a Player Map, its exact resource references and available/unavailable names. Preserve all ten marker slots when editing.",
        "identity",
    ),
    (
        "player-map.validate",
        "Validate a Player Map draft at this revision without applying it. Notes and names use native MacRoman limits; validation does not prove runtime visibility.",
        "playerMap:object names:object?",
    ),
    (
        "monster.allocate",
        "Allocate a positive unused Monster ID and reviewed Create operation. Retained inactive rows, descriptions and other difficulty sets remain reserved. Commit the returned operation and reviewHash.",
        "setId:integer",
    ),
    (
        "spell.catalog",
        "Browse Stock and Custom spells with packed Classic numbers and exact copy provenance. Stock definitions are read-only.",
        "class:integer? level:integer? query? showUnused:boolean? offset:integer? limit:integer?",
    ),
    (
        "spell.open-authoring",
        "Read a spell's authoring document and exact copy source. Custom spell numbers differ from Data Spell record indices.",
        "identity",
    ),
    (
        "spell.allocation.review",
        "Allocate a vacant Custom spell without replacing names, retained bytes or callers. Copying requires the source document's exact provenance.",
        "destinationRecordIndex:integer? copySource:object?",
    ),
    (
        "spell.clear.review",
        "Prepare a Custom spell reset and inspect its incoming uses. The native identity is retained; apply the returned draft to commit.",
        "recordIndex:integer",
    ),
    (
        "spell.draft.prepare",
        "Validate a complete native Custom spell draft without applying it.",
        "draft:object",
    ),
    (
        "text.allocate",
        "Ask the native allocator for the next available Message or Option Label number. This reads availability; commit still checks that the slot is free.",
        "family?",
    ),
    (
        "option-label.list",
        "List native Option Labels with stable identities.",
        "query? offset:integer? limit:integer?",
    ),
    (
        "option-label.open",
        "Read an Option Label and typed uses.",
        "nativeId:integer",
    ),
    (
        "global-macro.open",
        "Read the five native global hooks and assigned XAP steps.",
        "",
    ),
    (
        "global-macro.catalog",
        "Browse XAP targets for global hook assignments; zero means unassigned.",
        "search? filter? currentValue:integer? showUnavailable:boolean? offset:integer? limit:integer?",
    ),
    (
        "encounter.list-simple",
        "List Simple Encounters and their native identities.",
        "offset:integer? limit:integer?",
    ),
    (
        "encounter.list-complex",
        "List Complex Encounters and their native identities.",
        "offset:integer? limit:integer?",
    ),
    (
        "encounter.list-rogue",
        "List Rogue Encounters and their native identities.",
        "query? offset:integer? limit:integer?",
    ),
    (
        "encounter.list-timed",
        "List Timed Encounters; scheduler eligibility is a separate runtime question.",
        "query? offset:integer? limit:integer?",
    ),
    (
        "encounter.open-rogue",
        "Read a Rogue Encounter with its explicit caller context.",
        "identity",
    ),
    (
        "encounter.open-timed",
        "Read a Timed Encounter's scheduler conditions and target.",
        "identity",
    ),
    (
        "encounter.prepare-create",
        "Review a Rogue or Timed Encounter allocation and defaults; optionally copy an existing encounter of that kind.",
        "kind source?",
    ),
    (
        "monster.operation.prepare",
        "Review monster record operations and references.",
        "operation:object section? offset:integer? limit:integer?",
    ),
    (
        "reference.used-by",
        "Find typed incoming references.",
        "targetKind targetId offset:integer? limit:integer?",
    ),
    ("land-layout.open", "Read Land adjacency.", ""),
    (
        "dungeon-cell.open",
        "Read dungeon collision and directional entry.",
        "identity x:integer y:integer",
    ),
    (
        "dungeon-cell.preview-features",
        "Preview dungeon features without replacing other native bits.",
        "identity edit:object",
    ),
    (
        "record.list",
        "List native records with stable identities.",
        "recordType? nativePath? query? offset:integer? limit:integer?",
    ),
    (
        "record.open",
        "Read a native record and its typed references.",
        "identity",
    ),
    (
        "discovery.search",
        "Search scenario, stock or documentation catalogs.",
        "query? kind? scope? offset:integer? limit:integer?",
    ),
    (
        "discovery.preview",
        "Read a discovery target without changing the project.",
        "identity scope? query?",
    ),
    (
        "discovery.links",
        "Read derived typed links. Links do not establish execution order.",
        "direction kind? id? identity? scope? query? offset:integer? limit:integer?",
    ),
    (
        "discovery.trace",
        "Trace ordered calls with caller context, cycle detection and bounded work.",
        "kind id offset:integer? limit:integer? depthLimit:integer? query? batchToken? advanceWork:boolean? identity? scope? ancestors:array? requiredPosition:integer? ancestorPositions:array? ancestorContexts:array? callerContext?",
    ),
    (
        "discovery.flow",
        "Query a derived Flow graph; truncation is not complete coverage or party reachability.",
        "root:object direction? depth:integer? categories:array? cursor?",
    ),
    (
        "discovery.flow-summaries",
        "Summarize up to 64 selected Flow nodes.",
        "selections:array",
    ),
    (
        "quest.flow",
        "Find quest checks or changes; shared variables do not establish execution order.",
        "id:integer role query? offset:integer? limit:integer?",
    ),
    (
        "action-definition.list",
        "List source-supported opcodes and operand semantics.",
        "cursor? limit:integer?",
    ),
    (
        "action-form.describe",
        "Describe opcode fields, caller-specific settings and signed-reference behavior. Use referenceBehavior.selectionMultiplier with a chosen target value to retain behavior; toggleValue is the exact alternative when available. Raw signed values remain authoritative.",
        "query:object",
    ),
    (
        "action-form.shared-impact",
        "Inspect all callers before changing shared Extra Code.",
        "query:object",
    ),
    (
        "action-target.list",
        "List valid native targets for an instruction and map context. Combine a selected value with the form field's referenceBehavior.selectionMultiplier to retain signed-reference behavior. Cursor pages require the same expected revision and query conditions.",
        "query:object",
    ),
    (
        "map.catalog",
        "List Land and Dungeon maps.",
        "levelType? query? offset:integer? limit:integer?",
    ),
    (
        "map.region",
        "Read at most 32×32 native cells with coordinate and AP activation facts.",
        "identity x:integer y:integer width:integer height:integer",
    ),
    (
        "map.thumbnail",
        "Render an existing Land map through the native artwork resolver; unavailable resources remain explicit.",
        "identity",
    ),
    (
        "map.region-preview",
        "Render up to 32×32 editor cells with exact artwork, coordinates and authored AP overlays. This is not player discovery or party eligibility.",
        "identity x:integer y:integer width:integer height:integer",
    ),
    (
        "map.tile-catalog",
        "List resolved tiles and native artwork identities.",
        "identity query? offset:integer? limit:integer?",
    ),
    (
        "map.paint-options",
        "Read safe painting and erase availability.",
        "identity",
    ),
    (
        "map.preview-intent",
        "Preview semantic painting while preserving protected map features.",
        "identity intent:object",
    ),
    (
        "magic-brush.open",
        "Read reviewed terrain and connection-family availability.",
        "identity",
    ),
    (
        "magic-brush.preview",
        "Preview Magic terrain, road and wall connections.",
        "identity intent:object",
    ),
    (
        "action-point.list",
        "List APs including authored initial activation state; no party eligibility is implied.",
        "mapIdentity search? filter? activationFilters:object? offset:integer? limit:integer?",
    ),
    (
        "action-point.open",
        "Read an AP, its ordered instructions and activation links.",
        "identity",
    ),
    (
        "encounter.open-simple",
        "Read Simple Encounter choices and result programs.",
        "identity",
    ),
    (
        "encounter.open-complex",
        "Read Complex Encounter conditions and result programs.",
        "identity",
    ),
    (
        "message.list",
        "List scenario messages.",
        "query? offset:integer? limit:integer?",
    ),
    (
        "message.open",
        "Read exact canonical message text.",
        "nativeId:integer",
    ),
    (
        "validation.list",
        "Read paginated diagnostics with owning fields. Defaults to actionable findings; showAll includes retained details. An empty actionable page does not certify export readiness.",
        "offset:integer? limit:integer? severity? query? showAll:boolean?",
    ),
    (
        "project.inspect-rebuilt-readiness",
        "Inspect readiness using the paired application support.",
        "",
    ),
    (
        "scenario-contact.open",
        "Read scenario contact metadata.",
        "",
    ),
    (
        "scenario-startup.open",
        "Read startup instructions and state.",
        "",
    ),
    ("scenario-restrictions.open", "Read party restrictions.", ""),
    (
        "quest.list",
        "List native quest slots and documentation labels.",
        "query? offset:integer? limit:integer?",
    ),
    (
        "quest.open",
        "Read quest checks, changes and label.",
        "id:integer",
    ),
    (
        "extra-action-point.list",
        "List reusable XAP programs.",
        "search? filter? offset:integer? limit:integer?",
    ),
    (
        "extra-action-point.open",
        "Read a reusable XAP and its callers.",
        "identity",
    ),
    (
        "monster.catalog",
        "List monster sets and records.",
        "setId:integer query? offset:integer? limit:integer?",
    ),
    (
        "monster.open",
        "Read a monster and its native draft.",
        "setId:integer nativeId:integer",
    ),
    (
        "monster.uses",
        "Find monster references before editing or removal.",
        "setId:integer nativeId:integer",
    ),
    (
        "monster.draft.prepare",
        "Validate a typed monster draft and its field changes.",
        "draft:object",
    ),
    (
        "battle.list",
        "List battle definitions.",
        "search? offset:integer? limit:integer?",
    ),
    (
        "battle.open",
        "Read battle placements and hooks.",
        "nativeId:integer",
    ),
    (
        "battle.allocate",
        "Review a free battle identity and deterministic template.",
        "sourceId:integer?",
    ),
    (
        "battle.clear.prepare",
        "Review a battle reset and its incoming uses; the existing identity is retained. Apply the reviewed battle draft to commit.",
        "nativeId:integer",
    ),
    (
        "battle.draft.prepare",
        "Validate a battle draft without applying it.",
        "battle:object",
    ),
    (
        "treasure.list",
        "List rewards and the next available native ID.",
        "offset:integer? limit:integer?",
    ),
    (
        "treasure.open",
        "Read a treasure reward and item references.",
        "nativeId:integer",
    ),
    (
        "shop.list",
        "List shops and available identities.",
        "offset:integer? limit:integer?",
    ),
    (
        "shop.open",
        "Read a shop and its item references.",
        "nativeId:integer",
    ),
    (
        "item.list",
        "List scenario and stock item records.",
        "scope? category? query? offset:integer? limit:integer?",
    ),
    (
        "item.open",
        "Read item mechanics and native draft.",
        "identity",
    ),
    (
        "item.allocation.review",
        "Review an item allocation or copy using native guards.",
        "destinationRecordIndex:integer? copySource:object?",
    ),
    (
        "spell.list",
        "List scenario spells.",
        "offset:integer? limit:integer?",
    ),
    (
        "spell.open",
        "Read a scenario spell by Data Spell record index, distinct from its Classic spell number.",
        "recordIndex:integer",
    ),
    (
        "race-rule.list",
        "List race rules; author numbers are zero-based.",
        "offset:integer? limit:integer?",
    ),
    (
        "race-rule.open",
        "Read a race rule using its stable identity.",
        "identity",
    ),
    (
        "caste-rule.list",
        "List caste rules; author numbers are zero-based.",
        "offset:integer? limit:integer?",
    ),
    (
        "caste-rule.open",
        "Read a caste rule using its stable identity.",
        "identity",
    ),
    (
        "validation.begin",
        "Start validation against the captured revision.",
        "offset:integer? limit:integer? severity? query? showAll:boolean?",
    ),
    (
        "validation.poll",
        "Poll a validation job; outdated results retain their captured revision.",
        "jobId:integer",
    ),
    (
        "validation.cancel",
        "Cancel the selected validation job.",
        "jobId:integer",
    ),
    (
        "readiness.begin",
        "Start Classic or Rebuilt readiness evaluation.",
        "target",
    ),
    (
        "readiness.poll",
        "Poll a captured readiness evaluation.",
        "jobId:integer",
    ),
    (
        "readiness.cancel",
        "Cancel the selected readiness evaluation.",
        "jobId:integer",
    ),
    (
        "project.inspect-classic-plan",
        "Inspect Classic output without publishing files.",
        "offset:integer? limit:integer?",
    ),
    (
        "project.inspect-rebuilt-package",
        "Inspect current v6 package output using explicit support.",
        "minimumEngineVersion offset:integer? limit:integer? packageFinalization:object?",
    ),
];
