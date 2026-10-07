use crate::model::{PlayerMapNameCatalog, ProjectSnapshot, ScenarioStartupAuthoring};

pub(super) fn migrate_version_twenty_seven_names(
    value: &serde_json::Value,
) -> Option<PlayerMapNameCatalog> {
    if value
        .get("formatVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(27)
    {
        return None;
    }
    let records = value.get("world")?.get("playerMaps")?.as_array()?;
    let mut available_names = vec![String::new(); records.len().max(20)];
    let mut unavailable_names = vec![String::new(); records.len().max(20)];
    let mut found = false;
    for (fallback_index, record) in records.iter().enumerate() {
        let index = record
            .get("nativeId")
            .and_then(serde_json::Value::as_u64)
            .and_then(|value| usize::try_from(value).ok())
            .unwrap_or(fallback_index);
        if index >= available_names.len() {
            available_names.resize(index + 1, String::new());
            unavailable_names.resize(index + 1, String::new());
        }
        if let Some(name) = record.get("name").and_then(serde_json::Value::as_str) {
            found |= !name.is_empty();
            available_names[index] = name.into();
        }
        if let Some(name) = record
            .get("unavailableName")
            .and_then(serde_json::Value::as_str)
        {
            found |= !name.is_empty();
            unavailable_names[index] = name.into();
        }
    }
    found.then_some(PlayerMapNameCatalog {
        source_blob: None,
        available_names,
        unavailable_names,
    })
}

pub(super) fn migrate_startup_authoring(snapshot: &mut ProjectSnapshot, source_version: u32) {
    if source_version >= 35 {
        return;
    }
    snapshot.startup_authoring = snapshot.campaign.as_ref().map(|campaign| {
        let mut matching = snapshot
            .classic_sources
            .iter()
            .filter(|source| source.native_path == campaign.name);
        let first = matching.next().cloned();
        let original_source = if matching.next().is_none() {
            first
        } else {
            None
        };
        ScenarioStartupAuthoring {
            marker_filename: campaign.name.clone(),
            original_source,
            security: None,
        }
    });
}
