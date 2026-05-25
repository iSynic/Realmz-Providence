# Scripts V2 Authoring Guide

Scripts V2 turns the Scripts panel into a Realmz-native authoring workbench. The UI borrows Adventure Engine's visual scripting shape: grouped step catalog, ordered step list, selected-step details, typed target pickers, and inline validation. Providence does not import Adventure Engine's runtime interpreter. Every authored script still exports as Realmz `CODE` / `ID` / `EDCD` records.

## Action Point Inventory

Realmz Action Points are fixed records inside map trigger files. Deleting one does not truncate the file; Providence clears the record to an empty reusable slot.

- The Scripts list shows the complete Action Point inventory for map trigger/action records, including active records, reusable empty slots, callable macros, and preserved ED3 evidence.
- Filter chips narrow the inventory to current map, all scripts, active records, reusable records, warnings, or macros.
- The capacity badge shows how many fixed Action Point records are currently active, how many reusable slots exist, and why creation is disabled when a map has no reusable records.
- `+ Action Point` uses the first empty reusable slot when one exists.
- If a file is at capacity, creation is disabled until an Action Point is cleared or an empty slot is selected for reuse.
- The Map Toolset Action Point placement and the Scripts `+ Action Point` control use the same command path, so both produce records that undo/redo, save, reopen, validate, and export consistently.
- Clearing an Action Point selects the fixed-record semantics explicitly: the record becomes reusable instead of disappearing from the Realmz file layout.

## Workbench Layout

The Scripts workbench is optimized around the selected script, not around always-visible evidence panels.

- Scripts opens in focused authoring mode by default. `Show Context` reveals the Semantic Browser and Semantic Inspector; `Focus Scripts` hides them again so the Action Point inventory and selected step editor own the screen.
- The Semantic Inspector, ED3 Evidence, EDCD row list, raw Realmz fields, and low-priority semantic groups are collapsible and persist their open/closed state.
- The selected step detail surface can be docked or floating. Floating mode borrows Adventure Engine's bounded floating editor pattern while still editing native Realmz records.
- On medium-width screens, the target record drawer moves below the slot detail instead of forcing three cramped columns. On EDCD-backed opcodes, the redundant target drawer is disabled because the editable target fields live in the EDCD Attachment section.
- The selected opcode summary remains visible while the full opcode browser is collapsed into `Opcode Catalog` by default after a slot has a CODE, keeping the current CODE/ID fields, target picker, EDCD attachment, and diagnostics in the primary editing path.

## Macros And ED3 Evidence

Callable macros and preserved `Data ED3` evidence are intentionally separate.

- **Macros** are reachable or user-authored script records that Realmz can call through known source-backed paths.
- **ED3 Evidence** rows are preserved imported records without a proven callable path.
- Target pickers offer callable macros and newly-authored macros, not inspect-only ED3 evidence.
- To reuse an ED3 evidence row as authored behavior, duplicate/promote it into a new macro first. That keeps imported data intact while making the new authored copy explicit.

## Guided CODE / ID / EDCD Editing

The visual step list is a friendlier view of the raw Realmz slots. Each step descriptor maps one Realmz opcode to:

- category and label
- raw `CODE`
- `ID` meaning
- optional `EDCD` shape
- target picker type
- validation rules
- compatibility status

Expert users can still inspect and edit raw values. The guided form is the preferred path because it can validate target type, record existence, EDCD shape, coordinates, and known dispatcher no-op behavior beside the affected slot.

For EDCD-backed opcodes, the slot `ID` is a `Data EDCD` row number. The real targets are fields inside that row. Providence therefore:

- labels the raw slot field as `Data EDCD Row`
- shows named fields for known EDCD shapes
- offers typed pickers for decoded EDCD message, battle, shop, encounter, macro, quest, and item fields
- offers `Create target` buttons for missing editable EDCD targets when Providence knows the target record family
- warns beside the exact EDCD field when a row points at a missing target that Realmz expects to resolve
- keeps raw numeric fields visible for shapes or fields that are not decoded yet

## Target Record Creation

Script target pickers can create common Realmz target records inline:

- Message targets create `Data SD2` records.
- Battle targets create `Data BD` records.
- Treasure targets create `Data TD` records.
- Shop targets create `Data SD` records.
- Simple encounter targets create `Data ED` records.
- Complex encounter targets create `Data ED2` records.
- Quest labels are Providence metadata only; Realmz quest state remains opcode-driven.

These editors are "usable shells": they expose common Divinity-style fields, preserve unsupported imported bytes, and mark imported byte ranges that Providence is not yet editing directly.

## Preserved Imported Bytes

Providence writes only fields it owns. Imported target records keep their original raw bytes unless the user edits that record. When an imported record is edited, the writer preserves unknown bytes outside known field ranges wherever possible. Legacy partial tails in fixed-record files are also preserved during export.

Compatibility badges use this language:

- `Realmz-writable`: Providence has a typed writer for the record family.
- `Preserved imported bytes`: some bytes are intentionally retained from the original scenario.
- `Inspect only`: Providence can explain the data but should not edit it directly.
- `Dispatcher no-op`: Realmz ignores this nonzero code path.
- `Needs manual verification`: the editor can preserve/export it, but the behavior is not fully decoded yet.

## Export Contract

Realmz remains authoritative. Providence exports standard scenario files and does not require Realmz scenario-loading changes. New target records are written in fixed-record Realmz formats; deleted imported records are cleared to default records rather than removing middle records from the file.

## Editor Smoke Checks

Scripts V2 has two opt-in editor smokes:

- `npm run smoke:editor`: runs the current editor smoke matrix and writes one summary JSON under a shared run root.
- `npm run smoke:editor:scripts-v2`: imports Tutorial, reuses an Action Point, creates message/battle/treasure/shop/simple/complex targets, writes EDCD-backed slots, saves, reopens, validates, and exports.
- `npm run smoke:editor:scripts-v2:diagnostics`: creates intentionally missing EDCD battle/message targets and asserts the editor diagnostics report them beside the Action Point and encounter target record.

These smokes exercise Providence's editor command path and export writers. They do not launch Realmz and are not a substitute for user-facing review of the Scripts workbench.

The matrix and individual smoke scripts use a local editor-harness lock before launching the desktop executable. That keeps hidden Tauri harness runs serialized even if two npm smoke commands are started at the same time.
