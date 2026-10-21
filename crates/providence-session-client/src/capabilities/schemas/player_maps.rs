//! Data MD2 uses ten marker slots, signed native words and a Str255 note.
use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    if !matches!(method, "player-map.validate" | "player-map.apply-draft") {
        return vec![];
    }
    vec![
        ("playerMap", record()),
        (
            "names",
            object(
                json!({
                    "availableName": text(255), "unavailableName": text(255)
                }),
                &[],
            ),
        ),
    ]
}

fn record() -> Value {
    let word = integer(-32768, 32767);
    let marker = object(json!({"iconId":word,"x":word,"y":word}), &[]);
    let rect = object(
        json!({"top":word,"left":word,"bottom":word,"right":word}),
        &[],
    );
    object(
        json!({
            "identity":identity(), "nativeId":integer(0, u32::MAX.into()),
            "markers":array(marker,10,10),
            "startX":word,"startY":word,"level":word,"pictureId":word,
            "iconSize":word,"show":word,"isDungeon":{"type":"boolean"},
            "pictureRect":rect,"note":text(255),"authored":{"type":"boolean"}
        }),
        &["authored"],
    )
}
