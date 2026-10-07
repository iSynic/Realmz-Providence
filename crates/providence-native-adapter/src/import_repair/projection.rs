use providence_core::import_repair::{RepairAssessment, RepairEntry};
use providence_core::session::EditorSession;
use serde_json::{Value, json};

pub(super) fn page(
    session: &EditorSession,
    assessment: &RepairAssessment,
    params: &Value,
) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let entries = assessment
        .entries
        .iter()
        .skip(offset)
        .take(limit)
        .map(entry)
        .collect::<Vec<_>>();
    Ok(
        json!({"revision": session.revision(), "projectId": session.snapshot().project_id,
            "assessment": {"sourceIdentity":assessment.source_identity, "previousVersion":assessment.previous_version,
                "version":assessment.version,"entries":entries,"sourceRequirements":assessment.source_requirements},
            "total":assessment.entries.len(), "offset":offset, "limit":limit,
            "safeCount": assessment.entries.iter().filter(|e| !e.conflict).count(),
            "conflictCount": assessment.entries.iter().filter(|e| e.conflict).count()}),
    )
}

fn entry(entry: &RepairEntry) -> Value {
    let (current, recovered) = match &entry.change {
        providence_core::import_repair::RepairChange::Spell { record } => (
            String::new(),
            format!("Spell {}", record.definition.classic_id),
        ),
        providence_core::import_repair::RepairChange::ItemText {
            expected,
            recovered,
            ..
        } => (expected.clone(), recovered.clone()),
        providence_core::import_repair::RepairChange::ItemTextSource { .. } => {
            ("Current text source".into(), "Scenario text source".into())
        }
        providence_core::import_repair::RepairChange::ShopQuarantine { expected, reason } => (
            format!("Shop {} inventory", expected.native_id.0),
            format!("Exclude unverified inventory; preserve original Data SD bytes. {reason}"),
        ),
    };
    json!({"key":entry.key, "family":entry.family, "entity":entry.entity, "field":entry.field,
                "conflict":entry.conflict, "current":current, "recovered":recovered})
}
