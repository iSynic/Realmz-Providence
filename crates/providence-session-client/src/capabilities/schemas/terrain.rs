use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    if matches!(method, "terrain-mapping.open" | "terrain-mapping.review") {
        return vec![("layoutIdentity", identity())];
    }
    if method != "terrain-mapping.accept" {
        return vec![];
    }
    let tile_label = object(
        json!({"name":nullable(text(120)),"material":nullable(text(120))}),
        &[],
    );
    vec![
        ("atlasBlob", identity()),
        (
            "edit",
            object(
                json!({
                    "expectedMappingRevision":integer(0,i64::MAX),
                    "layoutIdentity":identity(),"layoutRevision":integer(1,u32::MAX.into()),
                    "reviewedFamilies":array(choices(&["water","mountains","forest"]),0,3),
                    "excludedTiles":array(integer(1,200),0,200),
                    "tileLabels":{"type":"object","maxProperties":200,"additionalProperties":tile_label},
                    "categoryLabels":{"type":"object","maxProperties":32,"additionalProperties":text(120)}
                }),
                &[],
            ),
        ),
    ]
}
