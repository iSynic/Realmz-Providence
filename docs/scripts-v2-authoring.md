# Scripts V2 Authoring Guide

Scripts V2 turns the Scripts panel into a Realmz-native authoring workbench. The UI borrows Adventure Engine's visual scripting shape: grouped step catalog, ordered step list, selected-step details, typed target pickers, and inline validation. Providence does not import Adventure Engine's runtime interpreter. Every authored script still exports as Realmz `CODE` / `ID` / `EDCD` records.

## Action Point Inventory

Realmz Action Points are fixed records inside map trigger files. Deleting one does not truncate the file; Providence clears the record to an empty reusable slot.

- The Scripts list shows the complete Action Point inventory for map trigger/action records, including active records and empty reusable slots.
- The capacity badge shows how many fixed Action Point records are currently present, for example `100/100 Action Point records used`.
- `+ Action Point` uses the first empty reusable slot when one exists.
- If a file is at capacity, creation is disabled until an Action Point is cleared or an empty slot is selected for reuse.
- The Map Toolset Action Point placement and the Scripts `+ Action Point` control use the same command path, so both produce records that undo/redo, save, reopen, validate, and export consistently.

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
