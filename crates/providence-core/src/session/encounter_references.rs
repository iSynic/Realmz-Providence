use crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES;
use crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES;
use crate::codecs::SIMPLE_ENCOUNTER_RECORD_BYTES;
use crate::codecs::TIMED_ENCOUNTER_RECORD_BYTES;
use crate::model::ComplexEncounter;
use crate::model::ProjectSnapshot;
use crate::model::RogueEncounter;
use crate::references::ByteProvenance;
use crate::references::FieldPath;
use crate::references::ReferenceDescriptor;
use crate::references::RepairAction;
use crate::references::ResolutionState;
use crate::references::TargetKind;
use crate::session::combat_references::monster_item_reference;
use crate::session::combat_references::spell_reference;
use crate::session::reference_targets::direct_action_reference;
use crate::session::reference_targets::optional_numeric_reference;
use crate::session::reference_targets::reference_for_classic_target;
use crate::session::reference_targets::sound_reference;

pub(super) fn simple_encounter_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for encounter in snapshot
        .simple_encounters
        .iter()
        .filter(|encounter| encounter.has_semantics())
    {
        let row_start = encounter.native_id.0 as usize * SIMPLE_ENCOUNTER_RECORD_BYTES;
        references.push(reference_for_classic_target(
            snapshot,
            encounter.identity.clone(),
            "promptMessage".into(),
            TargetKind::Message,
            encounter.prompt_message_native_id,
            ByteProvenance {
                native_path: "Data ED".into(),
                record_index: encounter.native_id.0,
                byte_start: (row_start + 104) as u32,
                byte_end: (row_start + 106) as u32,
            },
        ));
        for action in &encounter.actions {
            let byte_start = row_start + 32 + action.slot as usize * 2;
            if let Some(reference) = direct_action_reference(
                snapshot,
                encounter.identity.clone(),
                action,
                ByteProvenance {
                    native_path: "Data ED".into(),
                    record_index: encounter.native_id.0,
                    byte_start: byte_start as u32,
                    byte_end: byte_start as u32 + 2,
                },
            ) {
                references.push(reference);
            }
        }
    }
    references
}

pub(super) fn complex_encounter_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for encounter in &snapshot.complex_encounters {
        append_complex_script_references(snapshot, encounter, &mut references);
        append_complex_spells_references(snapshot, encounter, &mut references);
        append_complex_items_references(snapshot, encounter, &mut references);
        append_complex_rogue_references(snapshot, encounter, &mut references);
    }
    references
}

pub(super) fn rogue_encounter_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for encounter in &snapshot.rogue_encounters {
        append_rogue_messages_references(snapshot, encounter, &mut references);
        append_rogue_sounds_references(snapshot, encounter, &mut references);
        append_rogue_spell_references(snapshot, encounter, &mut references);
    }
    references
}

pub(super) fn timed_encounter_references(snapshot: &ProjectSnapshot) -> Vec<ReferenceDescriptor> {
    let mut references = Vec::new();
    for encounter in &snapshot.timed_encounters {
        let row_start = encounter.native_id.0 as usize * TIMED_ENCOUNTER_RECORD_BYTES;
        if encounter.day != 0 {
            let resolved = u32::try_from(encounter.door).is_ok_and(|target_id| {
                snapshot
                    .extra_action_points
                    .iter()
                    .any(|row| row.native_id.0 == target_id)
            });
            references.push(ReferenceDescriptor {
                source: encounter.identity.clone(),
                field: FieldPath("door".into()),
                target_kind: TargetKind::ExtraActionPoint,
                target_id: encounter.door.to_string(),
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
                    native_path: "Data TD3".into(),
                    record_index: encounter.native_id.0,
                    byte_start: (row_start + 6) as u32,
                    byte_end: (row_start + 8) as u32,
                }),
            });
        }
        if encounter.required_item > 0 {
            let mut reference = monster_item_reference(
                snapshot,
                encounter.identity.clone(),
                "requiredItem".into(),
                encounter.required_item,
                "Data TD3",
                encounter.native_id.0,
                row_start + 16,
            );
            reference.required = false;
            reference.repair_actions.push(RepairAction::ClearOptional);
            references.push(reference);
        }
    }
    references
}

pub(super) fn rogue_sound_reference(
    snapshot: &ProjectSnapshot,
    encounter: &RogueEncounter,
    field: String,
    sound_id: i16,
    byte_start: usize,
) -> ReferenceDescriptor {
    sound_reference(
        snapshot,
        encounter.identity.clone(),
        field,
        sound_id,
        "Data TD2",
        encounter.native_id.0,
        byte_start,
    )
}

fn append_complex_script_references(
    snapshot: &ProjectSnapshot,
    encounter: &ComplexEncounter,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = encounter.native_id.0 as usize * COMPLEX_ENCOUNTER_RECORD_BYTES;
    if encounter.prompt_message_native_id != 0 {
        references.push(optional_numeric_reference(
            snapshot,
            encounter.identity.clone(),
            "promptMessage",
            TargetKind::Message,
            i32::from(encounter.prompt_message_native_id).unsigned_abs(),
            ByteProvenance {
                native_path: "Data ED2".into(),
                record_index: encounter.native_id.0,
                byte_start: (row_start + 158) as u32,
                byte_end: (row_start + 160) as u32,
            },
        ));
    }
    for action in &encounter.actions {
        if let Some(reference) = direct_action_reference(
            snapshot,
            encounter.identity.clone(),
            action,
            ByteProvenance {
                native_path: "Data ED2".into(),
                record_index: encounter.native_id.0,
                byte_start: (row_start + 32 + action.slot as usize * 2) as u32,
                byte_end: (row_start + 34 + action.slot as usize * 2) as u32,
            },
        ) {
            references.push(reference);
        }
    }
}

fn append_complex_spells_references(
    snapshot: &ProjectSnapshot,
    encounter: &ComplexEncounter,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = encounter.native_id.0 as usize * COMPLEX_ENCOUNTER_RECORD_BYTES;
    for (slot, spell_id) in encounter.spell_ids.iter().copied().enumerate() {
        if spell_id == 0 {
            continue;
        }
        references.push(spell_reference(
            snapshot,
            encounter.identity.clone(),
            format!("spellIds[{slot}]"),
            spell_id,
            false,
            if (1..7).contains(&spell_id) {
                "Classic spell class shortcut"
            } else {
                "Classic stock spell catalog"
            },
            ByteProvenance {
                native_path: "Data ED2".into(),
                record_index: encounter.native_id.0,
                byte_start: (row_start + 106 + slot * 2) as u32,
                byte_end: (row_start + 108 + slot * 2) as u32,
            },
        ));
    }
}

fn append_complex_items_references(
    snapshot: &ProjectSnapshot,
    encounter: &ComplexEncounter,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = encounter.native_id.0 as usize * COMPLEX_ENCOUNTER_RECORD_BYTES;
    for (slot, item_id) in encounter.item_ids.iter().copied().enumerate() {
        // Item selection returns positive item IDs. Negative values are the
        // encoded result of activating a door item, not an item-record link.
        // Classic also uses 9999 as a deliberately unmatchable first-slot
        // value: it makes Use Item available while every unmatched item takes
        // result 4. It is a comparison literal, not an item definition.
        if item_id <= 0 || item_id == 9999 {
            continue;
        }
        let mut reference = monster_item_reference(
            snapshot,
            encounter.identity.clone(),
            format!("itemIds[{slot}]"),
            item_id,
            "Data ED2",
            encounter.native_id.0,
            row_start + 136 + slot * 2,
        );
        reference.required = false;
        if !reference
            .repair_actions
            .contains(&RepairAction::ClearOptional)
        {
            reference.repair_actions.push(RepairAction::ClearOptional);
        }
        references.push(reference);
    }
}

fn append_complex_rogue_references(
    snapshot: &ProjectSnapshot,
    encounter: &ComplexEncounter,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = encounter.native_id.0 as usize * COMPLEX_ENCOUNTER_RECORD_BYTES;
    if encounter.thief {
        let target_id = i32::from(encounter.thief_success);
        let target_exists = snapshot
            .rogue_encounters
            .iter()
            .any(|candidate| candidate.native_id.0 as i32 == target_id);
        references.push(ReferenceDescriptor {
            source: encounter.identity.clone(),
            field: FieldPath("thiefSuccess".into()),
            target_kind: TargetKind::RogueEncounter,
            target_id: target_id.to_string(),
            required: false,
            stock_fallback: None,
            resolution: if target_exists {
                ResolutionState::Resolved
            } else {
                ResolutionState::Missing
            },
            repair_actions: if target_exists {
                vec![RepairAction::Retarget, RepairAction::ClearOptional]
            } else {
                vec![
                    RepairAction::Retarget,
                    RepairAction::ImportTarget,
                    RepairAction::ClearOptional,
                ]
            },
            byte_provenance: Some(ByteProvenance {
                native_path: "Data ED2".into(),
                record_index: encounter.native_id.0,
                byte_start: (row_start + 155) as u32,
                byte_end: (row_start + 156) as u32,
            }),
        });
    }
}

fn append_rogue_messages_references(
    snapshot: &ProjectSnapshot,
    encounter: &RogueEncounter,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = encounter.native_id.0 as usize * ROGUE_ENCOUNTER_RECORD_BYTES;
    for (field, values, offset) in [
        ("successText", &encounter.success_text, 34usize),
        ("failureText", &encounter.failure_text, 50usize),
    ] {
        for (slot, value) in values.iter().copied().enumerate() {
            if value == 0 {
                continue;
            }
            references.push(optional_numeric_reference(
                snapshot,
                encounter.identity.clone(),
                &format!("{field}[{slot}]"),
                TargetKind::Message,
                i32::from(value).unsigned_abs(),
                ByteProvenance {
                    native_path: "Data TD2".into(),
                    record_index: encounter.native_id.0,
                    byte_start: (row_start + offset + slot * 2) as u32,
                    byte_end: (row_start + offset + slot * 2 + 2) as u32,
                },
            ));
        }
    }
    if encounter.prompts[0] != 0 {
        references.push(optional_numeric_reference(
            snapshot,
            encounter.identity.clone(),
            "prompts[0]",
            TargetKind::Message,
            i32::from(encounter.prompts[0]).unsigned_abs(),
            ByteProvenance {
                native_path: "Data TD2".into(),
                record_index: encounter.native_id.0,
                byte_start: (row_start + 106) as u32,
                byte_end: (row_start + 108) as u32,
            },
        ));
    }
}

fn append_rogue_sounds_references(
    snapshot: &ProjectSnapshot,
    encounter: &RogueEncounter,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = encounter.native_id.0 as usize * ROGUE_ENCOUNTER_RECORD_BYTES;
    for (field, values, offset) in [
        ("successSounds", &encounter.success_sounds, 66usize),
        ("failureSounds", &encounter.failure_sounds, 82usize),
    ] {
        for (slot, value) in values.iter().copied().enumerate() {
            if value != 0 {
                references.push(rogue_sound_reference(
                    snapshot,
                    encounter,
                    format!("{field}[{slot}]"),
                    value,
                    row_start + offset + slot * 2,
                ));
            }
        }
    }
    if encounter.prompts[1] != 0 {
        references.push(rogue_sound_reference(
            snapshot,
            encounter,
            "prompts[1]".into(),
            encounter.prompts[1],
            row_start + 108,
        ));
    }
    if encounter.prompt_sounds[0] != 0 {
        references.push(rogue_sound_reference(
            snapshot,
            encounter,
            "promptSounds[0]".into(),
            encounter.prompt_sounds[0],
            row_start + 112,
        ));
    }
}

fn append_rogue_spell_references(
    snapshot: &ProjectSnapshot,
    encounter: &RogueEncounter,
    references: &mut Vec<ReferenceDescriptor>,
) {
    let row_start = encounter.native_id.0 as usize * ROGUE_ENCOUNTER_RECORD_BYTES;
    if encounter.spell != 0 {
        references.push(spell_reference(
            snapshot,
            encounter.identity.clone(),
            "spell".into(),
            encounter.spell,
            false,
            "Classic stock spell catalog",
            ByteProvenance {
                native_path: "Data TD2".into(),
                record_index: encounter.native_id.0,
                byte_start: (row_start + 98) as u32,
                byte_end: (row_start + 100) as u32,
            },
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ClassicAction, NativeRecordId, SimpleEncounter, StableId};

    #[test]
    fn simple_encounter_actions_index_media_without_inventing_a_monster_set() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("encounter-links".into()));
        snapshot.simple_encounters.push(SimpleEncounter {
            identity: StableId("simple-encounter:4".into()),
            native_id: NativeRecordId(4),
            actions: vec![
                ClassicAction {
                    slot: 0,
                    raw_opcode: 9,
                    target_native_id: 700,
                },
                ClassicAction {
                    slot: 1,
                    raw_opcode: 27,
                    target_native_id: 30_000,
                },
                ClassicAction {
                    slot: 2,
                    raw_opcode: 89,
                    target_native_id: 7,
                },
            ],
            choice_results: [0; 4],
            can_back_out: false,
            max_times: 1,
            caste_success: 0,
            prompt_message_native_id: 0,
            texts: [String::new(), String::new(), String::new(), String::new()],
            authored: true,
        });

        let references = simple_encounter_references(&snapshot)
            .into_iter()
            .filter(|reference| reference.field.0.starts_with("actions["))
            .collect::<Vec<_>>();
        assert_eq!(references.len(), 2);
        assert_eq!(references[0].target_kind, TargetKind::Sound);
        assert_eq!(references[1].target_kind, TargetKind::Picture);
    }
}
