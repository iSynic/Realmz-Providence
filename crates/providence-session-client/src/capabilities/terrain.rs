pub(super) const READS: &[(&str, &str, &str)] = &[
    (
        "terrain-mapping.open",
        "Read the exact resolved atlas, available layouts, 200 tile definitions and current authoring mapping. Labels do not change native terrain values. A family requiring review is unavailable for joining until explicitly qualified.",
        "identity layoutIdentity?",
    ),
    (
        "terrain-mapping.review",
        "Review a chosen native terrain layout against the resolved atlas and bounded sample joins. Inspect rendered artwork before qualifying a custom family; missing pieces must stay unavailable.",
        "identity layoutIdentity?",
    ),
];
pub(super) const EDITS: &[(&str, &str, &str)] = &[(
    "terrain-mapping.accept",
    "Prepare an atlas- and revision-bound authoring mapping through the native feature. Review family geometry explicitly; excluded tiles stay unavailable. This changes labels/planner qualification, not native map cells. Commit the returned change-set preview for one shared Undo entry.",
    "identity atlasBlob edit:object",
)];
