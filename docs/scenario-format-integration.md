# Scenario Format Integration Notes

Providence uses the local scenario-format docs in `F:\Realmz Scenario Utility\docs\scenario-format` as the source-backed technical layer underneath the Divinity parity roadmap.

## Authored Source Vs Runtime Cache

Realmz scenario folders contain authored source files such as `Data DD`, `Data DDD`, `Data ED3`, `Data EDCD`, maps, records, and the `Scenario` resource fork. Runtime caches such as `CL`, `CD`, `CE`, `CE2`, `CS`, and related files are generated or mutated by Realmz. Providence models runtime caches as inspect-only evidence and does not promote them to authored export targets.

## Data ED3 Reachability

`Data ED3` is preserved record-for-record, but only source-backed reachable rows are promoted to callable macro entities. The current reachable roots are map trigger calls, recursive reachable macro calls, global macro slots when decoded, timed encounter doors, random-region doors, negative battle macros when signed evidence is available, and monster death hooks.

Rows without a source-backed path remain `ed3-action-record` evidence and are classified as `needs-runtime-trace`, `orphan-authored-content`, `probable-editor-padding`, or `runtime-mutation-candidate`. The Scripts workbench shows these rows in ED3 Evidence and excludes them from macro target pickers until the user duplicates/promotes them or the importer proves reachability.

## Dispatcher No-Ops

The opcode tables distinguish two cases:

- `dispatcher-noop`: Realmz reads a nonzero CODE value, but `newland.c` has no dispatcher case and ignores it.
- `unknown-opcode`: an active executable behavior exists but Providence has not mapped it yet.

The current corpus evidence places the generated no-op cases in the first bucket. Providence reports these as informational no-op diagnostics so authors do not mistake preserved padding or dormant data for unsupported scenario behavior.

## Resource Taxonomy

Scenario resource forks remain authoritative for scenario-supplied pictures, sounds, strings, icons, metadata, and special tiles. Shared Realmz resources are modeled as fallbacks or reference-only entities. Editor controls should make the source clear before allowing asset reassignment or export-writing, especially when a script target can resolve through either scenario resources or shared Realmz resources.
