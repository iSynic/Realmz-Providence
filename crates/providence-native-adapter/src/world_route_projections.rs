use providence_core::codecs::player_map_names;
use providence_core::codecs::player_map_record_has_semantics;
use providence_core::model::AssetDescriptor;
use providence_core::model::CLASSIC_MAP_SIZE;
use providence_core::model::LevelType;
use providence_core::model::MapLevel;
use providence_core::model::PlayerMapNameCatalog;
use providence_core::model::PlayerMapRecord;
use providence_core::model::ProjectSnapshot;
use providence_core::references::ReferenceDescriptor;
use providence_core::references::TargetKind;
use providence_core::session::EditorSession;
use serde_json::Value;
use serde_json::json;

pub(super) fn classic_source_present(snapshot: &ProjectSnapshot, native_path: &str) -> bool {
    snapshot
        .classic_sources
        .iter()
        .any(|source| source.native_path == native_path)
}

pub(super) fn map_catalog_item(
    session: &EditorSession,
    map: &MapLevel,
    references: Option<&[ReferenceDescriptor]>,
    diagnostics: Option<&[providence_core::validation::Diagnostic]>,
) -> Value {
    let action_points = session
        .snapshot()
        .world
        .action_points
        .iter()
        .filter(|action_point| {
            action_point.level_type == map.level_type
                && action_point.level_index == map.native_index
                && action_point.coordinate.is_some()
        })
        .count();
    let outgoing = references.map(|rows| {
        rows.iter()
            .filter(|reference| reference.source == map.identity)
            .count()
    });
    let used_by = references.map(|rows| {
        rows.iter()
            .filter(|reference| {
                reference.target_kind == TargetKind::Map && reference.target_id == map.identity.0
            })
            .count()
    });
    let diagnostic_count = diagnostics.map(|rows| {
        rows.iter()
            .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&map.identity))
            .count()
    });
    json!({
        "identity": map.identity,
        "levelType": map.level_type,
        "nativeIndex": map.native_index,
        "name": map.name,
        "width": CLASSIC_MAP_SIZE,
        "height": CLASSIC_MAP_SIZE,
        "hasRuntimeMetadata": map.runtime.is_some(),
        "actionPoints": action_points,
        "sourcePresent": classic_source_present(session.snapshot(), if map.level_type == LevelType::Land { "Data LD" } else { "Data DL" }),
        "editability": "editable",
        "referenceSummary": { "outgoing": outgoing, "usedBy": used_by },
        "referencesChecked": references.is_some(),
        "diagnosticCount": diagnostic_count,
        "diagnosticsChecked": diagnostics.is_some(),
        "usedBy": used_by,
        "problems": diagnostic_count,
    })
}

pub(super) fn player_map_catalog_item(
    record: &PlayerMapRecord,
    names: Option<&PlayerMapNameCatalog>,
    references: &[ReferenceDescriptor],
    diagnostics: &[providence_core::validation::Diagnostic],
    source_present: bool,
) -> Value {
    let (available_name, unavailable_name) = player_map_names(names, record.native_id.0);
    let outgoing = references
        .iter()
        .filter(|reference| reference.source == record.identity)
        .count();
    let used_by = references
        .iter()
        .filter(|reference| {
            reference.target_kind == TargetKind::PlayerMap
                && reference.target_id == record.identity.0
        })
        .count();
    let diagnostic_count = diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&record.identity))
        .count();
    json!({
        "identity": record.identity,
        "nativeId": record.native_id,
        "name": available_name.filter(|name| !name.is_empty()).map(ToOwned::to_owned).unwrap_or_else(|| format!("Map {}", record.native_id.0 + 1)),
        "unavailableName": unavailable_name.unwrap_or_default(),
        "note": record.note,
        "target": format!("{}:{}", if record.is_dungeon { "dungeon" } else { "land" }, record.level),
        "runtimeAddressable": record.native_id.0 < 20,
        "defined": player_map_record_has_semantics(record),
        "mode": if record.show < 0 { "scrolling-text" } else if record.picture_id != 0 { "picture" } else if record.is_dungeon { "dungeon-crop" } else { "land-crop" },
        "sourcePresent": source_present,
        "editability": "editable",
        "referenceSummary": { "outgoing": outgoing, "usedBy": used_by },
        "diagnosticCount": diagnostic_count,
    })
}

pub(super) fn special_land_projection(session: &EditorSession, asset: &AssetDescriptor) -> Value {
    let resource_id = asset
        .classic_resource
        .as_ref()
        .filter(|resource| resource.resource_type == "cicn")
        .map(|resource| resource.resource_id);
    let uses = resource_id.map_or(0, |resource_id| {
        session
            .references()
            .iter()
            .filter(|reference| {
                reference.target_kind == TargetKind::SpecialLandTile
                    && reference.target_id == resource_id.to_string()
            })
            .count()
    });
    let outgoing = session
        .references()
        .iter()
        .filter(|reference| reference.source == asset.identity)
        .count();
    let diagnostic_count = session
        .diagnostics()
        .iter()
        .filter(|diagnostic| diagnostic.entity.as_ref() == Some(&asset.identity))
        .count();
    json!({
        "identity": asset.identity,
        "label": asset.label,
        "resourceType": "cicn",
        "resourceId": resource_id,
        "role": "map-overlay",
        "mimeType": asset.mime_type,
        "width": asset.width,
        "height": asset.height,
        "bytes": asset.byte_length,
        "classicPayloadBytes": asset.classic_payload_byte_length,
        "landlook": asset.landlook,
        "baseTile": asset.base_tile,
        "uses": uses,
        "sourcePresent": asset.classic_payload_blob.is_some(),
        "editability": "editable",
        "referenceSummary": { "outgoing": outgoing, "usedBy": uses },
        "diagnosticCount": diagnostic_count,
        "hasPreview": asset.mime_type.as_deref().is_some_and(|mime| mime.starts_with("image/")),
    })
}
