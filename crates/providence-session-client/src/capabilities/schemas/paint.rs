use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "paint-resources.allocate" => vec![("kind", choices(&["stamp", "palette"]))],
        "paint-resources.capture" => vec![
            ("cells", array(coordinate(), 1, 1024)),
            ("resource", resource()),
        ],
        "paint-resources.geometry" => vec![("resource", resource()), ("edit", geometry())],
        "paint-resources.preview" => vec![("resource", resource())],
        "paint-resources.preview-features" => vec![
            ("tile", integer(-32768, 32767)),
            ("changes", super::world::feature_changes()),
        ],
        "paint-resources.apply" | "paint-resources.operation-status" => vec![
            (
                "operationId",
                json!({"type":"string","minLength":64,"maxLength":64,"description":"Native local-collection receipt identity: exactly 64 hexadecimal digits."}),
            ),
            ("resourceRevision", integer(0, i64::MAX)),
            ("change", change()),
        ],
        _ => vec![],
    }
}

fn resource() -> Value {
    object(
        json!({"identity":identity(),"name":text(80),"collection":text(80),"kind":choices(&["stamp","palette"]),
        "levelType":choices(&["land","dungeon"]),"tilesetId":identity(),"width":integer(1,32),"height":integer(1,32),
        "cells":array(object(json!({"x":integer(0,31),"y":integer(0,31),"tile":integer(-32768,32767)}),&[]),0,1024),
        "favorite":{"type":"boolean"}}),
        &[],
    )
}
fn change() -> Value {
    json!({"oneOf":[
        object(json!({"operation":choices(&["create","replace"]),"resource":resource()}),&[]),
        object(json!({"operation":choices(&["delete","remember"]),"identity":identity()}),&[])
    ]})
}
fn geometry() -> Value {
    json!({"oneOf":[
        object(json!({"operation":choices(&["resize"]),"width":integer(1,32),"height":integer(1,32),"fill":integer(-32768,32767)}),&[]),
        object(json!({"operation":choices(&["set-cell"]),"x":integer(0,31),"y":integer(0,31),"tile":integer(-32768,32767)}),&[]),
        object(json!({"operation":choices(&["remove-cell"]),"x":integer(0,31),"y":integer(0,31)}),&[])
    ]})
}
