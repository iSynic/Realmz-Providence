use crate::codecs::SHOP_ITEM_SLOTS;
use crate::codecs::SHOP_RECORD_BYTES;
use crate::codecs::TREASURE_RECORD_BYTES;
use crate::model::{ProjectSnapshot, StableId};
use crate::references::ByteProvenance;
use crate::references::FieldPath;
use crate::references::ReferenceDescriptor;
use crate::references::RepairAction;
use crate::references::ResolutionState;
use crate::references::TargetKind;

pub(super) fn treasure_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for treasure in &snapshot.treasures {
        let row_start = treasure.native_id.0 as usize * TREASURE_RECORD_BYTES;
        for (slot, item_id) in treasure.item_ids.iter().copied().enumerate() {
            if item_id <= 0 {
                continue;
            }
            let resolved = snapshot
                .item_rules
                .iter()
                .find(|rule| rule.definition.classic_id == item_id)
                .map(|rule| rule.definition.id.0.clone())
                .or_else(|| {
                    snapshot
                        .scenario_item_rules
                        .iter()
                        .find(|rule| rule.definition.classic_id == item_id)
                        .map(|rule| rule.definition.id.0.clone())
                });
            references.push(ReferenceDescriptor {
                source: treasure.identity.clone(),
                field: FieldPath(format!("itemIds[{slot}]")),
                target_kind: TargetKind::Item,
                target_id: resolved.unwrap_or_else(|| item_id.to_string()),
                required: true,
                stock_fallback: None,
                resolution: if snapshot
                    .item_rules
                    .iter()
                    .any(|rule| rule.definition.classic_id == item_id)
                    || snapshot
                        .scenario_item_rules
                        .iter()
                        .any(|rule| rule.definition.classic_id == item_id)
                {
                    ResolutionState::Resolved
                } else {
                    ResolutionState::Missing
                },
                repair_actions: vec![RepairAction::Retarget, RepairAction::ImportTarget],
                byte_provenance: Some(ByteProvenance {
                    native_path: "Data TD".into(),
                    record_index: treasure.native_id.0,
                    byte_start: (row_start + slot * 2) as u32,
                    byte_end: (row_start + slot * 2 + 2) as u32,
                }),
            });
        }
    }
    references
}

pub(super) fn shop_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for shop in &snapshot.shops {
        let row_start = shop.native_id.0 as usize * SHOP_RECORD_BYTES;
        for category_start in (0..SHOP_ITEM_SLOTS).step_by(crate::codecs::SHOP_CATEGORY_SIZE) {
            for slot in category_start..category_start + crate::codecs::SHOP_CATEGORY_SIZE {
                let item_id = shop.item_ids[slot];
                if item_id < 0 {
                    break;
                }
                if item_id == 0 {
                    continue;
                }
                let resolved = snapshot
                    .item_rules
                    .iter()
                    .find(|rule| rule.definition.classic_id == item_id)
                    .map(|rule| rule.definition.id.0.clone())
                    .or_else(|| {
                        snapshot
                            .scenario_item_rules
                            .iter()
                            .find(|rule| rule.definition.classic_id == item_id)
                            .map(|rule| rule.definition.id.0.clone())
                    });
                references.push(ReferenceDescriptor {
                    source: shop.identity.clone(),
                    field: FieldPath(format!("itemIds[{slot}]")),
                    target_kind: TargetKind::Item,
                    target_id: resolved.clone().unwrap_or_else(|| item_id.to_string()),
                    required: true,
                    stock_fallback: None,
                    resolution: if resolved.is_some() {
                        ResolutionState::Resolved
                    } else {
                        ResolutionState::Missing
                    },
                    repair_actions: vec![RepairAction::Retarget, RepairAction::ImportTarget],
                    byte_provenance: Some(ByteProvenance {
                        native_path: "Data SD".into(),
                        record_index: shop.native_id.0,
                        byte_start: (row_start + slot * 2) as u32,
                        byte_end: (row_start + slot * 2 + 2) as u32,
                    }),
                });
            }
        }
    }
    references
}

pub(super) fn shop_program_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for (source, actions) in semantic_action_owners(snapshot) {
        for action in actions
            .iter()
            .filter(|action| matches!(action.opcode(), 51 | 73))
        {
            let Some(extra) = snapshot
                .extra_codes
                .iter()
                .find(|row| Some(row.native_id.0) == u32::try_from(action.target_native_id).ok())
            else {
                continue;
            };
            let raw_target = extra.values[0];
            if !crate::action_authoring::settings_target_fields(
                action.opcode(),
                extra.values,
                false,
            )
            .iter()
            .any(|field| field.index == 0)
            {
                continue;
            }
            let target = if action.opcode() == 73 {
                i32::from(raw_target).unsigned_abs()
            } else {
                raw_target as u32
            };
            let resolved = snapshot.shops.iter().any(|shop| shop.native_id.0 == target);
            references.push(ReferenceDescriptor {
                source: source.clone(),
                field: FieldPath(format!("actions[{}].extraCode.shop", action.slot)),
                target_kind: TargetKind::Shop,
                target_id: target.to_string(),
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
                    native_path: "Data EDCD".into(),
                    record_index: extra.native_id.0,
                    byte_start: extra.native_id.0 * crate::codecs::EXTRA_CODE_RECORD_BYTES as u32,
                    byte_end: extra.native_id.0 * crate::codecs::EXTRA_CODE_RECORD_BYTES as u32 + 2,
                }),
            });
        }
    }
    references
}

pub(super) fn option_label_program_references(
    snapshot: &ProjectSnapshot,
) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for (source, actions) in semantic_action_owners(snapshot) {
        for action in actions.iter().filter(|action| action.opcode() == 3) {
            let Some(extra) = snapshot
                .extra_codes
                .iter()
                .find(|row| Some(row.native_id.0) == u32::try_from(action.target_native_id).ok())
            else {
                continue;
            };
            append_option_label_prompts(snapshot, source, action.slot, extra, &mut references);
        }
    }
    references
}

fn semantic_action_owners(
    snapshot: &ProjectSnapshot,
) -> impl Iterator<Item = (&StableId, &[crate::model::ClassicAction])> {
    snapshot
        .world
        .action_points
        .iter()
        .map(|owner| (&owner.identity, owner.actions.as_slice()))
        .chain(
            snapshot
                .extra_action_points
                .iter()
                .map(|owner| (&owner.identity, owner.actions.as_slice())),
        )
        .chain(
            snapshot
                .simple_encounters
                .iter()
                .filter(|owner| owner.has_semantics())
                .map(|owner| (&owner.identity, owner.actions.as_slice())),
        )
        .chain(
            snapshot
                .complex_encounters
                .iter()
                .map(|owner| (&owner.identity, owner.actions.as_slice())),
        )
}

fn choice_content_exists(snapshot: &ProjectSnapshot, options: bool, target: u32) -> bool {
    if options {
        snapshot
            .option_labels
            .iter()
            .any(|label| label.native_id.0 == target)
    } else {
        snapshot
            .messages
            .iter()
            .any(|message| message.native_id.0 == target)
    }
}

fn append_option_label_prompts(
    snapshot: &ProjectSnapshot,
    source: &StableId,
    slot: u8,
    extra: &crate::model::ExtraCodeRow,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let options = crate::action_authoring::option_labels_present(snapshot);
    for field in crate::action_authoring::settings_target_fields(3, extra.values, options)
        .into_iter()
        .filter(|field| matches!(field.index, 3 | 4))
    {
        let prompt_index = usize::from(field.index);
        let raw_target = field.value;
        let target = i32::from(raw_target).unsigned_abs();
        let resolved = choice_content_exists(snapshot, options, target);
        let byte_start = extra.native_id.0 * crate::codecs::EXTRA_CODE_RECORD_BYTES as u32
            + prompt_index as u32 * 2;
        references.push(ReferenceDescriptor {
            source: source.clone(),
            field: FieldPath(format!(
                "actions[{}].extraCode.prompt{}",
                slot,
                prompt_index - 2
            )),
            target_kind: if options {
                TargetKind::OptionLabel
            } else {
                TargetKind::Message
            },
            target_id: target.to_string(),
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
                native_path: "Data EDCD".into(),
                record_index: extra.native_id.0,
                byte_start,
                byte_end: byte_start + 2,
            }),
        });
    }
}
