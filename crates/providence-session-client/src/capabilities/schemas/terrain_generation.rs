use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    let connections = array(
        object(json!({"from":coordinate(),"to":coordinate()}), &[]),
        0,
        32,
    );
    match method {
        "map-connectivity.preview" => vec![("connections", connections)],
        "terrain-generation.poll" | "terrain-generation.cancel" => {
            vec![("jobId", integer(1, i64::MAX))]
        }
        "terrain-generation.preview" | "terrain-generation.begin" | "terrain-generation.apply" => {
            let mut fields = vec![(
                "intent",
                object(
                    json!({
                        "tilesetId":identity(), "atlasBlob":identity(), "mappingRevision":integer(0,i64::MAX),
                        "family":choices(&["water","forest","mountains"]),
                        "density":choices(&["sparse","balanced","dense"]),"seed":integer(0,u32::MAX.into()),
                        "mask":array(coordinate(),1,8100),"locks":array(coordinate(),0,8100),"connections":connections
                    }),
                    &[],
                ),
            )];
            if method == "terrain-generation.apply" {
                fields.push(("reviewHash", json!({"type":"string","pattern":"^[a-f0-9]{64}$","minLength":64,"maxLength":64})));
            }
            fields
        }
        _ => vec![],
    }
}
