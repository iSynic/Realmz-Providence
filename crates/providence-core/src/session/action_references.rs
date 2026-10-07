use crate::action_authoring::{ActionTargetKind, settings_target_fields};
use crate::codecs::ACTION_POINT_LEVEL_BYTES;
use crate::codecs::ACTION_POINT_RECORD_BYTES;
use crate::codecs::EXTRA_ACTION_POINT_RECORD_BYTES;
use crate::model::ClassicAction;
use crate::model::LevelType;
use crate::model::ProjectSnapshot;
use crate::references::ByteProvenance;
use crate::references::FieldPath;
use crate::references::ReferenceDescriptor;
use crate::references::RepairAction;
use crate::references::ResolutionState;
use crate::references::TargetKind;
use crate::session::reference_targets::direct_action_reference;
use crate::session::reference_targets::optional_signed_numeric_reference;
use crate::session::reference_targets::reference_for_classic_target;
use crate::session::reference_targets::sound_reference;

pub(super) fn action_point_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    snapshot
        .world
        .action_points
        .iter()
        .flat_map(|action_point| {
            action_point.actions.iter().filter_map(move |action| {
                let absolute_record =
                    action_point.level_index as usize * 100 + action_point.record_index as usize;
                let byte_start = action_point.level_index as usize * ACTION_POINT_LEVEL_BYTES
                    + action_point.record_index as usize * ACTION_POINT_RECORD_BYTES
                    + 24
                    + action.slot as usize * 2;
                let native_path = match action_point.level_type {
                    LevelType::Land => "Data DD",
                    LevelType::Dungeon => "Data DDD",
                };
                direct_action_reference(
                    snapshot,
                    action_point.identity.clone(),
                    action,
                    ByteProvenance {
                        native_path: native_path.into(),
                        record_index: absolute_record as u32,
                        byte_start: byte_start as u32,
                        byte_end: byte_start as u32 + 2,
                    },
                )
            })
        })
        .collect()
}

pub(super) fn random_rectangle_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for map in &snapshot.world.maps {
        let Some(runtime) = &map.runtime else {
            continue;
        };
        let native_path = match map.level_type {
            LevelType::Land => "Data RD",
            LevelType::Dungeon => "Data RDD",
        };
        for rectangle in &runtime.random_rectangles {
            let Some(slot) = rectangle
                .identity
                .0
                .strip_prefix(&format!("{}:rect:", map.identity.0))
                .and_then(|value| value.parse::<usize>().ok())
                .filter(|slot| *slot < crate::codecs::RANDOM_RECTANGLE_SLOTS)
            else {
                continue;
            };
            let record_start = map.native_index as usize * crate::codecs::RANDOM_LEVEL_RECORD_BYTES;
            append_random_battle_references(
                snapshot,
                map,
                rectangle,
                slot,
                native_path,
                &mut references,
            );
            for door_slot in 0..3 {
                if rectangle.random_door_percent[door_slot] == 0 {
                    continue;
                }
                let byte_start = record_start + 280 + slot * 6 + door_slot * 2;
                references.push(reference_for_classic_target(
                    snapshot,
                    rectangle.identity.clone(),
                    format!("randomDoors[{door_slot}]"),
                    TargetKind::ExtraActionPoint,
                    rectangle.random_doors[door_slot],
                    ByteProvenance {
                        native_path: native_path.into(),
                        record_index: map.native_index,
                        byte_start: byte_start as u32,
                        byte_end: byte_start as u32 + 2,
                    },
                ));
            }
            append_random_media_references(
                snapshot,
                map,
                rectangle,
                slot,
                native_path,
                &mut references,
            );
        }
    }
    references
}

pub(super) fn extra_action_point_references(
    snapshot: &ProjectSnapshot,
) -> Vec<ReferenceDescriptor> {
    snapshot
        .extra_action_points
        .iter()
        .flat_map(|row| {
            row.actions.iter().filter_map(move |action| {
                let byte_start = row.native_id.0 as usize * EXTRA_ACTION_POINT_RECORD_BYTES
                    + 24
                    + action.slot as usize * 2;
                direct_action_reference(
                    snapshot,
                    row.identity.clone(),
                    action,
                    ByteProvenance {
                        native_path: "Data ED3".into(),
                        record_index: row.native_id.0,
                        byte_start: byte_start as u32,
                        byte_end: byte_start as u32 + 2,
                    },
                )
            })
        })
        .collect()
}

pub(super) fn settings_action_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for row in &snapshot.world.action_points {
        append_settings_references(snapshot, &row.identity, &row.actions, &mut references);
    }
    for row in &snapshot.extra_action_points {
        append_settings_references(snapshot, &row.identity, &row.actions, &mut references);
    }
    for row in snapshot
        .simple_encounters
        .iter()
        .filter(|row| row.has_semantics())
    {
        append_settings_references(snapshot, &row.identity, &row.actions, &mut references);
    }
    for row in &snapshot.complex_encounters {
        append_settings_references(snapshot, &row.identity, &row.actions, &mut references);
    }
    references
}

fn append_settings_references(
    snapshot: &ProjectSnapshot,
    source: &crate::model::StableId,
    actions: &[ClassicAction],
    references: &mut Vec<ReferenceDescriptor>,
) {
    for action in actions {
        let Ok(row_id) = u32::try_from(action.target_native_id) else {
            continue;
        };
        let Some(row) = snapshot
            .extra_codes
            .iter()
            .find(|row| row.native_id.0 == row_id)
        else {
            continue;
        };
        for field in settings_target_fields(
            action.opcode(),
            row.values,
            crate::action_authoring::option_labels_present(snapshot),
        ) {
            append_settings_field_reference(snapshot, source, action, row_id, field, references);
        }
    }
}

fn append_settings_field_reference(
    snapshot: &ProjectSnapshot,
    source: &crate::model::StableId,
    action: &ClassicAction,
    row_id: u32,
    field: crate::action_authoring::SettingsTargetField,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let field_path = format!("actions[{}].settings.{}", action.slot, field.key);
    if field.kind == ActionTargetKind::Sound {
        references.push(sound_reference(
            snapshot,
            source.clone(),
            field_path,
            field.value,
            "Data EDCD",
            row_id,
            row_id as usize * 10 + usize::from(field.index) * 2,
        ));
        return;
    }
    if field.kind == ActionTargetKind::ExtraActionPoint {
        references.push(reference_for_classic_target(
            snapshot,
            source.clone(),
            field_path,
            TargetKind::ExtraActionPoint,
            field.value,
            settings_provenance(row_id, field.index),
        ));
        return;
    }
    let Some(target_kind) = settings_target_kind(field.kind) else {
        return;
    };
    let lookup_value = if action.opcode() == 86
        && matches!(field.kind, ActionTargetKind::Race | ActionTargetKind::Caste)
    {
        field.value.saturating_abs()
    } else {
        field.value
    };
    let preview = crate::action_authoring::target_preview(
        snapshot,
        field.kind,
        lookup_value,
        &Default::default(),
    );
    references.push(resolved_settings_reference(
        source,
        field_path,
        target_kind,
        lookup_value,
        row_id,
        field.index,
        preview.map(|target| target.identity.0),
    ));
}

fn resolved_settings_reference(
    source: &crate::model::StableId,
    field: String,
    target_kind: TargetKind,
    value: i16,
    row_id: u32,
    word: u8,
    identity: Option<String>,
) -> ReferenceDescriptor {
    let resolved = identity.is_some();
    let target_id = if target_kind == TargetKind::Battle {
        i32::from(value).unsigned_abs().to_string()
    } else {
        identity.unwrap_or_else(|| i32::from(value).to_string())
    };
    ReferenceDescriptor {
        source: source.clone(),
        field: FieldPath(field),
        target_kind,
        target_id,
        required: true,
        stock_fallback: None,
        resolution: if resolved {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        repair_actions: if resolved {
            vec![RepairAction::Retarget]
        } else {
            vec![RepairAction::Retarget, RepairAction::CreateTarget]
        },
        byte_provenance: Some(settings_provenance(row_id, word)),
    }
}

fn settings_provenance(row_id: u32, word: u8) -> ByteProvenance {
    ByteProvenance {
        native_path: "Data EDCD".into(),
        record_index: row_id,
        byte_start: row_id * 10 + u32::from(word) * 2,
        byte_end: row_id * 10 + u32::from(word) * 2 + 2,
    }
}

fn settings_target_kind(kind: ActionTargetKind) -> Option<TargetKind> {
    Some(match kind {
        ActionTargetKind::Race => TargetKind::Race,
        ActionTargetKind::Caste => TargetKind::Caste,
        ActionTargetKind::Battle => TargetKind::Battle,
        ActionTargetKind::Message
        | ActionTargetKind::OptionLabel
        | ActionTargetKind::Quest
        | ActionTargetKind::Treasure
        | ActionTargetKind::Item
        | ActionTargetKind::Shop
        | ActionTargetKind::SimpleEncounter
        | ActionTargetKind::ComplexEncounter
        | ActionTargetKind::RogueEncounter
        | ActionTargetKind::Picture
        | ActionTargetKind::Monster
        | ActionTargetKind::MonsterAppearance
        | ActionTargetKind::MonsterNameTag
        | ActionTargetKind::PlayerMap
        | ActionTargetKind::TextResource
        | ActionTargetKind::Spell
        | ActionTargetKind::Sound
        | ActionTargetKind::ExtraActionPoint
        | ActionTargetKind::TimedEncounter
        | ActionTargetKind::SameMapActionPoint
        | ActionTargetKind::Map
        | ActionTargetKind::MapTile
        | ActionTargetKind::RandomRectangle => return None,
    })
}

fn append_random_battle_references(
    snapshot: &ProjectSnapshot,
    map: &crate::model::MapLevel,
    rectangle: &crate::model::RandomRectangle,
    slot: usize,
    native_path: &str,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let record_start = map.native_index as usize * crate::codecs::RANDOM_LEVEL_RECORD_BYTES;
    if rectangle.battle_range[0] != 0 {
        for endpoint in 0..2 {
            let raw_id = rectangle.battle_range[endpoint];
            let native_id = i32::from(raw_id).unsigned_abs();
            let resolved = snapshot
                .battles
                .iter()
                .any(|battle| battle.native_id.0 == native_id);
            references.push(ReferenceDescriptor {
                source: rectangle.identity.clone(),
                field: FieldPath(format!("battleRange[{endpoint}]")),
                target_kind: TargetKind::Battle,
                target_id: native_id.to_string(),
                required: true,
                stock_fallback: None,
                resolution: if resolved {
                    ResolutionState::Resolved
                } else {
                    ResolutionState::Missing
                },
                repair_actions: if resolved {
                    vec![RepairAction::Retarget]
                } else {
                    vec![RepairAction::Retarget, RepairAction::CreateTarget]
                },
                byte_provenance: Some(ByteProvenance {
                    native_path: native_path.into(),
                    record_index: map.native_index,
                    byte_start: (record_start + 200 + slot * 4 + endpoint * 2) as u32,
                    byte_end: (record_start + 202 + slot * 4 + endpoint * 2) as u32,
                }),
            });
        }
    }
}

fn append_random_media_references(
    snapshot: &ProjectSnapshot,
    map: &crate::model::MapLevel,
    rectangle: &crate::model::RandomRectangle,
    slot: usize,
    native_path: &str,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let record_start = map.native_index as usize * crate::codecs::RANDOM_LEVEL_RECORD_BYTES;
    if rectangle.sound_id != 0 {
        references.push(sound_reference(
            snapshot,
            rectangle.identity.clone(),
            "sound".into(),
            rectangle.sound_id,
            native_path,
            map.native_index,
            record_start + 564 + slot * 2,
        ));
    }
    if rectangle.text_id != 0 {
        references.push(optional_signed_numeric_reference(
            snapshot,
            rectangle.identity.clone(),
            "text",
            TargetKind::Message,
            rectangle.text_id,
            ByteProvenance {
                native_path: native_path.into(),
                record_index: map.native_index,
                byte_start: (record_start + 604 + slot * 2) as u32,
                byte_end: (record_start + 606 + slot * 2) as u32,
            },
        ));
    }
}

#[cfg(test)]
#[path = "action_references_tests.rs"]
mod tests;
