use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "discovery.flow" => vec![
            ("root", selection()),
            ("direction", choices(&["upstream", "downstream", "both"])),
            ("depth", integer(1, 32)),
            (
                "categories",
                array(
                    choices(&[
                        "calls",
                        "state",
                        "references",
                        "checks",
                        "changes",
                        "uses",
                        "eligibility",
                    ]),
                    0,
                    7,
                ),
            ),
        ],
        "discovery.flow-summaries" => vec![("selections", array(selection(), 1, 64))],
        "discovery.links" => vec![("direction", choices(&["incoming", "outgoing"]))],
        "quest.flow" => vec![
            ("id", integer(1, 126)),
            ("role", choices(&["checks", "changes"])),
        ],
        "discovery.trace" => vec![
            ("ancestors", array(identity(), 0, 128)),
            ("ancestorPositions", array(nullable(integer(0, 7)), 0, 128)),
            ("ancestorContexts", array(nullable(text(512)), 0, 128)),
            ("requiredPosition", integer(0, 7)),
            ("depthLimit", integer(0, 32)),
        ],
        _ => vec![],
    }
}
fn selection() -> Value {
    object(
        json!({"identity":identity(),"scope":text(32),"entryPosition":nullable(integer(0,7)),
        "throughPosition":nullable(integer(0,7)),"callerContext":nullable(text(512))}),
        &["scope", "entryPosition", "throughPosition", "callerContext"],
    )
}
