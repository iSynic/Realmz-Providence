use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "application-media.list" => vec![("kind", text(512))],
        "item-artwork.resolve" => vec![("iconId", integer(-32768, 32767))],
        "scenario-item.use-stock-artwork" | "scenario-item.use-scenario-artwork" => {
            vec![("recordIndex", integer(0, 199))]
        }
        "player-map.resource.preview" => {
            vec![("field", field()), ("value", integer(-32768, 32767))]
        }
        "player-map.resources.list" => vec![(
            "query",
            object(
                json!({
                    "field":field(),"currentValue":integer(-32768,32767),"search":text(4096),
                    "ownership":choices(&["","all","stock","scenario","unavailable"]),
                    "showUnavailable":{"type":"boolean"},"offset":integer(0,i64::MAX),
                    "seekCurrent":{"type":"boolean"},"limit":integer(1,128)
                }),
                &[
                    "search",
                    "ownership",
                    "showUnavailable",
                    "offset",
                    "seekCurrent",
                ],
            ),
        )],
        _ => vec![],
    }
}
fn field() -> Value {
    choices(&["marker", "picture", "scrollingText"])
}
