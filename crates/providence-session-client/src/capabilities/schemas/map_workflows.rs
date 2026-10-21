use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "special-land-solidity.preview" => vec![("path", text(4096))],
        "special-land-solidity.initialize" => vec![
            ("path", text(4096)),
            (
                "expectedSha256",
                json!({"type":"string","pattern":"^[a-f0-9]{64}$","minLength":64,"maxLength":64}),
            ),
        ],
        "land-cell.preview" | "land-cell.apply" => vec![(
            "edit",
            object(
                json!({
                    "x":integer(0,89),"y":integer(0,89),"secret":choices(&["normal","hidden","revealed"]),
                    "solid":nullable(json!({"type":"boolean"})),"removePlacement":{"type":"boolean"}
                }),
                &[],
            ),
        )],
        "smart-terrain.preview" | "smart-terrain.apply" => vec![(
            "intent",
            object(
                json!({
                    "tilesetId":identity(),"preset":choices(&["water","mountains","forest"]),
                    "mask":array(coordinate(),1,8100),"atlasBlob":nullable(identity()),
                    "mappingRevision":integer(0,i64::MAX),"tolerance":choices(&["literal","gentle","balanced","strong"])
                }),
                &["atlasBlob", "mappingRevision", "tolerance"],
            ),
        )],
        "smart-terrain.reshape" => vec![
            ("mask", array(coordinate(), 0, 8100)),
            ("operation", choices(&["fill", "grow", "shrink", "clear"])),
        ],
        "random-region.open" | "random-region.clear" => vec![("slot", integer(0, 19))],
        "random-region.preview" | "random-region.apply" => vec![("region", region())],
        "paint-resources.list" => vec![
            ("kind", choices(&["stamp", "palette", ""])),
            (
                "scope",
                choices(&["all", "favorites", "recent", "local", "built-in"]),
            ),
        ],
        "map-stamp.preview" | "map-stamp.apply" => vec![
            ("origin", coordinate()),
            ("resourceRevision", integer(0, i64::MAX)),
        ],
        _ => vec![],
    }
}

fn region() -> Value {
    let word = integer(i16::MIN.into(), i16::MAX.into());
    object(
        json!({"identity":identity(),"top":word,"left":word,"bottom":word,"right":word,
        "chanceTenThousand":word,"battleRange":array(word.clone(),2,2),
        "randomDoors":array(word.clone(),3,3),"randomDoorPercent":array(word.clone(),3,3),
        "only":{"type":"boolean"},"option":word,"soundId":word,"textId":word}),
        &[],
    )
}
