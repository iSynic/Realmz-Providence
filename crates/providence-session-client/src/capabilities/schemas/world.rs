use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "action-point.list" => vec![("activationFilters", activation_filter())],
        "map.create" => vec![("levelType", choices(&["land", "dungeon"]))],
        "map.catalog" => vec![("levelType", choices(&["all", "land", "dungeon"]))],
        "map.preview-intent" | "map.apply-intent" => vec![("intent", paint_intent())],
        "dungeon-cell.preview-features" | "dungeon-cell.apply-features" => {
            vec![("edit", dungeon_edit())]
        }
        "magic-brush.preview" | "magic-brush.apply" => vec![("intent", magic_intent())],
        "level-settings.artwork" => vec![("landlook", integer(-128, 127))],
        "level-settings.preview" | "level-settings.apply" => vec![("edit", level_settings())],
        _ => vec![],
    }
}

fn level_settings() -> Value {
    object(
        json!({"name":text(128),"dark":{"type":"boolean"},"usesLos":{"type":"boolean"},
        "landlook":nullable(integer(-128,127)),"sharedBaseTile":nullable(integer(0,200))}),
        &["sharedBaseTile"],
    )
}
fn activation_filter() -> Value {
    object(
        json!({"chance":choices(&["all","positive","nonpositive"]),
        "marker":choices(&["all","present","absent","unavailable"]),
        "precedence":choices(&["all","shadowed","first"]),
        "checks":choices(&["all","detected","unknown"])}),
        &["chance", "marker", "precedence", "checks"],
    )
}
fn paint_intent() -> Value {
    object(
        json!({"tilesetId":identity(),"cells":array(coordinate(),1,8100),
        "operation":choices(&["paint","erase","replace"]),"selectedTile":integer(0,200),
        "replaceTile":nullable(integer(0,200)),"variation":choices(&["single","cycle-group","stable-random"]),
        "variationTiles":array(integer(1,200),0,200),"fillPercent":integer(0,100),"seed":integer(0,u32::MAX.into())}),
        &["replaceTile"],
    )
}
fn dungeon_edit() -> Value {
    object(
        json!({"cells":array(coordinate(),1,8100),"changes":feature_changes()}),
        &[],
    )
}
pub(super) fn feature_changes() -> Value {
    let change = object(
        json!({"primitive":choices(&["no-wall-in-battle","wall","horizontal-door","vertical-door",
        "stairs","column","unmapped","allow-move-north","allow-move-east","allow-move-south","allow-move-west","visible-arch"]),
        "enabled":{"type":"boolean"}}),
        &[],
    );
    array(change, 1, 12)
}
fn magic_intent() -> Value {
    let stroke = object(
        json!({"sampledTile":integer(0,200),"cells":array(coordinate(),1,8100)}),
        &[],
    );
    object(
        json!({"tilesetId":identity(),"atlasBlob":nullable(identity()),"mappingRevision":integer(0,i64::MAX),
        "tolerance":choices(&["literal","gentle","balanced","strong"]),"strokes":array(stroke,1,128)}),
        &["atlasBlob"],
    )
}
