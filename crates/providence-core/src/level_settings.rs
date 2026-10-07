//! Named level edits retain source metadata and share one preview/commit plan.

use crate::codecs::{MAPSTATS_REFERENCE_BYTES, custom_landlook_source_name};
use crate::model::{LevelType, MapLevel, MapRuntimeMetadata, ProjectSnapshot, StableId};
use crate::session::SessionError;
use serde::{Deserialize, Serialize};

pub const LANDLOOK_CHOICES: [(i8, &str); 9] = [
    (0, "Plains"),
    (3, "Subterranean"),
    (4, "Castle"),
    (5, "Desert"),
    (6, "Custom 1"),
    (7, "Custom 2"),
    (8, "Custom 3"),
    (9, "Swamp"),
    (10, "Snow"),
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LevelSettingsEdit {
    pub name: String,
    pub dark: bool,
    pub uses_los: bool,
    pub landlook: Option<i8>,
    pub shared_base_tile: Option<i16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AffectedLevel {
    pub identity: StableId,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelSettingsPreview {
    pub can_apply: bool,
    pub changes: Vec<String>,
    pub affected_maps: Vec<AffectedLevel>,
    pub shared_landlook: Option<i8>,
}

pub(crate) struct PreparedLevelSettings {
    pub runtime: MapRuntimeMetadata,
    pub shared_base: Option<(i8, i16, i16)>,
    pub preview: LevelSettingsPreview,
}

pub fn preview_level_settings(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    edit: &LevelSettingsEdit,
) -> Result<LevelSettingsPreview, SessionError> {
    Ok(prepare(snapshot, identity, edit)?.preview)
}

pub fn inspect_level_settings(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
) -> Result<LevelSettingsEdit, SessionError> {
    let map = snapshot
        .world
        .maps
        .iter()
        .find(|map| map.identity == *identity)
        .ok_or_else(|| SessionError::MapNotFound(identity.clone()))?;
    let runtime = map.runtime.as_ref().ok_or_else(|| invalid("This level has no readable settings. Restore its level metadata before editing settings."))?;
    Ok(LevelSettingsEdit {
        name: map.name.clone(),
        dark: runtime.dark,
        uses_los: runtime.uses_los,
        landlook: runtime.landlook,
        shared_base_tile: None,
    })
}

pub fn preview_level_renderer(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    edit: &LevelSettingsEdit,
) -> Result<MapRuntimeMetadata, SessionError> {
    Ok(prepare(snapshot, identity, edit)?.runtime)
}

pub(crate) fn prepare(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    edit: &LevelSettingsEdit,
) -> Result<PreparedLevelSettings, SessionError> {
    let map = snapshot
        .world
        .maps
        .iter()
        .find(|map| map.identity == *identity)
        .ok_or_else(|| SessionError::MapNotFound(identity.clone()))?;
    if edit.name != map.name
        && (edit.name.trim().is_empty()
            || edit.name.chars().count() > 128
            || edit.name.chars().any(char::is_control))
    {
        return Err(invalid(
            "Use a nonempty level name of at most 128 characters, without control characters.",
        ));
    }
    let mut runtime = edited_runtime(snapshot, map, edit)?;
    let shared_base = shared_base(snapshot, map.level_type, edit)?;
    let changes = change_labels(map, edit, shared_base.is_some());
    let shared_landlook = shared_base.map(|(landlook, _, _)| landlook);
    let affected = affected_levels(snapshot, identity, &edit.name, shared_landlook);
    if let Some((_, tile, scale)) = shared_base {
        runtime.base_tile = Some(tile);
        runtime.base_scale = Some(scale);
    }
    Ok(PreparedLevelSettings {
        runtime,
        shared_base,
        preview: LevelSettingsPreview {
            can_apply: !changes.is_empty(),
            changes,
            affected_maps: affected,
            shared_landlook,
        },
    })
}

fn change_labels(map: &MapLevel, edit: &LevelSettingsEdit, shared: bool) -> Vec<String> {
    let mut changes = Vec::new();
    if edit.name != map.name {
        changes.push("Level name".into());
    }
    if map
        .runtime
        .as_ref()
        .is_some_and(|original| original.dark != edit.dark)
    {
        changes.push("Dark level".into());
    }
    if map
        .runtime
        .as_ref()
        .is_some_and(|original| original.uses_los != edit.uses_los)
    {
        changes.push("Line of sight".into());
    }
    if map
        .runtime
        .as_ref()
        .is_some_and(|original| original.landlook != edit.landlook)
    {
        changes.push("Landlook artwork and erase context".into());
    }
    if shared {
        changes.push("Shared Landlook erase tile".into());
    }
    changes
}

fn affected_levels(
    snapshot: &ProjectSnapshot,
    identity: &StableId,
    name: &str,
    shared: Option<i8>,
) -> Vec<AffectedLevel> {
    let mut affected = vec![AffectedLevel {
        identity: identity.clone(),
        name: name.into(),
    }];
    if let Some(landlook) = shared {
        affected.extend(
            snapshot
                .world
                .maps
                .iter()
                .filter(|other| {
                    other.identity != *identity
                        && other.level_type == LevelType::Land
                        && other.runtime.as_ref().and_then(|runtime| runtime.landlook)
                            == Some(landlook)
                })
                .map(|other| AffectedLevel {
                    identity: other.identity.clone(),
                    name: other.name.clone(),
                }),
        );
    }
    affected.sort_by(|left, right| left.identity.cmp(&right.identity));
    affected
}

fn edited_runtime(
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
    edit: &LevelSettingsEdit,
) -> Result<MapRuntimeMetadata, SessionError> {
    let mut runtime = map.runtime.clone().ok_or_else(|| invalid("This level has no readable settings. Restore its level metadata before editing settings."))?;
    if runtime.landlook != edit.landlook {
        if map.level_type == LevelType::Dungeon {
            return Err(invalid("Dungeon levels use their fixed top-down renderer."));
        }
        let landlook = edit
            .landlook
            .filter(|look| LANDLOOK_CHOICES.iter().any(|(id, _)| id == look))
            .ok_or_else(|| invalid("Choose a supported Landlook."))?;
        let catalog = snapshot
            .landlook_catalogs
            .iter()
            .find(|catalog| catalog.landlook == landlook);
        if custom_landlook_source_name(landlook).is_some()
            && !custom_catalog_available(snapshot, landlook)
        {
            return Err(invalid(
                "Create or restore this scenario-owned Custom Landlook before selecting it.",
            ));
        }
        runtime.landlook = Some(landlook);
        runtime.tileset_id = StableId(format!("classic.landlook.{landlook}"));
        runtime.base_tile = catalog.map(|catalog| catalog.base_tile);
        runtime.base_scale = catalog.map(|catalog| catalog.base_scale);
    }
    runtime.dark = edit.dark;
    runtime.uses_los = edit.uses_los;
    Ok(runtime)
}

pub fn custom_catalog_available(snapshot: &ProjectSnapshot, landlook: i8) -> bool {
    custom_landlook_source_name(landlook).is_some_and(|source| {
        snapshot.landlook_catalogs.iter().any(|catalog| {
            catalog.landlook == landlook
                && catalog.source == source
                && catalog.byte_length == MAPSTATS_REFERENCE_BYTES as u64
        })
    })
}

fn shared_base(
    snapshot: &ProjectSnapshot,
    kind: LevelType,
    edit: &LevelSettingsEdit,
) -> Result<Option<(i8, i16, i16)>, SessionError> {
    let Some(tile) = edit.shared_base_tile else {
        return Ok(None);
    };
    let landlook = edit
        .landlook
        .ok_or_else(|| invalid("Choose a Custom Landlook before editing its shared erase tile."))?;
    if kind != LevelType::Land || !custom_catalog_available(snapshot, landlook) {
        return Err(invalid(
            "Stock shared erase tiles are protected. Choose a scenario-owned Custom Landlook to customize one.",
        ));
    }
    if !(0..=200).contains(&tile) {
        return Err(invalid(
            "The shared erase tile must be an ordinary atlas tile from 0 through 200.",
        ));
    }
    let catalog = snapshot
        .landlook_catalogs
        .iter()
        .find(|catalog| catalog.landlook == landlook)
        .expect("validated custom catalog");
    Ok((tile != catalog.base_tile).then_some((landlook, tile, catalog.base_scale)))
}

fn invalid(message: &str) -> SessionError {
    SessionError::InvalidClassicImport(message.into())
}

#[cfg(test)]
mod tests;
