use super::{
    decode_classic_text, diagnostic, metadata_preview, text_preview, u16_be,
    DecodedResourcePreview, DiagnosticExt, ResourcePreviewStatus,
};
use std::collections::BTreeMap;

pub(crate) fn inspect_text(
    data: &[u8],
    mut summary: BTreeMap<String, String>,
) -> DecodedResourcePreview {
    let text = decode_classic_text(data);
    summary.insert("characters".to_string(), text.chars().count().to_string());
    summary.insert("lines".to_string(), text.lines().count().to_string());
    text_preview(summary, text, Vec::new())
}

pub(crate) fn inspect_string_list(
    data: &[u8],
    mut summary: BTreeMap<String, String>,
) -> DecodedResourcePreview {
    let (strings, truncated) = decode_string_list(data);
    summary.insert("strings".to_string(), strings.len().to_string());
    let diagnostics = if truncated {
        vec![diagnostic(
            "warning",
            "str.truncated",
            "STR# resource ended before every declared Pascal string could be read.",
            "str",
        )]
    } else {
        Vec::new()
    };
    text_preview(summary, strings.join("\n"), diagnostics)
}

pub(crate) fn inspect_style(
    data: &[u8],
    mut summary: BTreeMap<String, String>,
) -> DecodedResourcePreview {
    let run_count = u16_be(data, 0).unwrap_or(0);
    summary.insert("styleRunCountCandidate".to_string(), run_count.to_string());
    summary.insert("styleBytes".to_string(), data.len().to_string());
    metadata_preview(
        ResourcePreviewStatus::MetadataOnly,
        "application/octet-stream",
        summary,
        diagnostic(
            "info",
            "styl.metadata_only",
            "styl resources are paired with TEXT resources; Providence inventories style runs but does not visually compose styled text yet.",
            "styl",
        )
        .with_variant("style-run-table"),
    )
}

pub(crate) fn inspect_version(
    data: &[u8],
    mut summary: BTreeMap<String, String>,
) -> DecodedResourcePreview {
    summary.insert(
        "majorMinor".to_string(),
        data.first()
            .map(|value| value.to_string())
            .unwrap_or_else(|| "missing".to_string()),
    );
    summary.insert(
        "stageAndRevision".to_string(),
        data.get(1)
            .map(|value| value.to_string())
            .unwrap_or_else(|| "missing".to_string()),
    );
    summary.insert(
        "versionText".to_string(),
        decode_classic_text(&data[data.len().min(6)..]),
    );
    metadata_preview(
        ResourcePreviewStatus::MetadataOnly,
        "application/octet-stream",
        summary,
        diagnostic(
            "info",
            "vers.metadata",
            "Version resource decoded as metadata.",
            "vers",
        ),
    )
}

pub(crate) fn inspect_rlmz(
    data: &[u8],
    mut summary: BTreeMap<String, String>,
) -> DecodedResourcePreview {
    summary.insert("nonzeroBytes".to_string(), nonzero_bytes(data).to_string());
    summary.insert(
        "textPreview".to_string(),
        decode_classic_text(&data[..data.len().min(240)]),
    );
    metadata_preview(
        ResourcePreviewStatus::MetadataOnly,
        "application/octet-stream",
        summary,
        diagnostic(
            "info",
            "rlmz.metadata",
            "RLMZ resource is Realmz-specific metadata; bytes are preserved and summarized for inspection.",
            "rlmz",
        )
        .with_variant("realmz-metadata"),
    )
}

fn decode_string_list(data: &[u8]) -> (Vec<String>, bool) {
    let Some(count) = u16_be(data, 0) else {
        return (Vec::new(), !data.is_empty());
    };
    let mut strings = Vec::new();
    let mut cursor = 2usize;
    let mut truncated = false;
    for _ in 0..count {
        if cursor >= data.len() {
            truncated = true;
            break;
        }
        let len = data[cursor] as usize;
        cursor += 1;
        let end = cursor + len;
        if end > data.len() {
            truncated = true;
            strings.push(decode_classic_text(&data[cursor..]));
            break;
        }
        strings.push(decode_classic_text(&data[cursor..end]));
        cursor = end;
    }
    (strings, truncated)
}

fn nonzero_bytes(data: &[u8]) -> usize {
    data.iter().filter(|byte| **byte != 0).count()
}
