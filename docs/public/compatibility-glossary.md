# Compatibility glossary

These terms describe what the editor preserves and what a player can use.
They are not a rating of a scenario's story or a promise of campaign completion.

| Term | Meaning for an author |
| --- | --- |
| Portable project | The saved Providence authoring state and its associated content. Keep the complete project folder together. |
| Apply | Commit a form or staged operation to the open project. It becomes available to project history. |
| Save | Persist the current project. Applying and saving are separate actions. |
| Classic export | Reconstruct the native files used by Classic Realmz. Imported source bytes are retained so unrelated edits can preserve them. |
| Rebuilt package | Compile the scenario and its runtime dependencies for a separate compatible Rebuilt installation. It has a different format from a portable editor project. |
| Package schema | The contract between a package writer and its reader. Current development writers use v7 for imported scenarios and v6 for authored ones. Older archives keep their original versions. |
| Application support | The separate stock Realmz rules and media paired with a scenario package. It must match the package's declared identity. |
| Scenario-owned resource | A resource supplied by the scenario. Its exact key takes precedence over the corresponding stock resource. A malformed override is not treated as absent. |
| Imported preservation | Retain original data, including unused fields or unavailable optional content. This does not make malformed content executable. |
| Quarantined content | Imported content remains in project truth or retained sources but is omitted from usable runtime output for a stated reason. Inspect the affected identity before relying on it. |
| Deferred reference | An imported caller is preserved even though its target is unavailable. A warning does not guarantee that consuming the target will succeed. Fresh authoring remains strict. |
| Readiness | Whether the selected target can be compiled, with or without warnings. Readiness is separate from an actual verified export and from successful play. |
| Rule selection | The Classic execution context that chooses effective rules. Registration, a scenario name, or a successful fallback does not establish the intended mechanics. |
| Action Point | A native encounter/program record. Its map location, chance and entry-marker relationship are distinct facts. |
| Dormant Action Point | A placed AP whose initial chance prevents ordinary triggering. Scripts may change that chance later; the record still exists. |
| Entry marker | Native tile information used during entry. Marker presence alone does not prove that an AP will run. |
| Precedence | Which native record is encountered first when several records occupy the same location. It is separate from eligibility. |
| Program check | A recognized instruction or branch that may prevent later effects. A local check summary does not analyze every called program. |
| View Flow | A derived view of program relationships and ordered steps. It does not establish physical access or evaluate the current party's complete state. |
| Unconfirmed outcome | The editor cannot establish whether an operation completed. Check its status or reopen as directed; do not repeat a mutation blindly. |

See [package versions](package-versions.md), [Action Points](action-points.md),
[View Flow](view-flow.md), and [the source evidence guide](source-evidence-guide.md)
for the associated workflows and limits.
