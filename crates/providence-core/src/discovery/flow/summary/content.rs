use super::*;
use crate::references::ResolutionState;

#[derive(Debug, Clone, Serialize)]
pub struct FlowDetail {
    pub label: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowCandidate {
    pub selection: FlowSelection,
    pub label: String,
    pub kind: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

pub(super) fn describe(
    s: &ProjectSnapshot,
    selection: &FlowSelection,
) -> (String, Vec<FlowDetail>) {
    let id = selection.identity.as_str();
    let mut summary = String::new();
    let mut details = Vec::new();
    if let Some(row) = s.messages.iter().find(|row| row.identity.0 == id) {
        summary = super::super::graph::bounded(&row.text, 180);
        details.push(detail(
            "Text",
            format!(
                "{} characters · scenario-owned text",
                row.text.chars().count()
            ),
        ));
    }
    describe_encounters(s, id, &mut summary, &mut details);
    if let Some(row) = s.timed_encounters.iter().find(|row| row.identity.0 == id) {
        summary = format!(
            "Day {} · {}% chance · interval {}",
            row.day, row.percent, row.increment
        );
        details.push(detail("Required quest", row.required_quest.to_string()));
        details.push(detail("Required item", row.required_item.to_string()));
    }
    if s.rogue_encounters.iter().any(|row| row.identity.0 == id) {
        summary = if let Some(caller) = &selection.caller_context {
            format!("Returns use {caller}. Choose a result connection to inspect its destination.")
        } else {
            "Choose a calling encounter to resolve result destinations. Different callers can produce different returns.".into()
        };
    }
    if let Some(quest) = id
        .strip_prefix("quest:")
        .and_then(|id| id.parse::<u8>().ok())
        && let Some(label) = s.quest_labels.iter().find(|row| row.id == quest)
    {
        summary = super::super::graph::bounded(&label.label, 180);
        details.push(detail(
            "Author note",
            super::super::graph::bounded(&label.note, 2400),
        ));
    }
    if let Some(asset) = s.assets.iter().find(|row| row.identity.0 == id) {
        summary = super::super::graph::bounded(&asset.label, 180);
        details.push(detail("Media kind", asset.kind.clone()));
        if let (Some(width), Some(height)) = (asset.width, asset.height) {
            details.push(detail("Dimensions", format!("{width} × {height}")));
        }
        details.push(detail("Ownership", "Scenario".into()));
    }
    (summary, details)
}

fn detail(label: &str, text: String) -> FlowDetail {
    FlowDetail {
        label: label.into(),
        text,
    }
}

pub(super) fn unresolved(
    s: &ProjectSnapshot,
    selection: &FlowSelection,
) -> Result<FlowSummary, String> {
    let (kind, id, resolution, _context): (String, String, ResolutionState, Option<String>) =
        serde_json::from_str(selection.identity.trim_start_matches("unresolved:"))
            .map_err(|_| "Invalid unresolved target identity")?;
    let resource_type = match kind.as_str() {
        "picture" => "PICT",
        "sound" => "snd ",
        "icon" | "monster-appearance" | "special-land-tile" => "cicn",
        _ => "",
    };
    let native_id = id.parse::<i32>().ok();
    let candidates: Vec<_> = s
        .assets
        .iter()
        .filter(|asset| {
            asset.classic_resource.as_ref().is_some_and(|key| {
                key.resource_type == resource_type && Some(key.resource_id) == native_id
            })
        })
        .map(|asset| FlowCandidate {
            selection: FlowSelection::record(asset.identity.0.clone(), "scenario"),
            label: super::super::graph::bounded(&asset.label, 180),
            kind: asset.kind.clone(),
            width: asset.width,
            height: asset.height,
        })
        .collect();
    let candidates_total = candidates.len();
    let candidates = candidates.into_iter().take(64).collect();
    let warning = if resolution == ResolutionState::Ambiguous {
        "Multiple exact scenario resources match. Inspect candidates without choosing an owner; open the owning field to repair."
    } else {
        "This target is unavailable. Its source reference remains intact; open the owning field to inspect or repair it."
    };
    Ok(FlowSummary {
        selection: selection.clone(),
        title: format!("{kind} {id}"),
        summary: warning.into(),
        card_text: warning.into(),
        program: false,
        used_steps: 0,
        unknown_steps: 0,
        steps: Vec::new(),
        excerpt: String::new(),
        excerpt_truncated: false,
        callers: Vec::new(),
        callers_total: 0,
        details: vec![detail("Availability", format!("{resolution:?}"))],
        candidates,
        candidates_total,
    })
}

fn describe_encounters(
    s: &ProjectSnapshot,
    id: &str,
    summary: &mut String,
    details: &mut Vec<FlowDetail>,
) {
    if let Some(row) = s.simple_encounters.iter().find(|row| row.identity.0 == id) {
        *summary = row
            .texts
            .iter()
            .filter(|text| !text.trim().is_empty())
            .map(|text| super::super::graph::bounded(text, 80))
            .take(2)
            .collect::<Vec<_>>()
            .join("\n");
        details.push(detail(
            "Prompt",
            format!("String {}", row.prompt_message_native_id),
        ));
        for (index, label) in row
            .texts
            .iter()
            .enumerate()
            .filter(|(_, label)| !label.trim().is_empty())
        {
            details.push(detail(
                &format!("Response {}", index + 1),
                format!(
                    "{} → Result {}",
                    super::super::graph::bounded(label, 360),
                    row.choice_results[index]
                ),
            ));
        }
    }
    if let Some(row) = s.complex_encounters.iter().find(|row| row.identity.0 == id) {
        *summary = "Physical, item, spell and word responses select encounter results.".into();
        details.push(detail(
            "Prompt",
            format!("String {}", row.prompt_message_native_id),
        ));
        details.push(detail("Physical result", row.action_result.to_string()));
        details.push(detail("Word result", row.word_result.to_string()));
    }
}
