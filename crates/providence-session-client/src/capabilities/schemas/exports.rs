use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "export.begin" => vec![
            ("format", choices(&["classic", "rebuilt"])),
            ("path", text(4096)),
            ("minimumEngineVersion", text(128)),
            ("packageFinalization", finalization()),
            (
                "replacement",
                object(json!({"expectedSha256":sha256()}), &[]),
            ),
        ],
        "project.compile-rebuilt-package" | "project.inspect-rebuilt-package" => {
            vec![("packageFinalization", finalization())]
        }
        "export.inspect-artifact" => vec![
            ("format", choices(&["classic", "rebuilt"])),
            ("path", text(4096)),
        ],
        "export.poll" => vec![
            (
                "jobId",
                json!({"type":"string","minLength":64,"maxLength":64}),
            ),
            ("fileOffset", integer(0, i64::MAX)),
            ("warningOffset", integer(0, i64::MAX)),
        ],
        "export.cancel" => vec![(
            "jobId",
            json!({"type":"string","minLength":64,"maxLength":64}),
        )],
        _ => vec![],
    }
}

fn finalization() -> Value {
    object(
        json!({
            "applicationPackage":text(4096),
            "applicationCampaignId":identity(),
            "applicationPackageHash":json!({"type":"string","minLength":64,"maxLength":64,"pattern":"^[a-f0-9]{64}$"}),
            "applicationMediaCatalogPath":text(4096),
            "classicApplicationDataDirectory":text(4096)
        }),
        &["applicationMediaCatalogPath"],
    )
}

fn sha256() -> Value {
    json!({"type":"string","minLength":64,"maxLength":64,"pattern":"^[a-f0-9]{64}$"})
}
