use super::*;
use providence_core::codecs::SCENARIO_MUSIC_FILES;

pub(super) fn list(session: &EditorSession, params: &Value) -> Result<Value, String> {
    if params["expectedRevision"].is_number() {
        super::check_project(session, params)?;
    }
    let assets = crate::document_catalogs::project_asset_list(
        session,
        &json!({"kind":"music","limit":128}),
    )?;
    let query = params["query"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .to_lowercase();
    let rows = (1..=3)
        .map(|slot| row(session, &assets["items"], slot))
        .collect::<Vec<_>>();
    let assigned = rows
        .iter()
        .filter(|row| row["slotStatus"] == "assigned")
        .count();
    let rows = rows
        .into_iter()
        .filter(|row| {
            query.is_empty()
                || format!("{} {} {}", row["label"], row["source"], row["slot"])
                    .to_lowercase()
                    .contains(&query)
        })
        .collect::<Vec<_>>();
    Ok(
        json!({"revision":session.revision(),"scenarioMusicSlots":true,"assigned":assigned,
        "total":rows.len(),"items":rows,"offset":0,"limit":3,"truncated":false}),
    )
}

fn row(session: &EditorSession, catalog: &Value, slot: u8) -> Value {
    let filename = SCENARIO_MUSIC_FILES[usize::from(slot - 1)];
    let assets = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| asset.kind == "music" && asset.scenario_music_slot == Some(slot))
        .collect::<Vec<_>>();
    let source_count = session
        .snapshot()
        .classic_sources
        .iter()
        .filter(|source| source.native_path.eq_ignore_ascii_case(filename))
        .count();
    let mut row = if assets.len() == 1 {
        catalog
            .as_array()
            .and_then(|rows| {
                rows.iter()
                    .find(|row| row["identity"] == json!(assets[0].identity))
            })
            .cloned()
            .unwrap_or_else(|| json!({}))
    } else {
        json!({})
    };
    let status = if assets.len() > 1 || source_count > 1 {
        "ambiguous"
    } else if assets.len() == 1 {
        "assigned"
    } else if source_count > 0 {
        "quarantined"
    } else {
        "empty"
    };
    let reason = match status {
        "ambiguous" => {
            "This slot has ambiguous imported content. Repair its source before replacing it."
        }
        "quarantined" => {
            "An unsupported imported music file is retained in this slot. Restore a supported source before authoring it."
        }
        "assigned" => {
            "This slot is occupied. Explicitly choose replacement before reviewing the change."
        }
        _ => "No music is assigned. Import a standard MOD into this slot.",
    };
    if status != "assigned" {
        row = json!({"identity":format!("music-slot:{slot}"),"kind":"music","emptySlot":true,
            "label":format!("Custom {slot} · {}", if status == "empty" {"Empty slot"} else {"Retained imported file"}),
            "source":filename,"classicResource":{"resourceType":"MOD ","resourceId":slot}});
    }
    row["slot"] = json!(slot);
    row["slotStatus"] = json!(status);
    row["slotReason"] = json!(reason);
    row["canImport"] = json!(status == "empty");
    row["canReplace"] = json!(status == "assigned");
    row
}
