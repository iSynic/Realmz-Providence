//! Complete native rows remain bounded; semantic references are checked by their features.
use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "battle.draft.prepare" => vec![("battle", battle())],
        "battle.draft.apply" => vec![
            ("battle", battle()),
            (
                "copySource",
                nullable(object(
                    json!({"nativeId":integer(0,32767),"recordHash":identity()}),
                    &[],
                )),
            ),
        ],
        "treasure.update" => vec![("treasure", treasure())],
        "shop.update" => vec![("shop", shop())],
        _ => vec![],
    }
}

fn battle() -> Value {
    object(
        json!({"identity":identity(),"nativeId":integer(0,32767),
        "grid":array(integer(-32768,32767),169,169),"distance":integer(-128,127),
        "messageBefore":integer(-32768,32767),"messageAfter":integer(-32768,32767),
        "battleMacro":integer(-32768,32767),"authored":{"type":"boolean"}}),
        &["authored"],
    )
}

fn treasure() -> Value {
    object(
        json!({"identity":identity(),"nativeId":integer(0,32767),
        "itemIds":array(integer(-32768,32767),20,20),"experience":integer(-32768,32767),
        "gold":integer(-32768,32767),"gems":integer(-32768,32767),"jewelry":integer(-32768,32767),
        "authored":{"type":"boolean"}}),
        &["authored"],
    )
}

fn shop() -> Value {
    object(
        json!({"identity":identity(),"nativeId":integer(0,32767),
        "itemIds":array(integer(-32768,32767),1000,1000),"quantities":array(integer(0,255),1000,1000),
        "inflation":integer(-32768,32767),"authored":{"type":"boolean"}}),
        &["authored"],
    )
}
