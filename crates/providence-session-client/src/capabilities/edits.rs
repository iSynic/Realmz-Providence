pub(super) const EDITS: &[(&str, &str, &str)] = &[
    (
        "terrain-generation.apply",
        "Apply the exact successful reviewed terrain preview as one shared Undo entry. Revision, artwork, mapping and review hash must still match.",
        "identity intent:object reviewHash",
    ),
    (
        "special-land-solidity.initialize",
        "Initialize an absent Special Land collision table from an exact reviewed Data Solids source. Retain its source blob; use ordinary per-resource edits for subsequent changes. One shared Undo entry, without creating an imported-project annex.",
        "path expectedSha256",
    ),
    (
        "land-cell.apply",
        "Apply an exact reviewed Land secret/passability/placement edit through the native encoder. Record-only AP edits do not create a tile marker.",
        "identity edit:object",
    ),
    (
        "smart-terrain.apply",
        "Stage reviewed native Smart Terrain atomically with its exact atlas/mapping identity and preserved unrelated native bits.",
        "identity intent:object",
    ),
    (
        "random-region.apply",
        "Create or edit the selected native random-region slot with existing reference, overlap and preservation checks.",
        "mapIdentity region:object",
    ),
    (
        "random-region.clear",
        "Remove a random-region slot through the feature command and shared project history.",
        "mapIdentity slot:integer",
    ),
    (
        "map-stamp.apply",
        "Stage a catalog stamp after native preview; preserve AP markers and protected features. Local collection changes remain outside this project transaction.",
        "identity resourceIdentity resourceRevision:integer? origin:object",
    ),
    (
        "rule.draft.apply",
        "Apply an allocated, copied or edited scenario Race/Caste draft through native preservation and reciprocal-eligibility guards. Retain family/copy guards. Names and notes are project labels (1024/16384 UTF-8 bytes); saved fields do not imply runtime support.",
        "draft:object",
    ),
    (
        "player-map.create",
        "Allocate the next available Player Map through the native command. Do not invent or reuse a retained native identity.",
        "",
    ),
    (
        "player-map.apply-draft",
        "Apply a Player Map and optional name pair together through native validation and preservation. One shared Undo entry; identity stays fixed.",
        "playerMap:object names:object?",
    ),
    (
        "spell.draft.apply",
        "Apply an allocated, copied or edited Custom spell through the native preservation and reference guards.",
        "draft:object",
    ),
    (
        "encounter.copy-simple",
        "Duplicate a Simple Encounter using the native allocator.",
        "source",
    ),
    (
        "encounter.copy-complex",
        "Duplicate a Complex Encounter using the native allocator.",
        "source",
    ),
    (
        "encounter.copy-rogue",
        "Duplicate a Rogue Encounter using the native allocator.",
        "source",
    ),
    (
        "encounter.copy-timed",
        "Duplicate a Timed Encounter using the native allocator.",
        "source",
    ),
    (
        "extra-action-point.step.move",
        "Reorder XAP instructions through the native command.",
        "source fromSlot:integer toSlot:integer",
    ),
    (
        "extra-action-point.step.duplicate",
        "Duplicate an XAP instruction with its native settings ownership.",
        "source fromSlot:integer toSlot:integer",
    ),
    (
        "extra-action-point.step.clear",
        "Clear an XAP instruction through the native command.",
        "source slot:integer",
    ),
    (
        "action-point.step.duplicate",
        "Duplicate an AP instruction with its native settings ownership.",
        "source fromSlot:integer toSlot:integer",
    ),
    (
        "monster.create",
        "Create a deterministic monster at an available native slot.",
        "setId:integer nativeId:integer",
    ),
    (
        "monster.duplicate",
        "Copy a monster through the native command.",
        "setId:integer sourceNativeId:integer targetNativeId:integer",
    ),
    (
        "monster.clear",
        "Clear a native monster record.",
        "setId:integer nativeId:integer",
    ),
    (
        "monster.operation.commit",
        "Commit an exact reviewed monster operation.",
        "operation:object reviewHash",
    ),
    (
        "monster-description.update",
        "Edit a description with native byte limits.",
        "description:object",
    ),
    (
        "reference.retarget",
        "Retarget a typed field.",
        "source field targetId",
    ),
    (
        "dungeon-cell.apply-features",
        "Apply reviewed dungeon features.",
        "identity edit:object",
    ),
    (
        "level-settings.apply",
        "Apply named level settings through the native planner. Retain source metadata, random regions and unrelated cells; shared Custom Landlook erase-tile changes name every affected level in the prepared review.",
        "identity edit:object",
    ),
    (
        "land-layout.set-cell",
        "Connect a Land map through native layout.",
        "row:integer column:integer target:nullable-string",
    ),
    (
        "message.create",
        "Create a message using an explicitly reviewed native ID.",
        "nativeId:integer text",
    ),
    (
        "message.update",
        "Edit message text with native encoding validation.",
        "identity text",
    ),
    (
        "map.create",
        "Create a deterministic Land or Dungeon map; Providence allocates its identity.",
        "levelType",
    ),
    (
        "map.duplicate",
        "Duplicate a map using the native creation operation.",
        "source",
    ),
    (
        "map.apply-intent",
        "Apply the exact semantic paint intent after reviewing its preview.",
        "identity intent:object",
    ),
    (
        "magic-brush.apply",
        "Apply reviewed terrain or line-family connections.",
        "identity intent:object",
    ),
    (
        "action-point.create",
        "Create a placed AP through the native allocator.",
        "mapIdentity x:integer y:integer",
    ),
    (
        "action-point.clear",
        "Clear an AP with native reference checks.",
        "source",
    ),
    (
        "action-point.apply-draft",
        "Apply an AP draft using native validation and field-owned writes.",
        "draft:object",
    ),
    (
        "action-point.step.apply",
        "Apply one typed instruction draft; shared settings require the native guard.",
        "edit:object",
    ),
    (
        "encounter.create-simple",
        "Create a Simple Encounter through the native allocator.",
        "",
    ),
    (
        "encounter.create-complex",
        "Create a Complex Encounter through the native allocator.",
        "",
    ),
    ("encounter.create-rogue", "Create a Rogue Encounter.", ""),
    ("encounter.create-timed", "Create a Timed Encounter.", ""),
    (
        "encounter.apply-simple-draft",
        "Apply a Simple Encounter draft preserving untouched imported fields.",
        "draft:object",
    ),
    (
        "encounter.apply-complex-draft",
        "Apply a Complex Encounter draft preserving native text and residue.",
        "draft:object",
    ),
    (
        "encounter.apply-rogue-draft",
        "Apply a Rogue Encounter draft.",
        "draft:object",
    ),
    (
        "encounter.apply-timed-draft",
        "Apply a Timed Encounter draft; scheduler eligibility remains runtime behavior.",
        "draft:object",
    ),
    (
        "history.undo",
        "Undo the current shared history entry, including another client's change.",
        "",
    ),
    ("history.redo", "Redo the current shared history entry.", ""),
    (
        "start-location.set",
        "Set the declared scenario start location.",
        "location:object",
    ),
    (
        "scenario-contact.update",
        "Apply the complete native Data CI contact form. Read campaign/contact first and retain unchanged values; every field is explicit and native provenance remains feature-owned.",
        "contact:object",
    ),
    (
        "scenario-startup.update",
        "Update startup text and native settings.",
        "startup:object",
    ),
    (
        "scenario-restrictions.update",
        "Update supported party restrictions.",
        "restrictions:object",
    ),
    (
        "quest-label.upsert",
        "Label a native quest slot without changing its executable identity.",
        "questLabel:object",
    ),
    (
        "quest-label.delete",
        "Remove a documentation label from a native quest slot.",
        "id:integer",
    ),
    (
        "action-point.duplicate",
        "Copy an AP to a reviewed map coordinate.",
        "source x:integer y:integer",
    ),
    (
        "action-point.step.move",
        "Reorder AP instructions.",
        "source fromSlot:integer toSlot:integer",
    ),
    (
        "action-point.step.clear",
        "Clear one AP instruction.",
        "source slot:integer",
    ),
    (
        "extra-action-point.create",
        "Allocate a reusable XAP at the next slot or a source-required nativeId. Existing occupied identities and certified foreign suffixes are protected. Initializing a gap is limited to 256 new rows per step.",
        "nativeId:integer?",
    ),
    (
        "extra-action-point.duplicate",
        "Duplicate a reusable XAP.",
        "source nativeId:integer?",
    ),
    (
        "extra-action-point.delete",
        "Delete a reusable XAP using native reference guards.",
        "source confirmed:boolean",
    ),
    (
        "extra-action-point.apply-draft",
        "Apply a typed reusable XAP draft.",
        "draft:object",
    ),
    (
        "extra-action-point.step.apply",
        "Apply a typed XAP instruction.",
        "edit:object",
    ),
    (
        "monster.draft.apply",
        "Apply a monster draft using native preservation and set rules.",
        "draft:object",
    ),
    (
        "battle.draft.apply",
        "Create or update a battle from a reviewed native allocation.",
        "battle:object creation:boolean? copySource:object?",
    ),
    (
        "treasure.create",
        "Create a reward at an available reviewed native ID.",
        "nativeId:integer",
    ),
    (
        "treasure.update",
        "Edit a reward with native item reference validation.",
        "treasure:object",
    ),
    (
        "treasure.clear",
        "Clear a reward through the native command.",
        "nativeId:integer",
    ),
    (
        "shop.create",
        "Create a shop at an available reviewed native ID.",
        "nativeId:integer",
    ),
    (
        "shop.update",
        "Update a shop's native inventory.",
        "shop:object",
    ),
    (
        "shop.clear",
        "Clear a shop through the native command.",
        "nativeId:integer",
    ),
    (
        "item.draft.apply",
        "Apply a reviewed scenario item draft.",
        "draft:object",
    ),
    (
        "spell.update",
        "Update a scenario spell using native validation.",
        "recordIndex:integer definition:object",
    ),
    (
        "text.apply-draft",
        "Create or edit an allocated native string, checking its expected text. Messages allow 255 MacRoman bytes; Option Labels allow 24.",
        "draft:object",
    ),
    (
        "option-label.create",
        "Allocate an Option Label through the native command.",
        "",
    ),
    (
        "option-label.duplicate",
        "Duplicate an Option Label through the native allocator.",
        "nativeId:integer",
    ),
    (
        "option-label.update",
        "Edit an Option Label using its native record and 24-byte MacRoman limit.",
        "optionLabel:object",
    ),
    (
        "global-macro.update",
        "Assign or clear one global hook using a native XAP identity.",
        "hook target:nullable-string",
    ),
    (
        "global-macro.update-all",
        "Apply all five global hook assignments together; preserve unowned native slots.",
        "hooks:object",
    ),
    (
        "action-point.entry-marker",
        "Change the AP entry marker through its native draft guard. Does not claim party eligibility.",
        "identity enabled:boolean",
    ),
];
