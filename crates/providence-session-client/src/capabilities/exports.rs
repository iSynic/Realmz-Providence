pub(super) const EXPORTS: &[(&str, &str, &str)] = &[
    (
        "export.begin",
        "Start a bounded Classic/v6 export job against this exact revision/support. Editing may continue after capture. Output is no-clobber unless replacement names the exact prior artifact SHA-256; replacements retain the original backup; cancellation stops before publication after the current compiler phase. Poll the native jobId. Submission is outside project Undo, and its receipt is not a publication receipt.",
        "format path minimumEngineVersion? packageFinalization:object? replacement:object?",
    ),
    (
        "project.save",
        "Checkpoint the applied shared project and history. Unapplied native drafts remain local. This is not an Undo entry.",
        "",
    ),
    (
        "project.compile-classic-slice",
        "Publish Classic files without overwriting existing output. Filesystem publication is outside Undo.",
        "directory",
    ),
    (
        "project.compile-rebuilt-package",
        "Publish a current v6 archive without clobbering output. Filesystem publication is outside Undo.",
        "path minimumEngineVersion packageFinalization:object?",
    ),
];

pub(super) const READS: &[(&str, &str, &str)] = &[
    (
        "export.inspect-artifact",
        "Hash one existing bounded artifact under the authorized output root. Classic uses a versioned whole-directory digest; Rebuilt uses archive SHA-256. Use that exact hash for an explicit replacement; inspection does not validate gameplay.",
        "format path",
    ),
    (
        "export.poll",
        "Read a durable export job and captured revision, with bounded file/warning pages. A host restart can report interruption or an uncertain publication; it never replays the export.",
        "jobId fileOffset:integer? warningOffset:integer? limit:integer?",
    ),
    (
        "export.cancel",
        "Request export cancellation without blocking project reads/edits. Compilation may finish its current phase; poll until settled. A completed publication remains committed if cancellation arrived too late.",
        "jobId",
    ),
];
