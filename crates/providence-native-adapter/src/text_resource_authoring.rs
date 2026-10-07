use std::{fs::File, io::Read};

use providence_core::{
    codecs::{encode_classic_text_payload, parse_resource_entries_preserving_duplicates},
    model::{AssetDescriptor, ClassicResourceKey, ProjectSnapshot, StableId},
    session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

const MAX_INPUT_BYTES: usize = 1024 * 1024;

pub(super) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    Some(match method {
        "text-resource.prepare-import" => prepare_import(session, params),
        "text-resource.check-number" => check_number(session, store, params),
        "text-resource.validate-draft" => validate_draft(session, params),
        "text-resource.create" => create(session, store, params),
        "text-resource.inspect-new-styles" => {
            crate::text_style_drafts::inspect_new(session, params)
        }
        _ => return None,
    })
}

pub(super) fn validate_draft(session: &EditorSession, params: &Value) -> Result<Value, String> {
    check_revision(session, params)?;
    let label = crate::request_params::required_string(params, "label")?;
    let text = crate::request_params::required_string(params, "text")?;
    let name_error = validated_label(&label).err();
    let text_error = validated_text(&text).err();
    Ok(
        json!({"revision": session.revision(), "valid": name_error.is_none() && text_error.is_none(),
        "nameError": name_error, "textError": text_error, "projectChanged": false}),
    )
}

fn check_revision(session: &EditorSession, params: &Value) -> Result<(), String> {
    let expected = crate::request_params::required_u64(params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err(format!(
            "revision conflict: expected {expected}, current revision is {}",
            session.revision().0
        ));
    }
    Ok(())
}

pub(super) fn prepare_import(session: &EditorSession, params: &Value) -> Result<Value, String> {
    check_revision(session, params)?;
    let path = crate::request_params::required_string(params, "path")?;
    let mut bytes = Vec::new();
    File::open(&path)
        .map_err(|error| format!("Could not open the text file: {error}"))?
        .take((MAX_INPUT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read the text file: {error}"))?;
    if bytes.len() > MAX_INPUT_BYTES {
        return Err("Text import supports UTF-8 files up to 1 MiB. Nothing was imported.".into());
    }
    let source_bytes = bytes.len();
    let source = String::from_utf8(bytes)
        .map_err(|_| "This file is not valid UTF-8. Save a UTF-8 copy, then try again.")?;
    let bom_removed = source.starts_with('\u{feff}');
    let source = source.strip_prefix('\u{feff}').unwrap_or(&source);
    let line_endings_normalized = source.contains('\r');
    let text = source.replace("\r\n", "\n").replace('\r', "\n");
    let encoded = encode_classic_text_payload(&text);
    Ok(json!({
        "revision": session.revision(), "text": text, "sourceBytes": source_bytes,
        "bomRemoved": bom_removed, "lineEndingsNormalized": line_endings_normalized,
        "classicCompatible": encoded.is_ok(),
        "encodingError": encoded.err().map(|error| error.to_string()),
        "projectChanged": false,
    }))
}

pub(super) fn check_number(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: &Value,
) -> Result<Value, String> {
    check_revision(session, params)?;
    let store = store.ok_or("Open a persistent project before creating text.")?;
    let number = i16::try_from(crate::request_params::required_i64(params, "resourceId")?)
        .map_err(|_| "Choose a text number from -32768 to 32767, excluding zero.")?;
    if number == 0 {
        return Err(
            "Text number zero cannot be used for scrolling text. Choose another number.".into(),
        );
    }
    let key_matches = |asset: &&AssetDescriptor, kind: &str| {
        asset
            .classic_resource
            .as_ref()
            .is_some_and(|key| key.resource_type == kind && key.resource_id == i32::from(number))
    };
    let result = |available: bool, reason: &str, style: Value| {
        json!({"revision": session.revision(), "resourceId": number,
            "available": available, "reason": reason, "styleCompanion": style})
    };
    let snapshot = session.snapshot();
    if snapshot
        .assets
        .iter()
        .any(|asset| key_matches(&asset, "TEXT") || asset.identity.0 == format!("text:{number}"))
    {
        return Ok(result(
            false,
            "This text number is already used. Open the existing text or choose another number.",
            Value::Null,
        ));
    }
    let styles: Vec<_> = snapshot
        .assets
        .iter()
        .filter(|asset| key_matches(asset, "styl"))
        .take(2)
        .collect();
    if styles.len() > 1
        || styles
            .first()
            .is_some_and(|style| style.kind != "text-style-resource")
    {
        return Ok(result(
            false,
            "The matching formatting is ambiguous or unavailable. Choose another text number.",
            Value::Null,
        ));
    }
    if let Some(reason) = retained_conflict(snapshot, store, number, !styles.is_empty())? {
        return Ok(result(false, reason, Value::Null));
    }
    let style = styles
        .first()
        .map(|asset| json!({"identity": asset.identity, "label": asset.label}));
    Ok(result(true, "", style.unwrap_or(Value::Null)))
}

fn retained_conflict(
    snapshot: &ProjectSnapshot,
    store: &ProjectStore,
    number: i16,
    has_style: bool,
) -> Result<Option<&'static str>, String> {
    for source in &snapshot.classic_sources {
        if !source.native_path.eq_ignore_ascii_case("Scenario.rsrc") {
            continue;
        }
        if source.byte_length > 16 * 1024 * 1024 {
            return Err(
                "The scenario resource file is too large to check safely. Nothing was created."
                    .into(),
            );
        }
        let bytes = store
            .read_blob(&source.blob)
            .map_err(|error| error.to_string())?;
        let entries = parse_resource_entries_preserving_duplicates(&bytes)
            .map_err(|error| error.to_string())?;
        if entries
            .iter()
            .any(|entry| entry.resource_type == *b"TEXT" && entry.id == number)
        {
            return Ok(Some(
                "This text number is retained by the scenario. Choose another number; no existing text will be replaced.",
            ));
        }
        let retained_styles = entries
            .iter()
            .filter(|entry| entry.resource_type == *b"styl" && entry.id == number)
            .count();
        if retained_styles > 1 || (retained_styles == 1 && !has_style) {
            return Ok(Some(
                "Existing formatting cannot be paired safely in this project. Choose another text number.",
            ));
        }
    }
    Ok(None)
}

pub(super) fn create(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    params: &Value,
) -> Result<Value, String> {
    let checked = check_number(session, store, params)?;
    if checked["available"] != true {
        return Err(checked["reason"]
            .as_str()
            .unwrap_or("Text number is unavailable.")
            .into());
    }
    if let Some(style) = checked["styleCompanion"]["identity"].as_str()
        && params.get("preserveStyleIdentity").and_then(Value::as_str) != Some(style)
    {
        return Err("This text has existing formatting. Review and explicitly preserve that formatting before creating the text.".into());
    }
    let (text, label, classic) = validated_draft(params)?;
    let store = store.ok_or("Open a persistent project before creating text.")?;
    let number = checked["resourceId"].as_i64().expect("checked text number") as i32;
    let asset = stored_asset(store, number, label, &text, &classic)?;
    let identity = asset.identity.clone();
    let command = crate::text_style_drafts::new_command(
        store,
        asset,
        params,
        checked["styleCompanion"].is_object(),
    )?;
    let mut result = crate::execute(session, params, command)?;
    if let Some(object) = result.as_object_mut() {
        object.insert("identity".into(), json!(identity));
        object.insert("resourceId".into(), json!(number));
        object.insert("resourceType".into(), json!("TEXT"));
    }
    Ok(result)
}

fn validated_draft(params: &Value) -> Result<(String, String, Vec<u8>), String> {
    let text = crate::request_params::required_string(params, "text")?;
    let label = crate::request_params::required_string(params, "label")?;
    validated_label(&label)?;
    let classic = validated_text(&text)?;
    Ok((text, label, classic))
}

fn validated_text(text: &str) -> Result<Vec<u8>, String> {
    if text.len() > MAX_INPUT_BYTES {
        return Err("New text supports up to 1 MiB of UTF-8 content. Nothing was created.".into());
    }
    if text.contains('\r') {
        return Err(
            "New text must use LF line endings. Reload the file through text import.".into(),
        );
    }
    encode_classic_text_payload(text).map_err(|error| error.to_string())
}

fn validated_label(label: &str) -> Result<(), String> {
    if label.trim().is_empty() || label.chars().any(char::is_control) {
        return Err("Give this text a nonempty name without control characters.".into());
    }
    let label_bytes = encode_classic_text_payload(label).map_err(|error| error.to_string())?;
    if label_bytes.len() > 255 {
        return Err("The text name must fit in 255 Classic characters.".into());
    }
    Ok(())
}

fn stored_asset(
    store: &ProjectStore,
    number: i32,
    label: String,
    text: &str,
    classic: &[u8],
) -> Result<AssetDescriptor, String> {
    let runtime_blob = store
        .put_blob(text.as_bytes())
        .map_err(|error| error.to_string())?;
    let classic_blob = store.put_blob(classic).map_err(|error| error.to_string())?;
    let identity = StableId(format!("text:{number}"));
    Ok(AssetDescriptor {
        identity: identity.clone(),
        label,
        kind: "text-resource".into(),
        mime_type: Some("text/plain".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "TEXT".into(),
            resource_id: number,
        }),
        scenario_music_slot: None,
        blob: runtime_blob,
        byte_length: text.len() as u64,
        classic_payload_blob: Some(classic_blob),
        classic_payload_byte_length: Some(classic.len() as u64),
        extension: Some("txt".into()),
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "authored text".into(),
    })
}
