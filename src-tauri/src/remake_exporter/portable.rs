use crate::error::{ProvidenceError, Result};
use serde::Serialize;
use serde_json::Value;
use std::path::Path;

const OMITTED_FIELDS: [&str; 22] = [
    "rawBytes",
    "rawValues",
    "rawByte",
    "rawSignature",
    "trailingBytes",
    "codeseg1",
    "codeseg2",
    "reservedWords",
    "reserved",
    "spare",
    "spare1",
    "spare2",
    "spacer",
    "writerGate",
    "sourceBaseResourceBase64",
    "sourcePairedResourceBase64",
    "resourceBase64",
    "originalPath",
    "previewPath",
    "resourcePath",
    "imagePath",
    "mediaRequiredForProgression",
];

const SOURCE_FIELDS: [&str; 5] = [
    "source",
    "sourceFile",
    "nameSource",
    "metadataFile",
    "resourceFile",
];

pub(crate) fn portable_value(value: &impl Serialize) -> Result<Value> {
    let mut value = serde_json::to_value(value).map_err(|error| {
        ProvidenceError::message(format!("Failed to project canonical project data: {error}"))
    })?;
    sanitize_value(&mut value, None);
    Ok(value)
}

fn sanitize_value(value: &mut Value, field_name: Option<&str>) {
    match value {
        Value::Object(object) => {
            for field in OMITTED_FIELDS {
                object.remove(field);
            }
            for (key, child) in object.iter_mut() {
                sanitize_value(child, Some(key));
            }
        }
        Value::Array(values) => {
            for child in values {
                sanitize_value(child, field_name);
            }
        }
        Value::String(text) if field_name.is_some_and(|name| SOURCE_FIELDS.contains(&name)) => {
            *text = portable_source_label(text);
        }
        _ => {}
    }
}

pub(crate) fn portable_source_label(source: &str) -> String {
    let normalized = source.trim_start_matches("\\\\?\\").replace('\\', "/");
    if let Some(index) = normalized.rfind("/Data Files/") {
        return normalized[index + 1..].to_string();
    }
    if normalized.contains('/') || looks_absolute_path(&normalized) {
        return normalized
            .rsplit('/')
            .find(|value| !value.is_empty())
            .unwrap_or("unknown-source")
            .to_string();
    }
    normalized
}

pub(crate) fn portable_diagnostic_message(message: &str, source: Option<&str>) -> String {
    let Some(source) = source else {
        return message.to_string();
    };
    let label = portable_source_label(source);
    let mut portable = message.replace(source, &label);
    let normalized_source = source.trim_start_matches("\\\\?\\").replace('\\', "/");
    if normalized_source != source {
        portable = portable.replace(&normalized_source, &label);
    }
    portable
}

pub(crate) fn portable_project_diagnostic_message(
    message: &str,
    source: Option<&str>,
    project_dir: &Path,
) -> String {
    let mut portable = portable_diagnostic_message(message, source);
    let Some(source) = source else {
        return portable;
    };
    let source_label = portable_source_label(source);
    let project_dir = project_dir.to_string_lossy();
    for project in [
        project_dir.to_string(),
        project_dir.replace('\\', "/"),
        project_dir.replace('/', "\\"),
    ] {
        for separator in ['/', '\\'] {
            let raw_source = format!("{project}{separator}raw-sources{separator}{source_label}");
            portable = portable.replace(&raw_source, &source_label);
        }
    }
    portable
}

pub(crate) fn assert_portable_value(
    value: &Value,
    project_dir: &Path,
    context: &str,
) -> Result<()> {
    let project_root = project_dir
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase();
    assert_portable_value_inner(value, &project_root, context)
}

fn assert_portable_value_inner(value: &Value, project_root: &str, context: &str) -> Result<()> {
    match value {
        Value::String(text) => {
            let normalized = text.replace('\\', "/");
            let lower = normalized.to_ascii_lowercase();
            if lower.contains("data:") {
                return Err(ProvidenceError::message(format!(
                    "{context} contains an embedded data URI"
                )));
            }
            if (!project_root.is_empty() && lower.contains(project_root))
                || contains_filesystem_path(text)
            {
                return Err(ProvidenceError::message(format!(
                    "{context} contains a non-portable filesystem path: {text}"
                )));
            }
        }
        Value::Array(values) => {
            for child in values {
                assert_portable_value_inner(child, project_root, context)?;
            }
        }
        Value::Object(object) => {
            for child in object.values() {
                assert_portable_value_inner(child, project_root, context)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn contains_filesystem_path(text: &str) -> bool {
    if looks_absolute_path(text) {
        return true;
    }
    let bytes = text.as_bytes();
    for index in 0..bytes.len().saturating_sub(2) {
        let boundary = index == 0 || bytes[index - 1].is_ascii_whitespace();
        if boundary
            && bytes[index].is_ascii_alphabetic()
            && bytes[index + 1] == b':'
            && matches!(bytes[index + 2], b'/' | b'\\')
        {
            return true;
        }
    }
    false
}

fn looks_absolute_path(text: &str) -> bool {
    let bytes = text.as_bytes();
    text.starts_with("\\\\")
        || text.starts_with("//")
        || (text.starts_with('/')
            && (bytes.len() == 1
                || bytes[1].is_ascii_alphanumeric()
                || matches!(bytes[1], b'.' | b'_' | b'-')))
        || (bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && matches!(bytes[2], b'/' | b'\\'))
}

#[cfg(test)]
mod tests {
    use super::{
        contains_filesystem_path, portable_diagnostic_message, portable_project_diagnostic_message,
        portable_source_label,
    };
    use std::path::Path;

    #[test]
    fn authored_slash_prefixed_text_is_not_a_filesystem_path() {
        assert!(!contains_filesystem_path("/ Hn"));
        assert!(!contains_filesystem_path(
            "/   + j ; authored encounter text"
        ));
        assert!(!contains_filesystem_path("/=I_t"));
        assert!(!contains_filesystem_path("\\Z[ authored script text"));
    }

    #[test]
    fn absolute_paths_remain_detectable() {
        assert!(contains_filesystem_path("/tmp/scenario/Scenario.rsrc"));
        assert!(contains_filesystem_path("C:\\Scenarios\\Scenario.rsrc"));
        assert!(contains_filesystem_path("\\\\server\\share\\Scenario.rsrc"));
    }

    #[test]
    fn diagnostic_messages_replace_their_source_path() {
        let source = "C:\\Scenarios\\Dead of Night\\Scenario.rsrc";
        let message =
            "Scenario snd 24 in C:\\Scenarios\\Dead of Night\\Scenario.rsrc could not be decoded";
        assert_eq!(
            portable_diagnostic_message(message, Some(source)),
            "Scenario snd 24 in Scenario.rsrc could not be decoded"
        );
        assert_eq!(portable_source_label(source), "Scenario.rsrc");
        assert_eq!(
            portable_source_label("tmp/example.providence/raw-sources/Scenario.rsrc"),
            "Scenario.rsrc"
        );
    }

    #[test]
    fn project_diagnostic_messages_remove_preserved_raw_source_paths() {
        let message = "Scenario PICT 30015 in tmp/example.providence/raw-sources/Scenario.rsrc could not be decoded";
        assert_eq!(
            portable_project_diagnostic_message(
                message,
                Some("Scenario.rsrc"),
                Path::new("tmp/example.providence"),
            ),
            "Scenario PICT 30015 in Scenario.rsrc could not be decoded"
        );
    }
}
