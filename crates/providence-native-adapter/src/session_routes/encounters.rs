//! Native encounters requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::coerce_integral_numbers;
use crate::request_params::required_i16;
use crate::request_params::required_string;
use crate::request_params::required_value;
use crate::session_summary::clean_summary_text;
use providence_core::model::ComplexEncounter;
use providence_core::model::RogueEncounter;
use providence_core::model::SimpleEncounter;
use providence_core::model::StableId;
use providence_core::model::TimedEncounter;
use providence_core::session::ComplexEncounterRecordDraft;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::SimpleEncounterRecordDraft;
use serde_json::Value;
use serde_json::json;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "encounter.list-simple" => encounter_list_simple(session, params),
        "encounter.open-simple" => encounter_open_simple(session, params),
        "encounter.list-prompts" => encounter_list_prompts(session, params),
        "encounter.list-complex" => encounter_list_complex(session, params),
        "encounter.open-complex" => encounter_open_complex(session, params),
        "encounter.list-rogue" => super::encounter_catalog::encounter_list_rogue(session, params),
        "encounter.open-rogue" => encounter_open_rogue(session, params),
        "encounter.list-timed" => super::encounter_catalog::encounter_list_timed(session, params),
        "encounter.open-timed" => encounter_open_timed(session, params),
        "encounter.update-simple" => encounter_update_simple(session, params),
        "encounter.apply-simple-draft" => encounter_apply_simple_draft(session, params),
        "encounter.create-simple" => encounter_create_simple(session, params),
        "encounter.copy-simple" => encounter_copy_simple(session, params),
        "encounter.update-complex" => encounter_update_complex(session, params),
        "encounter.apply-complex-draft" => encounter_apply_complex_draft(session, params),
        "encounter.create-complex" => encounter_create_complex(session, params),
        "encounter.copy-complex" => encounter_copy_complex(session, params),
        "encounter.reference.retarget" => encounter_reference_retarget(session, params),
        "rogue-encounter.update" => rogue_encounter_update(session, params),
        "rogue-encounter.reference.retarget" => rogue_encounter_reference_retarget(session, params),
        "timed-encounter.update" => timed_encounter_update(session, params),
        "timed-encounter.reference.retarget" => timed_encounter_reference_retarget(session, params),
        "encounter.prompt.retarget" => encounter_prompt_retarget(session, params),
        _ => super::encounter_authoring::dispatch(session, method, params),
    }
}

fn encounter_list_simple(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let total = session.snapshot().simple_encounters.len();
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let diagnostics = session.diagnostics();
    let items = session
        .snapshot()
        .simple_encounters
        .iter()
        .skip(offset)
        .take(limit)
        .map(|encounter| {
            let problems = diagnostics
                .iter()
                .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&encounter.identity))
                .count();
            let label = encounter
                .texts
                .iter()
                .find_map(|text| clean_summary_text(text))
                .unwrap_or_else(|| format!("Encounter {}", encounter.native_id.0));
            json!({
                "identity": encounter.identity,
                "nativeId": encounter.native_id,
                "label": label,
                "promptMessageNativeId": encounter.prompt_message_native_id,
                "populatedActions": encounter.actions.len(),
                "problems": problems,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

fn encounter_open_simple(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let encounter = session
        .snapshot()
        .simple_encounters
        .iter()
        .find(|encounter| encounter.identity == identity)
        .ok_or_else(|| format!("simple encounter {} was not found", identity.0))?;
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    let steps =
        crate::session_routes::action_authoring::step_projections(session, &encounter.actions);
    let prompt_preview = session
        .snapshot()
        .messages
        .iter()
        .find(|message| {
            message.native_id.0 == u32::from(encounter.prompt_message_native_id.unsigned_abs())
        })
        .and_then(|message| clean_summary_text(&message.text));
    Ok(json!({
        "revision": session.revision(),
        "encounter": encounter,
        "references": references,
        "diagnostics": diagnostics,
        "steps": steps,
        "promptPreview": prompt_preview,
    }))
}

fn encounter_list_prompts(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_lowercase();
    let items = session
        .snapshot()
        .messages
        .iter()
        .filter_map(|message| {
            let preview = clean_summary_text(&message.text)?;
            let id = message.native_id.0;
            let haystack = format!("{id} {}", preview.to_lowercase());
            (query.is_empty() || haystack.contains(&query)).then(|| {
                json!({
                    "nativeId": id,
                    "identity": message.identity,
                    "preview": preview,
                })
            })
        })
        .take(100)
        .collect::<Vec<_>>();
    let total = items.len();
    Ok(json!({"items": items, "total": total}))
}

fn encounter_apply_simple_draft(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let draft: SimpleEncounterRecordDraft = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "draft")?.clone(),
    ))
    .map_err(|error| format!("invalid Simple Encounter draft: {error}"))?;
    let source = draft.source.clone();
    let change = execute(
        session,
        &params,
        EditorCommand::ApplySimpleEncounterDraft {
            draft: Box::new(draft),
        },
    )?;
    let document = encounter_open_simple(session, json!({"identity": source.0}))?;
    Ok(json!({"change": change, "document": document}))
}

fn encounter_create_simple(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let change = execute(session, &params, EditorCommand::CreateSimpleEncounter)?;
    let identity = change["changedEntities"]
        .as_array()
        .and_then(|items| items.first())
        .and_then(Value::as_str)
        .ok_or_else(|| "create Simple Encounter returned no identity".to_owned())?;
    let document = encounter_open_simple(session, json!({"identity": identity}))?;
    Ok(json!({"change": change, "document": document}))
}

fn encounter_copy_simple(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let change = execute(
        session,
        &params,
        EditorCommand::CopySimpleEncounter {
            source: StableId(required_string(&params, "source")?),
        },
    )?;
    let identity = change["changedEntities"]
        .as_array()
        .and_then(|items| items.first())
        .and_then(Value::as_str)
        .ok_or_else(|| "copy Simple Encounter returned no identity".to_owned())?;
    let document = encounter_open_simple(session, json!({"identity": identity}))?;
    Ok(json!({"change": change, "document": document}))
}

fn encounter_list_complex(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let total = session.snapshot().complex_encounters.len();
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let diagnostics = session.diagnostics();
    let items = session
        .snapshot()
        .complex_encounters
        .iter()
        .skip(offset)
        .take(limit)
        .map(|encounter| {
            let problems = diagnostics
                .iter()
                .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&encounter.identity))
                .count();
            let label = encounter
                .texts
                .iter()
                .find(|text| !text.trim().is_empty())
                .cloned()
                .unwrap_or_else(|| format!("Complex Encounter {}", encounter.native_id.0));
            json!({
                "identity": encounter.identity,
                "nativeId": encounter.native_id,
                "label": label,
                "promptMessageNativeId": encounter.prompt_message_native_id,
                "populatedActions": encounter.actions.len(),
                "magicResponses": encounter.spell_ids.iter().filter(|id| **id != 0).count(),
                "itemResponses": encounter.item_ids.iter().filter(|id| **id != 0).count(),
                "rogueEnabled": encounter.thief,
                "problems": problems,
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

fn encounter_open_complex(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let encounter = session
        .snapshot()
        .complex_encounters
        .iter()
        .find(|encounter| encounter.identity == identity)
        .ok_or_else(|| format!("complex encounter {} was not found", identity.0))?;
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    let steps =
        crate::session_routes::action_authoring::step_projections(session, &encounter.actions);
    let prompt_preview = session
        .snapshot()
        .messages
        .iter()
        .find(|message| {
            message.native_id.0 == u32::from(encounter.prompt_message_native_id.unsigned_abs())
        })
        .and_then(|message| clean_summary_text(&message.text));
    let rogue_preview = complex_rogue_preview(session, encounter);
    Ok(json!({
        "revision": session.revision(),
        "encounter": encounter,
        "references": references,
        "diagnostics": diagnostics,
        "steps": steps,
        "promptPreview": prompt_preview,
        "responseControls": complex_response_controls(encounter),
        "roguePreview": rogue_preview,
    }))
}

fn complex_rogue_preview(session: &EditorSession, encounter: &ComplexEncounter) -> Option<Value> {
    let rogue_id = encounter
        .thief
        .then(|| u32::try_from(encounter.thief_success).ok())
        .flatten()?;
    let rogue = session
        .snapshot()
        .rogue_encounters
        .iter()
        .find(|rogue| rogue.native_id.0 == rogue_id)?;
    Some(json!({
        "identity": rogue.identity,
        "nativeId": rogue.native_id,
        "enabledActions": rogue.type_flags[..8].iter().filter(|enabled| **enabled).count(),
        "returnedResults": rogue.success_codes[..8].iter()
            .chain(rogue.failure_codes[..8].iter()).copied()
            .filter(|result| (1..=4).contains(result))
            .collect::<std::collections::BTreeSet<_>>(),
    }))
}

fn complex_response_controls(encounter: &ComplexEncounter) -> Value {
    json!({
        "physical": {"count": 8, "result": encounter.action_result, "exactRequiredSet": true},
        "magic": {"count": 10, "enabled": encounter.spell_ids[0] != 0, "ordered": true, "blankEnabledSentinel": 1100, "spellClassRange": [1, 6]},
        "items": {"count": 5, "enabled": encounter.item_ids[0] != 0, "ordered": true, "blankEnabledSentinel": 9999},
        "typedReply": {"enabled": encounter.word_result != 0, "matchStopsAtSpace": true},
        "rogue": {"enabled": encounter.thief, "nativeId": encounter.thief_success, "resetFlag": encounter.thief_fail},
        "defaultFailureResult": 4,
        "finalFailedAttemptResult": (encounter.max_times > 1).then_some(3),
    })
}

pub(super) fn encounter_open_rogue(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let encounter = session
        .snapshot()
        .rogue_encounters
        .iter()
        .find(|encounter| encounter.identity == identity)
        .ok_or_else(|| format!("Rogue encounter {} was not found", identity.0))?;
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": session.revision(),
        "encounter": encounter,
        "references": references,
        "diagnostics": diagnostics,
    }))
}

pub(super) fn encounter_open_timed(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let identity = StableId(required_string(&params, "identity")?);
    let encounter = session
        .snapshot()
        .timed_encounters
        .iter()
        .find(|encounter| encounter.identity == identity)
        .ok_or_else(|| format!("Timed Encounter {} was not found", identity.0))?;
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == identity)
        .collect::<Vec<_>>();
    let diagnostics = session
        .diagnostics()
        .into_iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&identity))
        .collect::<Vec<_>>();
    Ok(
        json!({ "revision": session.revision(), "encounter": encounter, "references": references, "diagnostics": diagnostics }),
    )
}

fn encounter_update_simple(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let encounter: SimpleEncounter = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "encounter")?.clone(),
    ))
    .map_err(|error| format!("invalid simple encounter: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateSimpleEncounter {
            encounter: Box::new(encounter),
        },
    )
}

fn encounter_update_complex(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let encounter: ComplexEncounter = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "encounter")?.clone(),
    ))
    .map_err(|error| format!("invalid complex encounter: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateComplexEncounter {
            encounter: Box::new(encounter),
        },
    )
}

fn encounter_apply_complex_draft(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let draft: ComplexEncounterRecordDraft = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "draft")?.clone(),
    ))
    .map_err(|error| format!("invalid Complex Encounter draft: {error}"))?;
    let source = draft.source.clone();
    let change = execute(
        session,
        &params,
        EditorCommand::ApplyComplexEncounterDraft {
            draft: Box::new(draft),
        },
    )?;
    let document = encounter_open_complex(session, json!({"identity": source.0}))?;
    Ok(json!({"change": change, "document": document}))
}

fn encounter_create_complex(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let change = execute(session, &params, EditorCommand::CreateComplexEncounter)?;
    open_created_complex(session, change)
}

fn encounter_copy_complex(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let change = execute(
        session,
        &params,
        EditorCommand::CopyComplexEncounter {
            source: StableId(required_string(&params, "source")?),
        },
    )?;
    open_created_complex(session, change)
}

fn open_created_complex(session: &mut EditorSession, change: Value) -> Result<Value, String> {
    let identity = change["changedEntities"]
        .as_array()
        .and_then(|items| items.first())
        .and_then(Value::as_str)
        .ok_or_else(|| "create Complex Encounter returned no identity".to_owned())?;
    let document = encounter_open_complex(session, json!({"identity": identity}))?;
    Ok(json!({"change": change, "document": document}))
}

fn encounter_reference_retarget(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetComplexEncounterReference {
            source: StableId(required_string(&params, "source")?),
            field: required_string(&params, "field")?,
            target_id: required_i16(&params, "targetId")?,
        },
    )
}

fn rogue_encounter_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let encounter: RogueEncounter = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "encounter")?.clone(),
    ))
    .map_err(|error| format!("invalid Rogue encounter: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateRogueEncounter {
            encounter: Box::new(encounter),
        },
    )
}

fn rogue_encounter_reference_retarget(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetRogueEncounterReference {
            source: StableId(required_string(&params, "source")?),
            field: required_string(&params, "field")?,
            target_id: required_i16(&params, "targetId")?,
        },
    )
}

fn timed_encounter_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let encounter: TimedEncounter = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "encounter")?.clone(),
    ))
    .map_err(|error| format!("invalid Timed Encounter: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateTimedEncounter {
            encounter: Box::new(encounter),
        },
    )
}

fn timed_encounter_reference_retarget(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetTimedEncounterReference {
            source: StableId(required_string(&params, "source")?),
            field: required_string(&params, "field")?,
            target_id: required_i16(&params, "targetId")?,
        },
    )
}

fn encounter_prompt_retarget(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    execute(
        session,
        &params,
        EditorCommand::RetargetSimpleEncounterPrompt {
            source: StableId(required_string(&params, "source")?),
            target_native_id: required_i16(&params, "targetNativeId")?,
        },
    )
}
