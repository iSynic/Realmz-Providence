//! Spell draft validation and Apply reuse the durable project acknowledgement path.
use crate::{
    request_params::{coerce_integral_numbers, required_u64, required_value},
    stock_spells::StockSpells,
};
use providence_core::{
    codecs::{encode_scenario_spell_name_resources, encode_scenario_spells},
    model::SourcedSpellDefinition,
    session::{
        EditorCommand, EditorSession, SpellCopySource, SpellRecordDraft,
        spell_authoring::new_scenario_spell,
    },
};
use providence_storage::ProjectStore;
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    stock: Option<&StockSpells>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let expected = required_u64(params, "expectedRevision")?;
    if expected != session.revision().0 {
        return Err("The project changed after this spell was opened. Keep the draft and review the saved version before applying.".into());
    }
    let store = store.ok_or("Open a portable project to author Custom spells.")?;
    match method {
        "spell.allocation.review" => allocation(session, store, stock, params),
        "spell.clear.review" => clear(session, params),
        "spell.draft.prepare" | "spell.draft.apply" => apply(session, store, stock, method, params),
        _ => Err(format!("Unknown spell draft command {method}")),
    }
}

fn index(params: &Value, key: &str) -> Result<Option<u16>, String> {
    params
        .get(key)
        .filter(|value| !value.is_null())
        .map(|value| {
            value
                .as_u64()
                .and_then(|n| u16::try_from(n).ok())
                .ok_or_else(|| format!("{key} must be a whole Custom spell record index."))
        })
        .transpose()
}

fn allocation(
    session: &EditorSession,
    store: &ProjectStore,
    stock: Option<&StockSpells>,
    params: &Value,
) -> Result<Value, String> {
    let family = binary_source(session, store)?;
    let effective = encode_scenario_spells(&session.snapshot().scenario_spells, family.as_deref())
        .map_err(|e| e.to_string())?;
    let mut allocation = session
        .allocate_scenario_spell(
            if effective.is_empty() {
                None
            } else {
                Some(&effective)
            },
            index(params, "destinationRecordIndex")?,
        )
        .map_err(|e| e.to_string())?;
    if let Some(value) = params.get("copySource").filter(|value| !value.is_null()) {
        let source: SpellCopySource = serde_json::from_value(value.clone())
            .map_err(|e| format!("Invalid spell copy source: {e}"))?;
        let mut definition = crate::spell_catalog::copy_definition(session, stock, &source)?;
        definition.id = allocation.draft.definition.id.clone();
        definition.classic_id = allocation.draft.definition.classic_id;
        definition.record_index = allocation.draft.record_index;
        allocation.draft.definition = definition;
        allocation.draft.copy_source = Some(source);
    }
    Ok(
        json!({"revision":session.revision(),"allocation":allocation,"localUntilApply":true,"occupiedDestinationsReplaced":0}),
    )
}

fn clear(session: &EditorSession, params: &Value) -> Result<Value, String> {
    let record = index(params, "recordIndex")?.ok_or("Supply the Custom spell record index.")?;
    let definition = new_scenario_spell(record).map_err(|e| e.to_string())?;
    if !session
        .snapshot()
        .scenario_spells
        .iter()
        .any(|row| row.definition.record_index == record)
    {
        return Err("The spell to clear no longer exists.".into());
    }
    let references = session.references();
    let uses = references
        .iter()
        .filter(|row| {
            row.target_kind == providence_core::references::TargetKind::Spell
                && row.target_id == definition.id.0
        })
        .collect::<Vec<_>>();
    Ok(
        json!({"revision":session.revision(),"draft":SpellRecordDraft {record_index:record,definition,allocation:None,copy_source:None},
        "incomingUses":uses.len(),"uses":uses.iter().take(64).collect::<Vec<_>>(),"usesTruncated":uses.len()>64,
        "identityRetained":true,"localUntilApply":true}),
    )
}

fn apply(
    session: &mut EditorSession,
    store: &ProjectStore,
    stock: Option<&StockSpells>,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let draft: SpellRecordDraft = serde_json::from_value(coerce_integral_numbers(
        required_value(params, "draft")?.clone(),
    ))
    .map_err(|e| format!("Invalid spell draft: {e}"))?;
    let issues = draft_issues(session, store, &draft)?;
    if let Some(source) = &draft.copy_source {
        crate::spell_catalog::copy_definition(session, stock, source)?;
    }
    if let Some(guard) = &draft.allocation {
        let source = binary_source(session, store)?;
        let binary = encode_scenario_spells(&session.snapshot().scenario_spells, source.as_deref())
            .map_err(|e| e.to_string())?;
        let allocation = session
            .allocate_scenario_spell(
                if binary.is_empty() {
                    None
                } else {
                    Some(&binary)
                },
                Some(draft.record_index),
            )
            .map_err(|e| e.to_string())?;
        if allocation.draft.allocation.as_ref() != Some(guard) {
            return Err("The reviewed spell allocation changed. Keep this draft.".into());
        }
    }
    if method == "spell.draft.prepare" {
        return Ok(
            json!({"revision":session.revision(),"valid":issues.is_empty(),"issues":issues,
            "recordIndex":draft.record_index,"nameBytes":draft.definition.name.chars().count(),"nameLimit":255}),
        );
    }
    if !issues.is_empty() {
        return Err(issues.join("\n"));
    }
    let identity = draft.definition.id.clone();
    let change = crate::execute(
        session,
        params,
        EditorCommand::ApplyScenarioSpellDraft {
            draft: Box::new(draft),
        },
    )?;
    let document = crate::spell_catalog::open(session, stock, &identity.0)?;
    Ok(json!({"change":change,"document":document}))
}

fn draft_issues(
    session: &EditorSession,
    store: &ProjectStore,
    draft: &SpellRecordDraft,
) -> Result<Vec<String>, String> {
    let mut issues = session.spell_draft_issues(draft);
    if issues.is_empty()
        && let Err(error) = session.check_spell_draft(draft)
    {
        issues.push(error.to_string());
    }
    if providence_core::codecs::validate_scenario_spell_name(&draft.definition).is_ok() {
        validate_names(session, store, draft, &mut issues)?;
    }
    Ok(issues)
}

pub(crate) fn binary_source(
    session: &EditorSession,
    store: &ProjectStore,
) -> Result<Option<Vec<u8>>, String> {
    let first = session.snapshot().scenario_spells.first();
    let blob = first.and_then(|row| row.source_blob.as_ref());
    if session
        .snapshot()
        .scenario_spells
        .iter()
        .any(|row| row.source_blob.as_ref() != blob)
    {
        return Err(
            "The retained spell family has inconsistent binary sources. No draft was applied."
                .into(),
        );
    }
    blob.map(|blob| store.read_blob(blob).map_err(|e| e.to_string()))
        .transpose()
}

fn validate_names(
    session: &EditorSession,
    store: &ProjectStore,
    draft: &SpellRecordDraft,
    issues: &mut Vec<String>,
) -> Result<(), String> {
    let mut rows = session.snapshot().scenario_spells.clone();
    let first = rows.first();
    let binary = first.and_then(|r| r.source_blob.clone());
    let text = first.and_then(|r| r.text_source_blob.clone());
    if rows.iter().any(|r| r.text_source_blob != text) {
        return Err("The spell names have inconsistent retained sources.".into());
    }
    let name_authored = rows
        .iter()
        .find(|row| row.definition.record_index == draft.record_index)
        .is_none_or(|row| row.name_authored || row.definition.name != draft.definition.name);
    rows.retain(|row| row.definition.record_index != draft.record_index);
    rows.push(SourcedSpellDefinition {
        source: format!("Data Spell record {}", draft.record_index),
        source_blob: binary,
        text_source_blob: text.clone(),
        name_authored,
        definition: draft.definition.clone(),
    });
    let bytes = text
        .map(|blob| store.read_blob(&blob).map_err(|e| e.to_string()))
        .transpose()?;
    if let Err(error) = encode_scenario_spell_name_resources(&rows, bytes.as_deref()) {
        issues.push(error.to_string());
    }
    Ok(())
}
