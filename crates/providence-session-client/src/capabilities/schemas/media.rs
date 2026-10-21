use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "media.import.allocate" => vec![("kind", family())],
        "media.import.prepare" | "media.import.commit" => vec![
            (
                "kind",
                choices(&[
                    "picture",
                    "icon",
                    "portrait",
                    "combat-icon",
                    "special-land-tile",
                    "sound",
                    "music",
                    "text-resource",
                    "tileset",
                ]),
            ),
            ("name", text(256)),
            ("path", text(4096)),
            ("reversePath", nullable(text(4096))),
            ("resourceId", integer(-32768, 32767)),
            ("width", integer(1, 2048)),
            ("height", integer(1, 2048)),
            ("landlook", integer(-128, 127)),
            ("baseTile", integer(0, 200)),
            ("text", text(1024 * 1024)),
            ("replaceIdentity", nullable(identity())),
            (
                "settings",
                object(
                    json!({
                        "fit":choices(&["pad","crop","stretch"]),"filter":choices(&["crisp","smooth"]),
                        "transparency":choices(&["white","black","keep"]),"dither":{"type":"boolean"}
                    }),
                    &["fit", "filter", "transparency", "dither"],
                ),
            ),
        ],
        "media.metadata.apply" => vec![
            ("name", text(256)),
            ("landlook", integer(-128, 127)),
            ("baseTile", integer(0, 200)),
        ],
        _ => vec![],
    }
}

fn family() -> Value {
    choices(&[
        "picture",
        "icon",
        "portrait",
        "combat-icon",
        "special-land-tile",
        "sound",
        "music",
        "text-resource",
    ])
}
