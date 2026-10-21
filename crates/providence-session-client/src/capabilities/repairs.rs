//! Feature-owned repair drafts retain native context and explicit shared-use review.
pub(super) const READS: &[(&str, &str, &str)] = &[
    (
        "action-settings.prepare-repair",
        "Open the native Random Message or Random Area repair for an exact caller/slot. Returns a context-bound draft; no edit.",
        "source slot:integer",
    ),
    (
        "action-settings.change-repair",
        "Change one native repair field locally. Input changes clear shared-use confirmation; inspect returned diagnostics before commit.",
        "draft:object field value",
    ),
    (
        "action-settings.choose-repair-message",
        "Choose an exact message endpoint, or explicit null for no message, using native wait and range semantics.",
        "draft:object field identity:nullable-string waitsForClick:boolean?",
    ),
    (
        "action-settings.peek-repair-message",
        "Read the exact message text while retaining the repair's context guard.",
        "draft:object identity",
    ),
    (
        "action-settings.preview-repair",
        "Preview current native repair values, affected uses, diagnostics and bounded message-range pages without editing.",
        "draft:object offset:integer?",
    ),
    (
        "action-settings.compare-repair",
        "Compare the original repair context with the current caller and shared rows. Does not rebase or overwrite a draft.",
        "draft:object",
    ),
    (
        "action-settings.rebase-repair",
        "Explicitly recreate the native repair guard at this revision while retaining authored input. Shared-use confirmation must be reviewed again.",
        "draft:object",
    ),
    (
        "action-settings.repair-uses",
        "Page the exact shared Extra Code callers affected by this repair.",
        "draft:object offset:integer? limit:integer?",
    ),
    (
        "action-settings.repair-choices",
        "Search bounded native map, random-area or message choices for this repair field.",
        "draft:object field query? offset:integer? limit:integer?",
    ),
];

pub(super) const EDITS: &[(&str, &str, &str)] = &[(
    "action-settings.commit-repair",
    "Stage a reviewed native repair. Default scope isolates this action; changing shared rows requires the exact compatible caller confirmation. The whole change set remains atomic.",
    "draft:object",
)];

pub(super) fn stageable(method: &str) -> bool {
    READS.iter().any(|(candidate, _, _)| *candidate == method)
}
