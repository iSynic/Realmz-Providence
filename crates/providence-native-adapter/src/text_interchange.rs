use crate::{
    execute,
    request_params::{required_string, required_u64},
};
use providence_core::session::{EditorCommand, EditorSession};
use providence_core::text_authoring::{
    MessageTextChange, export_divinity_text, message_draft_feedback, review_divinity_text,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::io::Read;

pub(crate) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "text.export-file" => export_file(session, &params),
        "text.import-review" => review_page(session, &params),
        "text.import-inspect" => inspect_change(session, &params),
        "text.import-apply" => apply_review(session, &params),
        _ => Err(format!("unknown text interchange method {method}")),
    }
}

fn export_file(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let path = required_string(params, "path")?;
    let content = export_divinity_text(&session.snapshot().messages)?;
    std::fs::write(&path, content.as_bytes())
        .map_err(|error| format!("Export Text could not write the selected file: {error}"))?;
    Ok(
        json!({"revision":session.revision(), "strings":session.snapshot().messages.len(), "bytes":content.len()}),
    )
}

struct Review {
    changes: Vec<MessageTextChange>,
    token: String,
}

fn prepare(session: &EditorSession, params: &Value) -> Result<Review, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The scenario changed since Import Text was opened. Prepare a new review; nothing was changed.".into());
    }
    let path = required_string(params, "path")?;
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .and_then(|file| file.take(16 * 1024 * 1024 + 1).read_to_end(&mut bytes))
        .map_err(|error| format!("Import Text could not read the selected file: {error}"))?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("Import Text supports files up to 16 MiB; nothing was changed.".into());
    }
    let content = std::str::from_utf8(&bytes)
        .map_err(|_| "Import Text requires a UTF-8 file; nothing was changed.")?;
    let changes = review_divinity_text(&session.snapshot().messages, content)?;
    let mut hash = Sha256::new();
    hash.update(session.revision().0.to_be_bytes());
    hash.update(&bytes);
    hash.update(
        serde_json::to_vec(&session.snapshot().messages).map_err(|error| error.to_string())?,
    );
    let token = format!("{:x}", hash.finalize());
    if params
        .get("reviewToken")
        .and_then(Value::as_str)
        .is_some_and(|expected| expected != token)
    {
        return Err("The text file or string allocation changed since review. Prepare a new review; nothing was changed.".into());
    }
    Ok(Review { changes, token })
}

fn review_page(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let review = prepare(session, params)?;
    let total = review.changes.len();
    let invalid = review
        .changes
        .iter()
        .filter(|change| !message_draft_feedback(&change.text).valid)
        .count();
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(3)
        .clamp(1, 32) as usize;
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let offset = if total == 0 {
        0
    } else {
        offset.min((total - 1) / limit * limit)
    };
    let items = review
        .changes
        .iter()
        .skip(offset)
        .take(limit)
        .map(|change| {
            json!({
        "identity":change.identity, "nativeId":change.native_id,
        "currentPreview":change.expected_text.chars().take(200).collect::<String>(),
        "importedPreview":change.text.chars().take(200).collect::<String>(),
        "currentTruncated":change.expected_text.chars().count() > 200,
        "importedTruncated":change.text.chars().count() > 200,
        "feedback":message_draft_feedback(&change.text)})
        })
        .collect::<Vec<_>>();
    Ok(
        json!({"revision":session.revision(), "reviewToken":review.token, "total":total,
        "strings":session.snapshot().messages.len(), "invalid":invalid, "canApply":total > 0 && invalid == 0,
        "items":items, "offset":offset, "limit":limit, "truncated":offset + limit < total}),
    )
}

fn inspect_change(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let review = prepare(session, params)?;
    let identity = required_string(params, "identity")?;
    let change = review
        .changes
        .iter()
        .find(|change| change.identity.0 == identity)
        .ok_or("This change is absent from the current review")?;
    Ok(
        json!({"revision":session.revision(), "reviewToken":review.token, "change":change,
        "feedback":message_draft_feedback(&change.text)}),
    )
}

fn apply_review(session: &mut EditorSession, params: &Value) -> Result<Value, String> {
    required_string(params, "reviewToken")?;
    let review = prepare(session, params)?;
    execute(
        session,
        params,
        EditorCommand::AuthorStrings(providence_core::text_authoring::StringEdit::Import {
            changes: review.changes,
        }),
    )
}
