use crate::codecs::player_map_record_has_semantics;
use crate::model::AssetDescriptor;
use crate::model::ClassicAction;
use crate::model::MessageReference;
use crate::model::NativeRecordId;
use crate::model::ProjectSnapshot;
use crate::model::StableId;
use crate::references::ByteProvenance;
use crate::references::FieldPath;
use crate::references::ReferenceDescriptor;
use crate::references::RepairAction;
use crate::references::ResolutionState;
use crate::references::TargetKind;
use std::collections::BTreeSet;

pub(super) fn asset_reference_identity(asset: &AssetDescriptor) -> Option<StableId> {
    (asset.kind == "special-land-tile")
        .then_some(asset.classic_resource.as_ref())
        .flatten()
        .filter(|resource| resource.resource_type == "cicn" && resource.resource_id < 0)
        .map(|resource| StableId(format!("special-land.{}", resource.resource_id)))
}

pub(super) fn sound_reference(
    snapshot: &ProjectSnapshot,
    source: StableId,
    field: String,
    sound_id: i16,
    native_path: &str,
    record_index: u32,
    byte_start: usize,
) -> ReferenceDescriptor {
    classic_media_reference(
        snapshot,
        source,
        field,
        TargetKind::Sound,
        "sound",
        "snd ",
        i32::from(sound_id).unsigned_abs() as i32,
        native_path,
        record_index,
        byte_start,
    )
}

pub(super) fn picture_reference(
    snapshot: &ProjectSnapshot,
    source: StableId,
    field: String,
    picture_id: i16,
    native_path: &str,
    record_index: u32,
    byte_start: usize,
) -> ReferenceDescriptor {
    classic_media_reference(
        snapshot,
        source,
        field,
        TargetKind::Picture,
        "picture",
        "PICT",
        i32::from(picture_id),
        native_path,
        record_index,
        byte_start,
    )
}

#[allow(clippy::too_many_arguments)]
pub(super) fn classic_media_reference(
    snapshot: &ProjectSnapshot,
    source: StableId,
    field: String,
    target_kind: TargetKind,
    asset_kind: &str,
    resource_type: &str,
    resource_id: i32,
    native_path: &str,
    record_index: u32,
    byte_start: usize,
) -> ReferenceDescriptor {
    use crate::resource_resolution::{ScenarioResourceResolution, scenario_resource};
    let resource = crate::model::ClassicResourceKey {
        resource_type: resource_type.into(),
        resource_id,
    };
    let (asset, resolution) = match scenario_resource(snapshot, &resource, asset_kind) {
        ScenarioResourceResolution::Resolved(asset) => (Some(asset), ResolutionState::Resolved),
        ScenarioResourceResolution::Missing => (None, ResolutionState::StockFallback),
        ScenarioResourceResolution::WrongKind => (None, ResolutionState::Missing),
        ScenarioResourceResolution::Ambiguous => (None, ResolutionState::Ambiguous),
    };
    ReferenceDescriptor {
        source,
        field: FieldPath(field),
        target_kind,
        target_id: asset
            .map(|asset| asset.identity.0.clone())
            .unwrap_or_else(|| resource_id.to_string()),
        required: false,
        stock_fallback: (resolution == ResolutionState::StockFallback)
            .then(|| format!("Classic application {asset_kind} catalog")),
        resolution,
        repair_actions: vec![
            RepairAction::Retarget,
            RepairAction::ImportTarget,
            RepairAction::ClearOptional,
        ],
        byte_provenance: Some(ByteProvenance {
            native_path: native_path.into(),
            record_index,
            byte_start: byte_start as u32,
            byte_end: byte_start as u32 + 2,
        }),
    }
}

pub(super) fn direct_action_reference(
    snapshot: &ProjectSnapshot,
    source: StableId,
    action: &ClassicAction,
    byte_provenance: ByteProvenance,
) -> Option<ReferenceDescriptor> {
    use crate::action_authoring::ActionTargetKind;
    let field = format!("actions[{}].target", action.slot);
    match crate::action_authoring::direct_target_kind(action.opcode())? {
        // Castle newland.c case 89 reads the active difficulty set, not always Data MD.
        ActionTargetKind::Quest | ActionTargetKind::Monster => None,
        ActionTargetKind::Sound => Some(sound_reference(
            snapshot,
            source,
            field,
            action.target_native_id,
            &byte_provenance.native_path,
            byte_provenance.record_index,
            byte_provenance.byte_start as usize,
        )),
        ActionTargetKind::Picture => Some(picture_reference(
            snapshot,
            source,
            field,
            action.target_native_id,
            &byte_provenance.native_path,
            byte_provenance.record_index,
            byte_provenance.byte_start as usize,
        )),

        _ => direct_reference_target_kind(action.opcode()).map(|target_kind| {
            reference_for_classic_target(
                snapshot,
                source,
                field,
                target_kind,
                action.target_native_id,
                byte_provenance,
            )
        }),
    }
}

pub(super) fn optional_signed_numeric_reference(
    snapshot: &ProjectSnapshot,
    source: StableId,
    field: &str,
    target_kind: TargetKind,
    target_id: i16,
    byte_provenance: ByteProvenance,
) -> ReferenceDescriptor {
    optional_numeric_reference(
        snapshot,
        source,
        field,
        target_kind,
        i32::from(target_id).unsigned_abs(),
        byte_provenance,
    )
}

pub(super) fn optional_numeric_reference(
    snapshot: &ProjectSnapshot,
    source: StableId,
    field: &str,
    target_kind: TargetKind,
    target_id: u32,
    byte_provenance: ByteProvenance,
) -> ReferenceDescriptor {
    let resolved = match target_kind {
        TargetKind::Message => snapshot
            .messages
            .iter()
            .any(|message| message.native_id.0 == target_id),
        TargetKind::OptionLabel => snapshot
            .option_labels
            .iter()
            .any(|label| label.native_id.0 == target_id),
        TargetKind::QuestFlag => (u32::from(crate::model::CLASSIC_QUEST_FLAG_MIN)
            ..=u32::from(crate::model::CLASSIC_QUEST_FLAG_MAX))
            .contains(&target_id),
        _ => false,
    };
    ReferenceDescriptor {
        source,
        field: FieldPath(field.into()),
        target_kind,
        target_id: target_id.to_string(),
        required: false,
        stock_fallback: None,
        resolution: if resolved {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        repair_actions: if resolved {
            vec![RepairAction::Retarget, RepairAction::ClearOptional]
        } else {
            vec![
                RepairAction::Retarget,
                RepairAction::CreateTarget,
                RepairAction::ClearOptional,
            ]
        },
        byte_provenance: Some(byte_provenance),
    }
}

pub(super) fn direct_reference_target_kind(opcode: i16) -> Option<TargetKind> {
    use crate::action_authoring::ActionTargetKind;
    Some(match crate::action_authoring::direct_target_kind(opcode)? {
        ActionTargetKind::Message => TargetKind::Message,
        ActionTargetKind::SimpleEncounter => TargetKind::SimpleEncounter,
        ActionTargetKind::ComplexEncounter => TargetKind::ComplexEncounter,
        ActionTargetKind::SameMapActionPoint => TargetKind::ActionPoint,
        ActionTargetKind::Treasure => TargetKind::Treasure,
        ActionTargetKind::PlayerMap => TargetKind::PlayerMap,
        ActionTargetKind::Shop => TargetKind::Shop,
        ActionTargetKind::ExtraActionPoint => TargetKind::ExtraActionPoint,
        ActionTargetKind::TextResource => TargetKind::TextResource,
        ActionTargetKind::Monster => return None,
        // These direct-reference families have specialized resolution and provenance owners.
        ActionTargetKind::Quest | ActionTargetKind::Sound | ActionTargetKind::Picture => {
            return None;
        }
        _ => return None,
    })
}

pub(super) fn reference_for_classic_target(
    snapshot: &ProjectSnapshot,
    source: StableId,
    field: String,
    target_kind: TargetKind,
    target_native_id: i16,
    byte_provenance: ByteProvenance,
) -> ReferenceDescriptor {
    let signed_magnitude_target = matches!(
        target_kind,
        TargetKind::Message | TargetKind::Shop | TargetKind::PlayerMap
    );
    let signed_identity_target = target_kind == TargetKind::TextResource;
    let normalized_target_native_id = if signed_magnitude_target {
        i32::from(target_native_id).unsigned_abs()
    } else {
        target_native_id.max(0) as u32
    };
    let target_id = if target_kind == TargetKind::PlayerMap {
        format!("player-map:{normalized_target_native_id}")
    } else if target_kind == TargetKind::Monster {
        format!("monster:0:{normalized_target_native_id}")
    } else if matches!(target_kind, TargetKind::Message | TargetKind::Shop) {
        normalized_target_native_id.to_string()
    } else {
        target_native_id.to_string()
    };
    let resolved = (target_native_id >= 0 || signed_magnitude_target || signed_identity_target)
        && classic_target_exists(
            snapshot,
            &source,
            &target_kind,
            target_native_id,
            normalized_target_native_id,
        );
    ReferenceDescriptor {
        source,
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
        byte_provenance: Some(byte_provenance),
    }
}

pub(super) fn reference_descriptor(
    reference: &MessageReference,
    target_ids: &BTreeSet<NativeRecordId>,
) -> ReferenceDescriptor {
    let resolved = target_ids.contains(&reference.target_native_id);
    ReferenceDescriptor {
        source: reference.source.clone(),
        field: FieldPath(reference.field.clone()),
        target_kind: TargetKind::Message,
        target_id: reference.target_native_id.0.to_string(),
        required: reference.required,
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
        byte_provenance: None,
    }
}

pub(super) fn target_kind_slug(kind: &TargetKind) -> &'static str {
    match kind {
        TargetKind::Message => "message",
        TargetKind::OptionLabel => "option-label",
        TargetKind::QuestFlag => "quest-flag",
        TargetKind::ActionPoint => "action-point",
        TargetKind::ExtraActionPoint => "extra-action-point",
        TargetKind::SimpleEncounter => "simple-encounter",
        TargetKind::ComplexEncounter => "complex-encounter",
        TargetKind::RogueEncounter => "rogue-encounter",
        TargetKind::Map => "map",
        TargetKind::PlayerMap => "player-map",
        TargetKind::Race => "race",
        TargetKind::Caste => "caste",
        TargetKind::Item => "item",
        TargetKind::Monster => "monster",
        TargetKind::Battle => "battle",
        TargetKind::Spell => "spell",
        TargetKind::Icon => "icon",
        TargetKind::Picture => "picture",
        TargetKind::TextResource => "text-resource",
        TargetKind::Sound => "sound",
        TargetKind::ScenarioProgram => "scenario-program",
        TargetKind::SpecialLandTile => "special-land-tile",
        TargetKind::Treasure => "treasure",
        TargetKind::Shop => "shop",
        TargetKind::Landlook => "landlook",
    }
}

pub(super) fn reference_target_identity(reference: &ReferenceDescriptor) -> StableId {
    if matches!(
        reference.target_kind,
        TargetKind::Map
            | TargetKind::PlayerMap
            | TargetKind::Race
            | TargetKind::Caste
            | TargetKind::Item
            | TargetKind::Monster
            | TargetKind::Spell
            | TargetKind::Icon
            | TargetKind::Picture
            | TargetKind::TextResource
            | TargetKind::Sound
            | TargetKind::ScenarioProgram
            | TargetKind::Landlook
    ) {
        return StableId(reference.target_id.clone());
    }
    if reference.target_kind == TargetKind::SpecialLandTile {
        return StableId(format!("special-land.{}", reference.target_id));
    }
    if reference.target_kind == TargetKind::QuestFlag {
        return StableId(format!("quest:{}", reference.target_id));
    }
    let prefix = match &reference.target_kind {
        TargetKind::Message => "message",
        TargetKind::OptionLabel => "option-label",
        TargetKind::QuestFlag => unreachable!("quest identities are normalized above"),
        TargetKind::ActionPoint => "action-point",
        TargetKind::ExtraActionPoint => "extra-action-point",
        TargetKind::SimpleEncounter => "simple-encounter",
        TargetKind::ComplexEncounter => "complex-encounter",
        TargetKind::RogueEncounter => "rogue-encounter",
        TargetKind::Battle => "battle",
        TargetKind::Map => unreachable!("map identities are already stable ids"),
        TargetKind::PlayerMap => unreachable!("player-map identities are already stable ids"),
        TargetKind::Race
        | TargetKind::Caste
        | TargetKind::Item
        | TargetKind::Monster
        | TargetKind::Spell
        | TargetKind::Icon
        | TargetKind::Picture
        | TargetKind::TextResource
        | TargetKind::Sound
        | TargetKind::ScenarioProgram => {
            unreachable!("rule and item identities are already stable ids")
        }
        TargetKind::Landlook => unreachable!("landlook identities are already stable ids"),
        TargetKind::SpecialLandTile => unreachable!("special-land identities are normalized above"),
        TargetKind::Treasure => "treasure",
        TargetKind::Shop => "shop",
    };
    StableId(format!("{prefix}:{}", reference.target_id))
}

fn classic_target_exists(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    target_kind: &TargetKind,
    target_native_id: i16,
    normalized_target_native_id: u32,
) -> bool {
    match target_kind {
        TargetKind::Message => snapshot
            .messages
            .iter()
            .any(|message| message.native_id.0 == normalized_target_native_id),
        TargetKind::OptionLabel
        | TargetKind::QuestFlag
        | TargetKind::SimpleEncounter
        | TargetKind::ComplexEncounter
        | TargetKind::RogueEncounter
        | TargetKind::ExtraActionPoint => {
            script_target_exists(snapshot, target_kind, target_native_id)
        }
        TargetKind::ActionPoint => local_action_point_exists(snapshot, source, target_native_id),
        TargetKind::PlayerMap => {
            normalized_target_native_id < 20
                && snapshot.world.player_maps.iter().any(|record| {
                    record.native_id.0 == normalized_target_native_id
                        && player_map_record_has_semantics(record)
                })
        }
        TargetKind::Treasure => snapshot
            .treasures
            .iter()
            .any(|treasure| treasure.native_id.0 == target_native_id as u32),
        TargetKind::Shop => snapshot
            .shops
            .iter()
            .any(|shop| shop.native_id.0 == normalized_target_native_id),
        TargetKind::TextResource => snapshot.assets.iter().any(|asset| {
            asset.kind == "text-resource"
                && asset.classic_resource.as_ref().is_some_and(|resource| {
                    resource.resource_type == "TEXT"
                        && resource.resource_id == i32::from(target_native_id)
                })
        }),
        TargetKind::Monster => normal_monster_exists(snapshot, normalized_target_native_id),
        TargetKind::Map
        | TargetKind::Race
        | TargetKind::Caste
        | TargetKind::Item
        | TargetKind::Battle
        | TargetKind::Spell
        | TargetKind::Icon
        | TargetKind::Picture
        | TargetKind::Sound
        | TargetKind::ScenarioProgram
        | TargetKind::Landlook => false,
        TargetKind::SpecialLandTile => false,
    }
}

fn normal_monster_exists(snapshot: &ProjectSnapshot, classic_id: u32) -> bool {
    snapshot.monster_sets.iter().any(|set| {
        set.set_id == 0
            && set
                .monsters
                .iter()
                .any(|monster| monster.native_id.0 == classic_id)
    })
}

fn script_target_exists(
    snapshot: &ProjectSnapshot,
    target_kind: &TargetKind,
    target_native_id: i16,
) -> bool {
    match target_kind {
        TargetKind::OptionLabel => snapshot
            .option_labels
            .iter()
            .any(|label| label.native_id.0 == target_native_id as u32),
        TargetKind::QuestFlag => (i16::from(crate::model::CLASSIC_QUEST_FLAG_MIN)
            ..=i16::from(crate::model::CLASSIC_QUEST_FLAG_MAX))
            .contains(&target_native_id),
        TargetKind::SimpleEncounter => snapshot
            .simple_encounters
            .iter()
            .any(|encounter| encounter.native_id.0 == target_native_id as u32),
        TargetKind::ComplexEncounter => snapshot
            .complex_encounters
            .iter()
            .any(|encounter| encounter.native_id.0 == target_native_id as u32),
        TargetKind::RogueEncounter => snapshot
            .rogue_encounters
            .iter()
            .any(|encounter| encounter.native_id.0 == target_native_id as u32),
        TargetKind::ExtraActionPoint => snapshot.extra_action_points.iter().any(|row| {
            row.native_id.0 == target_native_id as u32
                && !crate::session::extra_action_point_commands::extra_action_point_is_reusable(row)
        }),
        _ => false,
    }
}

fn local_action_point_exists(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    target_native_id: i16,
) -> bool {
    snapshot
        .world
        .action_points
        .iter()
        .find(|row| &row.identity == source)
        .is_some_and(|source_row| {
            snapshot.world.action_points.iter().any(|candidate| {
                candidate.level_type == source_row.level_type
                    && candidate.level_index == source_row.level_index
                    && i16::from(candidate.record_index) == target_native_id
            })
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codecs::{MONSTER_RECORD_BYTES, decode_monster_set};

    #[test]
    fn explicit_normal_monster_identity_resolves_without_changing_contextual_ally_links() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("ally-reference".into()));
        snapshot.monster_sets.push(decode_monster_set(
            &vec![0; MONSTER_RECORD_BYTES * 2],
            "Data MD",
            0,
        ));
        let source = StableId("extra-action-point:4".into());
        let provenance = ByteProvenance {
            native_path: "Data ED3".into(),
            record_index: 4,
            byte_start: 184,
            byte_end: 186,
        };
        assert_eq!(direct_reference_target_kind(89), None);
        assert_eq!(direct_reference_target_kind(127), None);
        let found = reference_for_classic_target(
            &snapshot,
            source.clone(),
            "actions[0].target".into(),
            TargetKind::Monster,
            1,
            provenance.clone(),
        );
        assert_eq!(found.target_id, "monster:0:1");
        assert_eq!(found.resolution, ResolutionState::Resolved);

        snapshot.monster_sets.clear();
        let missing = reference_for_classic_target(
            &snapshot,
            source,
            "actions[0].target".into(),
            TargetKind::Monster,
            1,
            provenance,
        );
        assert_eq!(missing.resolution, ResolutionState::Missing);
    }

    #[test]
    fn direct_reference_projection_uses_authoring_semantics() {
        for (opcode, expected) in [
            (1, Some(TargetKind::Message)),
            (4, Some(TargetKind::SimpleEncounter)),
            (5, Some(TargetKind::ComplexEncounter)),
            (6, Some(TargetKind::Shop)),
            (8, Some(TargetKind::ActionPoint)),
            (10, Some(TargetKind::Treasure)),
            (29, Some(TargetKind::PlayerMap)),
            (39, Some(TargetKind::ExtraActionPoint)),
            (62, Some(TargetKind::TextResource)),
            (89, None),
            (127, None),
            (42, None),
            (74, None),
        ] {
            assert_eq!(
                direct_reference_target_kind(opcode),
                expected,
                "opcode {opcode}"
            );
        }
    }
}
