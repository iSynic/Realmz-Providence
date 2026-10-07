//! Complete item drafts share one durable command and the ordinary project history.
use crate::request_params::{coerce_integral_numbers, required_u64, required_value};
use crate::stock_items::StockItems;
use providence_core::codecs::{
    ITEM_RECORD_BYTES, SCENARIO_ITEM_DEFINITIONS, encode_scenario_item_text_resources_for_draft,
    new_scenario_item_definition,
};
use providence_core::model::{BlobId, SourcedScenarioItemRule};
use providence_core::session::{EditorCommand, EditorSession, ItemRecordDraft};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    stock: Option<&StockItems>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    check_revision(session, &params)?;
    let store = store.ok_or("Open a portable project to author scenario items.")?;
    let family = Family::read(session, store)?;
    match method {
        "item.allocation.review" => allocation(session, stock, &family, &params),
        "item.clear.review" => clear(session, &params),
        "item.draft.prepare" | "item.draft.apply" => {
            apply(session, store, stock, family, method, &params)
        }
        _ => Err(format!("unknown item authoring command {method}")),
    }
}

fn check_revision(session: &EditorSession, params: &Value) -> Result<(), String> {
    let expected = required_u64(params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err(format!(
            "The project changed after this item was opened (expected {expected}, current {}). Keep your draft and reopen its destination.",
            session.revision().0
        ));
    }
    Ok(())
}

struct Family {
    binary: Vec<u8>,
    binary_blob: Option<BlobId>,
    text: Option<Vec<u8>>,
}

impl Family {
    fn read(session: &EditorSession, store: &ProjectStore) -> Result<Self, String> {
        let Some(first) = session.snapshot().scenario_item_rules.first() else {
            return Ok(Self {
                binary: vec![0; ITEM_RECORD_BYTES * SCENARIO_ITEM_DEFINITIONS],
                binary_blob: None,
                text: None,
            });
        };
        if session.snapshot().scenario_item_rules.iter().any(|rule| {
            rule.source_blob != first.source_blob || rule.text_source_blob != first.text_source_blob
        }) {
            return Err(
                "The retained item family has inconsistent sources. No draft was applied.".into(),
            );
        }
        Ok(Self {
            binary: store
                .read_blob(&first.source_blob)
                .map_err(|error| error.to_string())?,
            binary_blob: Some(first.source_blob.clone()),
            text: first
                .text_source_blob
                .as_ref()
                .map(|blob| store.read_blob(blob).map_err(|error| error.to_string()))
                .transpose()?,
        })
    }
}

fn allocation(
    session: &mut EditorSession,
    stock: Option<&StockItems>,
    family: &Family,
    params: &Value,
) -> Result<Value, String> {
    let destination = optional_record(params, "destinationRecordIndex")?;
    let mut allocation = session
        .allocate_scenario_item(Some(&family.binary), destination)
        .map_err(|error| error.to_string())?;
    if let Some(raw) = params.get("copySource").filter(|value| !value.is_null()) {
        let source = serde_json::from_value(raw.clone())
            .map_err(|error| format!("Invalid item copy source: {error}"))?;
        let mut definition = copy_definition(session, stock, &source)?;
        definition.id = allocation.draft.definition.id.clone();
        definition.classic_id = allocation.draft.definition.classic_id;
        allocation.draft.definition = definition;
        allocation.draft.copy_source = Some(source);
    }
    Ok(
        json!({"revision": session.revision(), "allocation": allocation,
        "occupiedDestinationsReplaced": 0, "localUntilApply": true}),
    )
}

fn clear(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let index = optional_record(params, "recordIndex")?.ok_or("Supply the item record index.")?;
    let current = session
        .snapshot()
        .scenario_item_rules
        .iter()
        .find(|rule| rule.record_index == index)
        .ok_or("The item to clear no longer exists.")?;
    let identity = &current.definition.id;
    let uses = session
        .references()
        .into_iter()
        .filter(|row| {
            row.target_kind == providence_core::references::TargetKind::Item
                && row.target_id == identity.0
        })
        .collect::<Vec<_>>();
    Ok(
        json!({"revision": session.revision(), "draft": ItemRecordDraft { record_index: index,
        definition: new_scenario_item_definition(index).map_err(|error| error.to_string())?, allocation: None, copy_source: None },
        "identityRetained": true, "incomingUses": uses.len(),
        "uses": uses.iter().take(64).collect::<Vec<_>>(), "usesTruncated": uses.len() > 64,
        "localUntilApply": true}),
    )
}

fn optional_record(params: &Value, key: &str) -> Result<Option<u16>, String> {
    params
        .get(key)
        .filter(|value| !value.is_null())
        .map(|value| {
            value
                .as_u64()
                .and_then(|value| u16::try_from(value).ok())
                .ok_or_else(|| format!("{key} must be a whole item record index."))
        })
        .transpose()
}

fn apply(
    session: &mut EditorSession,
    store: &ProjectStore,
    stock: Option<&StockItems>,
    family: Family,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let draft: ItemRecordDraft = serde_json::from_value(coerce_integral_numbers(
        required_value(params, "draft")?.clone(),
    ))
    .map_err(|error| format!("Invalid item draft: {error}"))?;
    let mut issues = session.item_draft_issues(&draft);
    if let Some(source) = &draft.copy_source {
        copy_definition(session, stock, source)?;
    }
    validate_allocation(session, &family, &draft)?;
    let rules = target_family(session, &family, &draft);
    let text = encode_scenario_item_text_resources_for_draft(
        &rules,
        family.text.as_deref(),
        &session.snapshot().scenario_item_rules,
    );
    if let Err(error) = &text {
        issues.push(error.to_string());
    }
    let changes = changed_fields(session, &draft);
    if method == "item.draft.prepare" {
        return Ok(prepared_reply(session, &draft, issues, changes));
    }
    if !issues.is_empty() {
        return Err(issues.join("\n"));
    }
    let binary_blob = match family.binary_blob {
        Some(blob) => blob,
        None => store
            .put_blob(&family.binary)
            .map_err(|error| error.to_string())?,
    };
    let text_blob = store
        .put_blob(&text.expect("Text issues were checked"))
        .map_err(|error| error.to_string())?;
    let identity = draft.definition.id.clone();
    let change = crate::execute(
        session,
        params,
        EditorCommand::ApplyScenarioItemDraft {
            draft: Box::new(draft),
            binary_blob,
            text_blob: Some(text_blob),
        },
    )?;
    let document =
        crate::session_routes::dispatch(session, "item.open", json!({"identity": identity}))?;
    Ok(json!({"change": change, "document": document, "changes": changes}))
}

fn prepared_reply(
    session: &EditorSession,
    draft: &ItemRecordDraft,
    issues: Vec<String>,
    changes: Vec<Value>,
) -> Value {
    json!({"revision": session.revision(), "valid": issues.is_empty(),
        "issues": issues, "changes": changes, "recordIndex": draft.record_index,
        "textFeedback": providence_core::codecs::inspect_item_text(&draft.definition),
        "effects": providence_core::item_reference_catalog::describe_item_effects(&draft.definition)})
}

fn validate_allocation(
    session: &EditorSession,
    family: &Family,
    draft: &ItemRecordDraft,
) -> Result<(), String> {
    if let Some(guard) = &draft.allocation {
        let reviewed = session
            .allocate_scenario_item(Some(&family.binary), Some(draft.record_index))
            .map_err(|error| error.to_string())?;
        if reviewed.draft.allocation.as_ref() != Some(guard) {
            return Err("The item allocation changed after review. Keep your draft and review another destination.".into());
        }
    } else if !session
        .snapshot()
        .scenario_item_rules
        .iter()
        .any(|row| row.record_index == draft.record_index)
    {
        return Err(
            "The item destination no longer exists. Review a new allocation; your draft is kept."
                .into(),
        );
    }
    Ok(())
}

fn copy_definition(
    session: &mut EditorSession,
    stock: Option<&StockItems>,
    source: &providence_core::session::ItemCopySource,
) -> Result<providence_core::model::ItemRuleDefinition, String> {
    let document = crate::item_catalog::dispatch(
        session,
        stock,
        "item.open",
        json!({"identity": source.identity}),
    )?;
    if document["copySource"] != serde_json::to_value(source).expect("Item copy source serializes")
    {
        return Err(
            "The item copy source changed after review. Review a new copy; your draft is kept."
                .into(),
        );
    }
    serde_json::from_value(document["item"].clone()).map_err(|error| error.to_string())
}

fn target_family(
    session: &EditorSession,
    family: &Family,
    draft: &ItemRecordDraft,
) -> Vec<SourcedScenarioItemRule> {
    let mut rules = session.snapshot().scenario_item_rules.clone();
    let rule = SourcedScenarioItemRule {
        record_index: draft.record_index,
        source: format!("Data NI record {}", draft.record_index),
        source_blob: family
            .binary_blob
            .clone()
            .unwrap_or_else(|| BlobId(String::new())),
        text_source_blob: None,
        definition: draft.definition.clone(),
    };
    if let Some(current) = rules
        .iter_mut()
        .find(|row| row.record_index == rule.record_index)
    {
        *current = rule;
    } else {
        rules.push(rule);
    }
    rules
}

fn changed_fields(session: &EditorSession, draft: &ItemRecordDraft) -> Vec<Value> {
    let before = session
        .snapshot()
        .scenario_item_rules
        .iter()
        .find(|row| row.record_index == draft.record_index)
        .map(|row| serde_json::to_value(&row.definition).expect("Item definition serializes"))
        .unwrap_or(Value::Null);
    let after = serde_json::to_value(&draft.definition).expect("Item definition serializes");
    after
        .as_object()
        .expect("Item definition is an object")
        .iter()
        .filter(|(field, value)| before.get(*field) != Some(*value))
        .map(|(field, value)| json!({"field": field, "before": before.get(field), "after": value}))
        .collect()
}
