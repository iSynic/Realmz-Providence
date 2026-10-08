use providence_core::{
    compiler::{NativeManifest, export_trim},
    session::EditorSession,
};
use serde_json::{Value, json};

pub(crate) fn prepare(
    session: &EditorSession,
    manifest: &mut NativeManifest,
    original: Option<&[u8]>,
    params: &Value,
    publishing: bool,
) -> Result<Value, String> {
    let selected = match params.get("trimExtraCodeTail") {
        None | Some(Value::Bool(false)) => false,
        Some(Value::Bool(true)) => true,
        _ => return Err("trimExtraCodeTail must be a boolean".into()),
    };
    let preview = export_trim::preview(session.snapshot(), manifest, original);
    if selected && !preview.reason.is_empty() {
        return Err(preview.reason.into());
    }
    if selected && publishing {
        crate::classic_stuffit::validate_revision(params, session.revision().0)?;
        if params.get("acknowledgeTrim") != Some(&Value::Bool(true)) {
            return Err(
                "Confirm that trimming removes retained bytes from the exported copy.".into(),
            );
        }
    }
    if selected {
        export_trim::apply(session.snapshot(), manifest, original);
    }
    let digest = manifest.deterministic_sha256();
    if selected
        && publishing
        && params.get("manifestSha256").and_then(Value::as_str) != Some(&digest)
    {
        return Err("The trimmed export plan changed. Recheck before exporting.".into());
    }
    Ok(json!({"selected": selected, "preview": preview, "manifestSha256": digest}))
}

pub(crate) fn attach(result: &mut Value, trim: Value) {
    result["manifestSha256"] = trim["manifestSha256"].clone();
    if trim["selected"] == true && trim["preview"]["removableBytes"].as_u64().unwrap_or(0) > 0 {
        let message = format!(
            "Removed {} trailing Data EDCD bytes from this export. The project retains the original bytes.",
            trim["preview"]["removableBytes"]
        );
        if !result["warnings"].is_array() {
            result["warnings"] = json!([]);
        }
        result["warnings"]
            .as_array_mut()
            .unwrap()
            .push(json!({"code":"export.extra-code-tail.trimmed", "message":message}));
    }
    result["trim"] = trim;
}

#[cfg(test)]
mod tests;
