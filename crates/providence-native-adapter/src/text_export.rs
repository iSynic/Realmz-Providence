use crate::validation_jobs;
use providence_core::{
    codecs::inspect_classic_text, rebuilt::ApplicationMediaCatalog, session::EditorSession,
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn text_export_check_projection(
    session: &EditorSession,
    params: &Value,
) -> Result<Value, String> {
    text_export_with_store(session, None, params)
}

pub(crate) fn text_export_with_store(
    session: &EditorSession,
    store: Option<&ProjectStore>,
    params: &Value,
) -> Result<Value, String> {
    let filter = TextExportFilter::from_params(params);
    let mut rows = string_rows(session, &filter.query);
    rows.extend(resource_rows(session, store, &filter.query));
    // The summary describes the complete source, regardless of the visible filter.
    let summary = summary(&rows);
    let matches = rows
        .into_iter()
        .filter(|row| filter.matches(row))
        .collect::<Vec<_>>();
    let matched = matches.len();
    let requested = filter.offset;
    let limit = filter.limit;
    let offset = if matched == 0 {
        0
    } else {
        requested.min((matched - 1) / limit * limit)
    };
    let items = matches
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|mut item| {
            item.as_object_mut().unwrap().remove("textMatch");
            item
        })
        .collect::<Vec<_>>();
    Ok(
        json!({"revision":session.revision(),"summary":summary,"items":items,"matched":matched,
        "offset":offset,"limit":limit,"truncated":offset+limit<matched}),
    )
}

struct TextExportFilter<'a> {
    query: String,
    include_ready: bool,
    family: &'a str,
    limit: usize,
    offset: usize,
}

impl<'a> TextExportFilter<'a> {
    fn from_params(params: &'a Value) -> Self {
        let query = params
            .get("query")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_lowercase();
        let include_ready = params
            .get("includeReady")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let family = params
            .get("family")
            .and_then(Value::as_str)
            .unwrap_or("all");
        let limit = params
            .get("limit")
            .and_then(Value::as_u64)
            .unwrap_or(64)
            .clamp(1, 128) as usize;
        let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
        Self {
            query,
            include_ready,
            family,
            limit,
            offset,
        }
    }

    fn matches(&self, row: &Value) -> bool {
        (self.include_ready || row["needsReview"] == true)
            && (self.family == "all" || row["family"] == self.family)
            && (self.query.is_empty()
                || row["nativeId"].to_string().contains(&self.query)
                || row["label"]
                    .as_str()
                    .unwrap_or_default()
                    .to_lowercase()
                    .contains(&self.query)
                || row["textMatch"] == true)
    }
}

fn string_rows(session: &EditorSession, query: &str) -> Vec<Value> {
    let mut rows = session
        .snapshot()
        .messages
        .iter()
        .map(|message| {
            row(
                "message",
                &message.identity.0,
                message.native_id.0 as i64,
                "",
                &message.text,
                Some(255),
                query,
            )
        })
        .collect::<Vec<_>>();
    if providence_core::text_authoring::option_labels_present(session.snapshot()) {
        rows.extend(session.snapshot().option_labels.iter().map(|label| {
            row(
                "option-label",
                &label.identity.0,
                label.native_id.0 as i64,
                "",
                &label.text,
                Some(24),
                query,
            )
        }));
    }
    rows.sort_by_key(|value| {
        (
            value["family"].as_str().unwrap_or_default().to_owned(),
            value["nativeId"].as_i64().unwrap_or_default(),
        )
    });
    rows
}

fn resource_rows(session: &EditorSession, store: Option<&ProjectStore>, query: &str) -> Vec<Value> {
    let mut rows = Vec::new();
    for asset in session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| asset.kind == "text-resource")
    {
        let id = asset
            .classic_resource
            .as_ref()
            .map_or(0, |key| key.resource_id) as i64;
        let loaded = store
            .ok_or_else(|| "Open a persistent project to check scrolling text.".to_string())
            .and_then(|store| {
                store
                    .read_blob(&asset.blob)
                    .map_err(|error| error.to_string())
            })
            .and_then(|bytes| {
                String::from_utf8(bytes)
                    .map_err(|_| "Scrolling text is not readable as UTF-8.".into())
            });
        let mut item = row(
            "text-resource",
            &asset.identity.0,
            id,
            &asset.label,
            loaded.as_deref().unwrap_or_default(),
            None,
            query,
        );
        if let Err(error) = loaded {
            item["readError"] = json!(error);
            item["needsReview"] = json!(true);
            item["classicReady"] = json!(false);
            item["status"] = json!("blocked");
        }
        rows.push(item);
    }
    rows.sort_by_key(|value| value["nativeId"].as_i64().unwrap_or_default());
    rows
}

fn row(
    family: &str,
    identity: &str,
    native_id: i64,
    label: &str,
    text: &str,
    limit: Option<usize>,
    query: &str,
) -> Value {
    let feedback = inspect_classic_text(text, limit);
    let preview = text.chars().take(120).collect::<String>();
    let mut issues = feedback.issues.iter().map(|issue| {
        let context = text.chars().skip(issue.character_index.saturating_sub(24)).take(49).collect::<String>();
        json!({"characterIndex":issue.character_index,"line":issue.line,"column":issue.column,"character":issue.character,"context":context})
    }).collect::<Vec<_>>();
    if feedback.too_long {
        let index = limit.unwrap_or_default();
        let prefix = text.chars().take(index).collect::<String>();
        issues.insert(0,json!({"characterIndex":index,"line":prefix.chars().filter(|character| *character=='\n').count()+1,"column":prefix.rsplit('\n').next().unwrap_or_default().chars().count()+1,"reason":"Classic byte limit exceeded"}));
    }
    let codes = [
        feedback
            .too_long
            .then(|| format!("classic.{family}.text-too-long")),
        (feedback.replacement_characters > 0)
            .then(|| format!("classic.{family}.character-replaced")),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();
    json!({"family":family,"identity":identity,"nativeId":native_id,"label":label,"preview":preview,
        "previewTruncated":text.chars().count()>120,"textMatch":!query.is_empty() && text.to_lowercase().contains(query),"encodedBytes":feedback.encoded_bytes,
        "classicMaximumBytes":limit,"replacementCharacters":feedback.replacement_characters,
        "classicReady":feedback.valid,"needsReview":!feedback.valid,"feedback":feedback,"issues":issues,
        "status":if feedback.too_long {"blocked"} else if feedback.replacement_characters>0 {"replacement-risk"} else {"clean"},
        "codes":codes,
        "navigation":{"documentKind":family,"identity":identity,"nativeId":native_id}})
}

fn summary(rows: &[Value]) -> Value {
    let count = |family: &str| rows.iter().filter(|row| row["family"] == family).count();
    let issues = rows.iter().filter(|row| row["needsReview"] == true).count();
    json!({"messages":count("message"),"optionLabels":count("option-label"),"textResources":count("text-resource"),
        "total":rows.len(),"ready":rows.len()-issues,"issues":issues,
        "tooLong":rows.iter().filter(|row|row["feedback"]["tooLong"]==true).count(),
        "replacementMessages":rows.iter().filter(|row|row["replacementCharacters"].as_u64().unwrap_or_default()>0).count(),
        "replacementCharacters":rows.iter().map(|row|row["replacementCharacters"].as_u64().unwrap_or_default()).sum::<u64>()})
}

pub(crate) fn validation_list_projection(
    session: &EditorSession,
    application_media: Option<&ApplicationMediaCatalog>,
    params: &Value,
) -> Result<Value, String> {
    validation_jobs::project(session, application_media, params)
}
