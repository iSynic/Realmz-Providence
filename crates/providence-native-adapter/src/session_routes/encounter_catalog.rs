use providence_core::session::EditorSession;
use serde_json::{Value, json};
pub(super) fn encounter_list_rogue(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let selected = session
        .snapshot()
        .rogue_encounters
        .iter()
        .filter(|row| {
            rogue_search_text(row, session.snapshot())
                .to_ascii_lowercase()
                .contains(&query)
        })
        .collect::<Vec<_>>();
    let total = selected.len();
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let diagnostics = session.diagnostics();
    let items = selected
        .iter()
        .skip(offset)
        .take(limit)
        .map(|encounter| rogue_summary(encounter, &diagnostics))
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

pub(super) fn encounter_list_timed(
    session: &mut EditorSession,
    params: Value,
) -> Result<Value, String> {
    let query = params
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let selected = session
        .snapshot()
        .timed_encounters
        .iter()
        .filter(|row| {
            format!("{} Timed Encounter {} day {} increment {} chance {} Extra AP {} item {} quest {} {:?} level {} rectangle {} X {} Y {}", row.native_id.0, row.native_id.0, row.day, row.increment, row.percent, row.door, row.required_item, row.required_quest, row.location_kind, row.required_level, row.required_random_rect, row.required_x, row.required_y)
                .to_ascii_lowercase()
                .contains(&query)
        })
        .collect::<Vec<_>>();
    let total = selected.len();
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(64)
        .clamp(1, 128) as usize;
    let items = selected.iter().skip(offset).take(limit).map(|encounter| json!({ "identity": encounter.identity, "nativeId": encounter.native_id, "label": format!("Timed Encounter {}", encounter.native_id.0), "day": encounter.day, "percent": encounter.percent, "door": encounter.door, "locationKind": encounter.location_kind })).collect::<Vec<_>>();
    Ok(
        json!({ "revision": session.revision(), "items": items, "offset": offset, "limit": limit, "total": total, "truncated": offset.saturating_add(limit) < total }),
    )
}

fn rogue_summary(
    encounter: &providence_core::model::RogueEncounter,
    diagnostics: &[providence_core::validation::Diagnostic],
) -> Value {
    let problems = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&encounter.identity))
        .count();
    json!({
        "identity": encounter.identity,
        "nativeId": encounter.native_id,
        "label": format!("Rogue Encounter {}", encounter.native_id.0),
        "enabledActions": encounter.type_flags[..8].iter().filter(|value| **value).count(),
        "returnedResults": encounter.success_codes[..8].iter()
            .chain(encounter.failure_codes[..8].iter()).copied()
            .filter(|result| (1..=4).contains(result))
            .collect::<std::collections::BTreeSet<_>>(),
        "trapSet": encounter.type_flags[9],
        "spell": encounter.spell,
        "tumblers": encounter.tumblers,
        "problems": problems,
    })
}

fn rogue_search_text(
    row: &providence_core::model::RogueEncounter,
    snapshot: &providence_core::model::ProjectSnapshot,
) -> String {
    let mut text = format!(
        "{} Rogue Encounter {} spell {} tumblers {} {}",
        row.native_id.0,
        row.native_id.0,
        row.spell,
        row.tumblers,
        if row.type_flags[9] {
            "trapped"
        } else {
            "no trap"
        }
    );
    for (slot, name) in [
        "Acrobatic Act",
        "Detect Trap",
        "Disarm Trap",
        "Hear Noise",
        "Force Lock",
        "Move Silently",
        "Pick Lock",
        "Pick Pocket",
    ]
    .iter()
    .enumerate()
    {
        if row.type_flags[slot] {
            text.push_str(name);
            text.push(' ');
        }
    }
    for id in row
        .success_text
        .iter()
        .chain(row.failure_text.iter())
        .chain(row.prompts[..1].iter())
    {
        if let Some(message) = snapshot
            .messages
            .iter()
            .find(|m| m.native_id.0 as i32 == i32::from(*id).abs())
        {
            text.push_str(&message.text);
            text.push(' ');
        }
    }
    text
}
