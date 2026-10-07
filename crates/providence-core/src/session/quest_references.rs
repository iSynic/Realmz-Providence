use crate::codecs::ACTION_POINT_LEVEL_BYTES;
use crate::codecs::ACTION_POINT_RECORD_BYTES;
use crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES;
use crate::codecs::EXTRA_ACTION_POINT_RECORD_BYTES;
use crate::codecs::SIMPLE_ENCOUNTER_RECORD_BYTES;
use crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES;
use crate::model::LevelType;
use crate::model::ProjectSnapshot;
use crate::model::StableId;
use crate::references::ByteProvenance;
use crate::references::FieldPath;
use crate::references::ReferenceDescriptor;
use crate::references::RepairAction;
use crate::references::ResolutionState;
use crate::references::TargetKind;

pub(super) fn quest_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for owner in &snapshot.world.action_points {
        let absolute_record = owner.level_index * 100 + u32::from(owner.record_index);
        let row_start = owner.level_index as usize * ACTION_POINT_LEVEL_BYTES
            + owner.record_index as usize * ACTION_POINT_RECORD_BYTES;
        append_quest_action_references(
            snapshot,
            &mut references,
            owner.identity.clone(),
            &owner.actions,
            match owner.level_type {
                LevelType::Land => "Data DD",
                LevelType::Dungeon => "Data DDD",
            },
            absolute_record,
            row_start + 24,
        );
    }
    for owner in &snapshot.extra_action_points {
        append_quest_action_references(
            snapshot,
            &mut references,
            owner.identity.clone(),
            &owner.actions,
            "Data ED3",
            owner.native_id.0,
            owner.native_id.0 as usize * EXTRA_ACTION_POINT_RECORD_BYTES + 24,
        );
    }
    for owner in snapshot
        .simple_encounters
        .iter()
        .filter(|owner| owner.has_semantics())
    {
        append_quest_action_references(
            snapshot,
            &mut references,
            owner.identity.clone(),
            &owner.actions,
            "Data ED",
            owner.native_id.0,
            owner.native_id.0 as usize * SIMPLE_ENCOUNTER_RECORD_BYTES + 32,
        );
    }
    for owner in &snapshot.complex_encounters {
        append_quest_action_references(
            snapshot,
            &mut references,
            owner.identity.clone(),
            &owner.actions,
            "Data ED2",
            owner.native_id.0,
            owner.native_id.0 as usize * COMPLEX_ENCOUNTER_RECORD_BYTES + 32,
        );
    }
    append_timed_quest_references(snapshot, &mut references);
    references
}

#[allow(clippy::too_many_arguments)]
pub(super) fn append_quest_action_references(
    snapshot: &ProjectSnapshot,
    references: &mut Vec<ReferenceDescriptor>,
    source: StableId,
    actions: &[crate::model::ClassicAction],
    native_path: &str,
    record_index: u32,
    target_byte_start: usize,
) {
    for action in actions {
        let opcode = action.opcode();
        if opcode == 47 {
            if action.target_native_id == 0 {
                continue;
            }
            let byte_start = target_byte_start + action.slot as usize * 2;
            references.push(quest_reference(
                source.clone(),
                format!(
                    "actions[{}].questFlag.{}",
                    action.slot,
                    if action.target_native_id < 0 {
                        "clear"
                    } else {
                        "set"
                    }
                ),
                i32::from(action.target_native_id).unsigned_abs() as i32,
                ByteProvenance {
                    native_path: native_path.into(),
                    record_index,
                    byte_start: byte_start as u32,
                    byte_end: byte_start as u32 + 2,
                },
            ));
            continue;
        }
        append_extra_code_quest_references(snapshot, references, &source, action);
    }
}

pub(super) fn extra_code_provenance(
    record_index: u32,
    value_index: usize,
    width: usize,
) -> ByteProvenance {
    let byte_start =
        record_index as usize * crate::codecs::EXTRA_CODE_RECORD_BYTES + value_index * 2;
    ByteProvenance {
        native_path: "Data EDCD".into(),
        record_index,
        byte_start: byte_start as u32,
        byte_end: (byte_start + width) as u32,
    }
}

pub(super) fn quest_reference(
    source: StableId,
    field: String,
    quest_id: i32,
    byte_provenance: ByteProvenance,
) -> ReferenceDescriptor {
    let reserved = matches!(quest_id, 0 | 127);
    let authorable = (i32::from(crate::model::CLASSIC_QUEST_FLAG_MIN)
        ..=i32::from(crate::model::CLASSIC_QUEST_FLAG_MAX))
        .contains(&quest_id);
    ReferenceDescriptor {
        source,
        field: FieldPath(field),
        target_kind: TargetKind::QuestFlag,
        target_id: quest_id.to_string(),
        required: true,
        stock_fallback: reserved.then(|| {
            if quest_id == 0 {
                "Classic always-enabled quest sentinel".into()
            } else {
                "Classic registration marker".into()
            }
        }),
        resolution: if reserved {
            ResolutionState::StockFallback
        } else if authorable {
            ResolutionState::Resolved
        } else {
            ResolutionState::Missing
        },
        repair_actions: vec![RepairAction::EditSource],
        byte_provenance: Some(byte_provenance),
    }
}

fn append_timed_quest_references(
    snapshot: &ProjectSnapshot,
    references: &mut Vec<ReferenceDescriptor>,
) {
    for encounter in &snapshot.timed_encounters {
        if encounter.required_quest < 0 {
            continue;
        }
        let byte_start = encounter.native_id.0 * TIMED_ENCOUNTER_RECORD_BYTES as u32 + 18;
        references.push(quest_reference(
            encounter.identity.clone(),
            "requiredQuest".into(),
            i32::from(encounter.required_quest),
            ByteProvenance {
                native_path: "Data TD3".into(),
                record_index: encounter.native_id.0,
                byte_start,
                byte_end: byte_start + 2,
            },
        ));
    }
}

fn append_extra_code_quest_references(
    snapshot: &ProjectSnapshot,
    references: &mut Vec<ReferenceDescriptor>,
    source: &StableId,
    action: &crate::model::ClassicAction,
) {
    let opcode = action.opcode();
    let Ok(extra_id) = u32::try_from(action.target_native_id) else {
        return;
    };
    let Some(extra) = snapshot
        .extra_codes
        .iter()
        .find(|row| row.native_id.0 == extra_id)
    else {
        return;
    };
    let fields: Vec<_> = crate::action_authoring::settings_target_fields(
        opcode,
        extra.values,
        crate::action_authoring::option_labels_present(snapshot),
    )
    .into_iter()
    .filter(|field| field.kind == crate::action_authoring::ActionTargetKind::Quest)
    .collect();
    if opcode == 72 && fields.len() == 2 {
        append_quest_range_references(references, source, action.slot, extra);
        return;
    }
    for field in fields {
        references.push(quest_reference(
            source.clone(),
            format!("actions[{}].settings.{}", action.slot, field.key),
            i32::from(field.value),
            extra_code_provenance(extra.native_id.0, usize::from(field.index), 2),
        ));
    }
}
fn append_quest_range_references(
    references: &mut Vec<ReferenceDescriptor>,
    source: &StableId,
    slot: u8,
    extra: &crate::model::ExtraCodeRow,
) {
    let field = "range";
    let [low, high, ..] = extra.values;
    if (0..=127).contains(&low) && (0..=127).contains(&high) {
        for quest_id in low..=high {
            references.push(quest_reference(
                source.clone(),
                format!("actions[{}].extraCode.{field}[{quest_id}]", slot),
                i32::from(quest_id),
                extra_code_provenance(extra.native_id.0, 0, 4),
            ));
        }
    } else {
        for (index, quest_id) in [extra.values[0], extra.values[1]].into_iter().enumerate() {
            references.push(quest_reference(
                source.clone(),
                format!("actions[{slot}].extraCode.{field}Endpoint[{index}]"),
                i32::from(quest_id),
                extra_code_provenance(extra.native_id.0, index, 2),
            ));
        }
    }
}
