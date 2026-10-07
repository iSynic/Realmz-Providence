use crate::{
    execute,
    request_params::{coerce_integral_numbers, required_string, required_u64},
};
use providence_core::{
    codecs::{encode_classic_text_payload, inspect_classic_text},
    model::{AssetDescriptor, ClassicResourceKey, StableId},
    session::{EditorCommand, EditorSession},
    text_styles::{StyleTable, TextStyleEdit, font_name, prepare_text_style_draft},
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let store = store.ok_or("Open a persistent project before editing scrolling text.")?;
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("revision conflict: the scrolling text changed. Review the saved version before applying.".into());
    }
    let identity = StableId(required_string(params, "identity")?);
    let text_asset = session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity == identity && asset.kind == "text-resource")
        .cloned()
        .ok_or("The selected scrolling text no longer exists.")?;
    let original = String::from_utf8(
        store
            .read_blob(&text_asset.blob)
            .map_err(|error| error.to_string())?,
    )
    .map_err(|_| "The scrolling text cannot be read as UTF-8.")?;
    let style = read_style(session, store, &text_asset)?;
    let edits: Vec<TextStyleEdit> = serde_json::from_value(coerce_integral_numbers(
        params.get("edits").cloned().unwrap_or_else(|| json!([])),
    ))
    .map_err(|error| format!("invalid formatting draft: {error}"))?;
    let prepared = prepare(
        &original,
        style.as_ref().map(|pair| pair.1.as_slice()),
        &edits,
    )?;
    let feedback = inspect_classic_text(&prepared.text, None);
    if method == "text-resource.inspect-styles" {
        return Ok(
            json!({"revision":session.revision(),"identity":identity,"text":prepared.text,"feedback":feedback,
            "styles":style_projection(prepared.table.as_ref(),prepared.text.chars().count()),"styleEditable":prepared.style_error.is_none(),"styleError":prepared.style_error,
            "hasStyleCompanion":prepared.table.is_some() || style.is_some()}),
        );
    }
    if method != "text-resource.apply-styles" {
        return Err(format!("unknown text style method {method}"));
    }
    apply(
        session, store, params, text_asset, &original, style, prepared,
    )
}

fn apply(
    session: &mut EditorSession,
    store: &ProjectStore,
    params: &Value,
    text_asset: AssetDescriptor,
    original: &str,
    style: Option<(AssetDescriptor, Vec<u8>)>,
    prepared: Prepared,
) -> Result<Value, String> {
    let identity = text_asset.identity.clone();
    let mut text = text_asset.clone();
    if let Some(label) = params.get("label").and_then(Value::as_str) {
        if label.trim().is_empty()
            || label.chars().any(char::is_control)
            || !inspect_classic_text(label, Some(255)).valid
        {
            return Err("Give scrolling text a nonempty MacRoman name of at most 255 bytes, without control characters.".into());
        }
        text.label = label.into();
    }
    if prepared.text != original {
        store_text_payload(store, &mut text, &prepared.text)?;
    }

    let style_bytes = prepared.table.as_ref().map(StyleTable::encode);
    let style_changed = style_bytes
        .as_ref()
        .is_some_and(|bytes| style.as_ref().is_none_or(|pair| &pair.1 != bytes));
    let command = if style_changed {
        let bytes = style_bytes.unwrap();
        let number = text
            .classic_resource
            .as_ref()
            .ok_or("The scrolling text has no exact Classic identity.")?
            .resource_id;
        let mut descriptor = style
            .as_ref()
            .map(|pair| pair.0.clone())
            .unwrap_or_else(|| new_style_descriptor(&text, number));
        let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
        descriptor.blob = blob.clone();
        descriptor.byte_length = bytes.len() as u64;
        descriptor.classic_payload_blob = Some(blob);
        descriptor.classic_payload_byte_length = Some(bytes.len() as u64);
        EditorCommand::UpsertTextResourcePair {
            text: Box::new(text),
            style: Box::new(descriptor),
        }
    } else {
        EditorCommand::UpsertAsset {
            asset: Box::new(text),
        }
    };
    let mut result = execute(session, params, command)?;
    result["identity"] = json!(identity);
    Ok(result)
}

fn store_text_payload(
    store: &ProjectStore,
    text: &mut AssetDescriptor,
    content: &str,
) -> Result<(), String> {
    let classic = encode_classic_text_payload(content).map_err(|error| error.to_string())?;
    text.blob = store
        .put_blob(content.as_bytes())
        .map_err(|error| error.to_string())?;
    text.byte_length = content.len() as u64;
    text.classic_payload_blob = Some(
        store
            .put_blob(&classic)
            .map_err(|error| error.to_string())?,
    );
    text.classic_payload_byte_length = Some(classic.len() as u64);
    Ok(())
}

pub(crate) fn read_style(
    session: &EditorSession,
    store: &ProjectStore,
    text: &AssetDescriptor,
) -> Result<Option<(AssetDescriptor, Vec<u8>)>, String> {
    let key = text
        .classic_resource
        .as_ref()
        .ok_or("The scrolling text has no exact Classic identity.")?;
    let matches = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| {
            asset.classic_resource.as_ref().is_some_and(|candidate| {
                candidate.resource_type == "styl" && candidate.resource_id == key.resource_id
            })
        })
        .take(2)
        .collect::<Vec<_>>();
    if matches.len() > 1
        || matches
            .first()
            .is_some_and(|asset| asset.kind != "text-style-resource")
    {
        return Err("This scrolling text has ambiguous formatting. Repair the exact source before editing it.".into());
    }
    matches
        .first()
        .map(|asset| {
            Ok((
                (*asset).clone(),
                store
                    .read_blob(&asset.blob)
                    .map_err(|error| error.to_string())?,
            ))
        })
        .transpose()
}

struct Prepared {
    text: String,
    table: Option<StyleTable>,
    style_error: Option<String>,
}

fn prepare(
    original: &str,
    style: Option<&[u8]>,
    edits: &[TextStyleEdit],
) -> Result<Prepared, String> {
    let malformed =
        style.and_then(|bytes| StyleTable::decode(bytes, original.chars().count()).err());
    if let Some(error) = malformed {
        if edits
            .iter()
            .any(|edit| !matches!(edit, TextStyleEdit::ReplaceText { .. }))
        {
            return Err(error);
        }
        let (text, _) = prepare_text_style_draft(original, None, edits)?;
        if text.chars().count() != original.chars().count() {
            return Err(format!(
                "{error} Keep its text length unchanged until formatting is repaired."
            ));
        }
        return Ok(Prepared {
            text,
            table: None,
            style_error: Some(error),
        });
    }
    let (text, table) = prepare_text_style_draft(original, style, edits)?;
    Ok(Prepared {
        text,
        table,
        style_error: None,
    })
}

pub(crate) fn style_projection(table: Option<&StyleTable>, length: usize) -> Vec<Value> {
    table.map(|table| table.runs.iter().enumerate().map(|(index,run)| json!({
        "start":run.start,"end":table.runs.get(index+1).map_or(length as u32,|next| next.start),
        "font":run.font,"fontName":font_name(run.font),"size":run.size,"face":run.face,"color":run.color,
        "unsupported":font_name(run.font).is_none() || run.face & !7 != 0 || run.size<=0,
        "removable":run.padding==0 && run.face & !7 == 0 && font_name(run.font).is_some() && run.size>0
    })).collect()).unwrap_or_default()
}

fn new_style_descriptor(text: &AssetDescriptor, number: i32) -> AssetDescriptor {
    let mut style = text.clone();
    style.identity = StableId(format!("text-style:{number}"));
    style.label = format!("{} formatting", text.label);
    style.kind = "text-style-resource".into();
    style.mime_type = Some("application/octet-stream".into());
    style.classic_resource = Some(ClassicResourceKey {
        resource_type: "styl".into(),
        resource_id: number,
    });
    style.extension = Some("styl".into());
    style
}

fn new_draft(params: &Value) -> Result<(String, Option<StyleTable>), String> {
    let edits: Vec<TextStyleEdit> = serde_json::from_value(coerce_integral_numbers(
        params.get("edits").cloned().unwrap_or_else(|| json!([])),
    ))
    .map_err(|error| format!("invalid formatting draft: {error}"))?;
    prepare_text_style_draft("", None, &edits)
}

pub(crate) fn inspect_new(session: &EditorSession, params: &Value) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("revision conflict: check this new text draft again.".into());
    }
    let (text, table) = new_draft(params)?;
    Ok(
        json!({"revision":session.revision(),"feedback":inspect_classic_text(&text,None),
        "styles":style_projection(table.as_ref(),text.chars().count()),"styleEditable":true}),
    )
}

pub(crate) fn new_command(
    store: &ProjectStore,
    text: AssetDescriptor,
    params: &Value,
    retained_style: bool,
) -> Result<EditorCommand, String> {
    if params.get("edits").is_none() {
        return Ok(EditorCommand::UpsertAsset {
            asset: Box::new(text),
        });
    }
    let (content, table) = new_draft(params)?;
    if content != required_string(params, "text")? {
        return Err(
            "The text and formatting draft disagree. Review the draft before creating.".into(),
        );
    }
    let Some(table) = table else {
        return Ok(EditorCommand::UpsertAsset {
            asset: Box::new(text),
        });
    };
    if retained_style {
        return Err("Existing formatting must remain unchanged. Choose an unused text number to author new formatting.".into());
    }
    let number = text
        .classic_resource
        .as_ref()
        .ok_or("Text has no exact resource number.")?
        .resource_id;
    let mut style = new_style_descriptor(&text, number);
    let bytes = table.encode();
    let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
    style.blob = blob.clone();
    style.byte_length = bytes.len() as u64;
    style.classic_payload_blob = Some(blob);
    style.classic_payload_byte_length = Some(bytes.len() as u64);
    Ok(EditorCommand::UpsertTextResourcePair {
        text: Box::new(text),
        style: Box::new(style),
    })
}

pub(crate) fn open_projection(
    session: &EditorSession,
    store: &ProjectStore,
    text: &AssetDescriptor,
    content: &str,
) -> Result<serde_json::Map<String, Value>, String> {
    let style = read_style(session, store, text)?;
    let parsed = style
        .as_ref()
        .map(|(_, bytes)| StyleTable::decode(bytes, content.chars().count()));
    let error = parsed.as_ref().and_then(|result| result.as_ref().err());
    let table = parsed.as_ref().and_then(|result| result.as_ref().ok());
    let value = json!({"styles":style_projection(table,content.chars().count()),"styleEditable":error.is_none(),"styleError":error,
        "feedback":inspect_classic_text(content,None),"textBlob":text.blob,"styleBlob":style.as_ref().map(|(asset,_)|&asset.blob)});
    Ok(value.as_object().unwrap().clone())
}
