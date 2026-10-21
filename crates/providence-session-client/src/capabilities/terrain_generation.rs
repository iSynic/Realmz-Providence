//! Generation and walking queries share one bounded, reviewed feature contract.
pub(super) const READS: &[(&str, &str, &str)] = &[
    (
        "terrain-generation.open",
        "Inspect terrain generation profiles for the exact resolved artwork.",
        "identity",
    ),
    (
        "terrain-generation.preview",
        "Generate exact seeded terrain within a selected area, with locks and required ordinary walking connections. Does not modify the map.",
        "identity intent:object",
    ),
    (
        "terrain-generation.begin",
        "Start a connection-owned, cancellable terrain preview worker. Poll its jobId for the reviewed result.",
        "identity intent:object",
    ),
    (
        "terrain-generation.poll",
        "Read a terrain worker result; project revision changes invalidate it.",
        "jobId:integer",
    ),
    (
        "terrain-generation.cancel",
        "Cancel this connection's terrain worker without changing the map.",
        "jobId:integer",
    ),
    (
        "map-connectivity.preview",
        "Check conservative cardinal walking connections in this Land map. Scripts, missing movement facts and special travel remain unknown.",
        "identity connections:array",
    ),
];
