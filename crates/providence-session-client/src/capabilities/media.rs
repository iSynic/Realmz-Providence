//! Scenario media tasks reuse native codecs, review and exact ownership.
pub(super) const READS: &[(&str, &str, &str)] = &[
    (
        "media.import.allocate",
        "Allocate an unowned native media key, including both Monster appearance keys and retained/quarantined originals. This does not reserve the slot; prepare and commit recheck ownership.",
        "kind",
    ),
    (
        "media.import.prepare",
        "Review supported scenario media through existing codecs. Absolute source paths must be inside configured input roots. Returns exact identities, native conversion previews and a reviewHash; no scenario write. May be a named change-set review step.",
        "kind name path resourceId:integer reversePath:nullable-string? settings:object? width:integer? height:integer? landlook:integer? baseTile:integer? text? replaceIdentity:nullable-string?",
    ),
    (
        "media.open",
        "Read exact scenario media and its converted preview using scenario-before-application ownership.",
        "identity",
    ),
    (
        "media.remove.prepare",
        "Review removal and exact incoming uses through the existing native media editor.",
        "identity",
    ),
    (
        "project-asset.list",
        "Browse bounded scenario-owned media descriptors and references; application resources remain separately owned.",
        "query? kind? offset:integer? limit:integer?",
    ),
    (
        "project-asset.open",
        "Inspect one exact scenario-owned media identity and its owning uses.",
        "identity offset:integer? limit:integer?",
    ),
];

pub(super) const EDITS: &[(&str, &str, &str)] = &[
    (
        "media.import.commit",
        "Stage an exact reviewed scenario media import/replacement through native ownership and codec checks. Use a named media.import.prepare step for grouped imports and reference its reviewHash. Personal-library changes are separate capabilities.",
        "kind name path resourceId:integer reviewHash reversePath:nullable-string? settings:object? width:integer? height:integer? landlook:integer? baseTile:integer? text? replaceIdentity:nullable-string?",
    ),
    (
        "media.metadata.apply",
        "Edit only the existing media label and supported special-art context; preserve payloads and paired ownership.",
        "identity name landlook:integer? baseTile:integer?",
    ),
    (
        "media.remove.commit",
        "Remove only the reviewed scenario media through native reference checks and shared project history.",
        "identity reviewHash",
    ),
];
