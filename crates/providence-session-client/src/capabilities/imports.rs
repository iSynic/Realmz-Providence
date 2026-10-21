pub(super) const READS: &[(&str, &str, &str)] = &[
    (
        "project.inspect-classic-scenario-import",
        "Inspect a complete native Classic source folder and explicit application-data folder. No files or project records change. Inputs require configured roots; unresolved startup candidates remain explicit.",
        "directory applicationDataDirectory startupFile?",
    ),
    (
        "project.import-classic-scenario.poll",
        "Read this client's staged Classic import progress. Preparation does not change the project. Editing the project invalidates the prepared import. Stages are cancelled on disconnect, not automatically restarted.",
        "jobId:integer",
    ),
    (
        "project.import-classic-scenario.cancel",
        "Cancel this client's Classic import and discard only its owned staging. The active project stays unchanged. A committed import cannot be undone by cancellation.",
        "jobId:integer",
    ),
    (
        "classic-rule-selection.open",
        "Read the imported source-set identity and current explicit Classic rule choice. Menu ordering is not proof of intended mechanics.",
        "",
    ),
];
pub(super) const EXTERNAL: &[(&str, &str, &str)] = &[
    (
        "project.import-classic-scenario.begin",
        "Prepare a complete Classic import into a newly created unedited project only. Capture explicit scenario/application input directories through native import jobs. This establishes a new baseline, outside Undo; it cannot replace an existing authored scenario. Poll, inspect and explicitly commit. Rule selection is a separate guarded authoring task.",
        "directory applicationDataDirectory startupFile?",
    ),
    (
        "project.import-classic-scenario.commit",
        "Commit this client's ready native import as the initial project baseline at its exact revision. No whole-project payload is accepted. This baseline has no Undo entry; subsequent edits use shared history. Native drafts, stale revisions and uncertain acknowledgements retain their guards.",
        "jobId:integer",
    ),
];
pub(super) const EDITS: &[(&str, &str, &str)] = &[
    (
        "classic-rule-selection.set",
        "Stage an explicit imported Classic menu/rule choice bound to its retained source-set hash and previous context. This is an author-configured choice, not an independently captured Classic runtime witness. Do not assume menu slot 19 universally represents intended mechanics.",
        "expectedProjectId expectedPreviousIdentity:nullable-string expectedSourceSetSha256 nativeMenuSelection:integer",
    ),
    (
        "classic-rule-selection.clear",
        "Clear the source-bound imported Classic rule choice through shared Undo. Rebuilt readiness may become blocked until an explicit choice is supplied.",
        "expectedProjectId expectedPreviousIdentity:nullable-string expectedSourceSetSha256",
    ),
];
