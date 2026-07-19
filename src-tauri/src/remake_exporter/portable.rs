use crate::error::{ProvidenceError, Result};
use serde::Serialize;
use serde_json::Value;
use std::path::Path;

const OMITTED_FIELDS: [&str; 21] = [
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
    if looks_absolute_path(&normalized) {
        return normalized
            .rsplit('/')
            .find(|value| !value.is_empty())
            .unwrap_or("unknown-source")
            .to_string();
    }
    normalized
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
                || contains_filesystem_path(&normalized)
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
    text.starts_with('/')
        || text.starts_with("\\\\")
        || text.starts_with("//")
        || (bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && matches!(bytes[2], b'/' | b'\\'))
}
