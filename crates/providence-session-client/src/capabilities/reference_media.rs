pub(super) const READS: &[(&str, &str, &str)] = &[
    (
        "application-media.describe",
        "Describe configured stock support and atlas availability. Application media remains outside scenario ownership.",
        "",
    ),
    (
        "application-media.list",
        "Page stock descriptors by text, exact source/identity and kind. kind accepts all, all-text or an exact kind returned by this catalog. Preview availability remains subject to the MCP image bound.",
        "query? kind? source? identity? offset:integer? limit:integer?",
    ),
    (
        "application-media.open",
        "Read one exact stock descriptor, source, ambiguity and ownership without copying its bytes to the project.",
        "identity",
    ),
    (
        "application-media.preview",
        "Read a bounded preview from the configured content-addressed library. Supported images become MCP image blocks; this does not confer scenario ownership.",
        "identity",
    ),
    (
        "player-map.resources.list",
        "Page exact marker, picture or scrolling-TEXT choices with scenario-before-stock resolution and explicit unavailable reasons. A marker is one exact CICN resource, including portrait/special-land identities.",
        "query:object",
    ),
    (
        "player-map.resource.preview",
        "Preview one nonzero exact Player Map resource. Zero/no-resource choices have no payload. Preserve the returned descriptor identity rather than inventing an icon identity.",
        "field value:integer",
    ),
    (
        "item-artwork.resolve",
        "Resolve the exact native item icon number against scenario and application ownership, including missing or ambiguous resources.",
        "iconId:integer",
    ),
];
pub(super) const EDITS: &[(&str, &str, &str)] = &[
    (
        "scenario-item.use-scenario-artwork",
        "Prepare assignment of one existing scenario CICN to its native item record. Native payload/ambiguity and reference checks remain authoritative.",
        "identity recordIndex:integer",
    ),
    (
        "scenario-item.use-stock-artwork",
        "Prepare a stock CICN assignment without copying library payloads. Exact identity, kind and scenario shadowing are checked before shared commit.",
        "identity recordIndex:integer",
    ),
];

pub(super) fn contract(method: &str) -> Option<(&'static str, &'static str, &'static str)> {
    match method.split('.').next()? {
        "application-media" if method == "application-media.describe" => Some((
            "application-media-discovery",
            "stored_routes/application",
            "Configured stock support; native availability remains explicit",
        )),
        "application-media" => Some((
            "application-media-discovery",
            "document_catalogs/application_media",
            "Exact source/identity, bounded pages and content-addressed stock previews",
        )),
        "scenario-item" => Some((
            "item-artwork-assignment",
            "reference_catalog",
            "Existing native item and exact nonzero CICN; preserve ownership and reject scenario-shadowed stock",
        )),
        "item-artwork" => Some((
            "item-artwork-resolution",
            "item_references",
            "Exact signed native icon number and layered resource resolution",
        )),
        "player-map" if method.starts_with("player-map.resource") => Some((
            "player-map-resources",
            "player_map_resources",
            "Exact native resource key; scenario ownership shadows stock, including malformed overrides",
        )),
        _ => None,
    }
}
