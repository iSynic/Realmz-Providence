//! Local collection changes are external effects, distinct from applying terrain.
pub(super) const READS: &[(&str, &str, &str)] = &[
    (
        "paint-resources.allocate",
        "Allocate a native local stamp/palette identity and template for an existing map. Not reserved; collection writes recheck resourceRevision. No project history.",
        "identity kind",
    ),
    (
        "paint-resources.capture",
        "Capture bounded selected cells as a stamp through the native marker/secret stripping rules. Returns a local draft, not a project mutation.",
        "identity cells:array resource:object",
    ),
    (
        "paint-resources.geometry",
        "Review native resource resize, cell replacement or sparse-hole removal. This only changes a returned local draft.",
        "resource:object edit:object",
    ),
    (
        "paint-resources.preview",
        "Preview a local resource draft through native map encoders and exact artwork availability before saving or placement.",
        "identity resource:object",
    ),
    (
        "paint-resources.preview-features",
        "Review supported Dungeon stamp feature changes while preserving unrelated native bits.",
        "tile:integer changes:array",
    ),
    (
        "paint-resources.operation-status",
        "Reconcile the exact local collection operation and its original resource revision/change. A collection save is outside project Undo.",
        "operationId resourceRevision:integer change:object",
    ),
];
pub(super) const EXTERNAL: &[(&str, &str, &str)] = &[(
    "paint-resources.apply",
    "Create, replace, delete or remember a reviewed local stamp/palette using its exact resourceRevision. This changes local editor settings, not portable project truth or project Undo. Cannot be part of a project change set.",
    "resourceRevision:integer change:object",
)];
