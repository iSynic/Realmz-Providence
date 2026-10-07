use super::*;
use crate::model::ProjectSnapshot;
use crate::session::{EditorCommand, ExpectedRevisionCommand, Revision};

fn fresh() -> EditorSession {
    EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "spell-authoring".into(),
    )))
}

#[test]
fn untouched_divinity_spell_labels_are_vacant_without_normalizing_imports() {
    let bytes = vec![0; SCENARIO_SPELL_BYTES];
    let mut snapshot = fresh().snapshot().clone();
    snapshot.scenario_spells = decode_scenario_spells(&bytes, None).spells;
    for row in &mut snapshot.scenario_spells {
        let index = row.definition.record_index;
        row.definition.name = format!("Level {} Spell {}", index / 15 + 1, index % 15 + 1);
    }
    let original = snapshot.clone();
    let session = EditorSession::new(snapshot);
    let allocation = session.allocate_scenario_spell(Some(&bytes), None).unwrap();
    assert_eq!(allocation.available_slots, 105);
    assert_eq!(allocation.draft.record_index, 0);
    assert_eq!(session.snapshot(), &original);
    assert_eq!(session.revision(), Revision(0));

    let mut snapshot = original.clone();
    snapshot.scenario_spells[0].name_authored = true;
    snapshot.scenario_spells[1].definition.authored = true;
    snapshot.scenario_spells[2].definition.name = "Real named spell".into();
    snapshot.scenario_spells[3].definition.cost = 1;
    snapshot.scenario_spells[4].definition.description = "An author's note".into();
    snapshot.scenario_spells[5].definition.name = "Level 1 Spell 7".into();
    let mut encounter = crate::codecs::decode_complex_encounters(&[0; 520])
        .records
        .remove(0);
    encounter.spell_ids[0] = 5107;
    snapshot.complex_encounters.push(encounter);
    let session = EditorSession::new(snapshot);
    let allocation = session.allocate_scenario_spell(Some(&bytes), None).unwrap();
    assert_eq!(allocation.available_slots, 98);
    assert_eq!(allocation.draft.record_index, 7);
    let mut residue = bytes.clone();
    residue[7 * SPELL_RECORD_BYTES + 6] = 1;
    assert!(
        session
            .allocate_scenario_spell(Some(&residue), Some(7))
            .is_err()
    );
}

fn apply(session: &mut EditorSession, draft: SpellRecordDraft) -> Result<(), SessionError> {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::ApplyScenarioSpellDraft {
                draft: Box::new(draft),
            },
        })
        .map(|_| ())
}

#[test]
fn spell_allocation_does_not_write_and_apply_history_owns_the_complete_fresh_table() {
    let mut session = fresh();
    let mut allocation = session.allocate_scenario_spell(None, Some(104)).unwrap();
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().scenario_spells.is_empty());
    assert_eq!(allocation.available_slots, 105);
    allocation.draft.definition.name = "Last Slot".into();
    allocation.draft.definition.to_hit_bonus = -128;
    allocation.draft.definition.cost = 255;
    apply(&mut session, allocation.draft.clone()).unwrap();
    assert_eq!(session.snapshot().scenario_spells.len(), 105);
    assert_eq!(
        session.snapshot().scenario_spells[104]
            .definition
            .classic_id,
        5715
    );
    assert_eq!(
        session.snapshot().scenario_spells[104]
            .definition
            .to_hit_bonus,
        -128
    );
    assert!(session.allocate_scenario_spell(None, Some(104)).is_err());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert!(session.snapshot().scenario_spells.is_empty());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(
        session.snapshot().scenario_spells[104].definition.name,
        "Last Slot"
    );
}

#[test]
fn spell_draft_failures_leave_revision_and_content_unchanged() {
    let mut session = fresh();
    let mut draft = session
        .allocate_scenario_spell(None, Some(0))
        .unwrap()
        .draft;
    draft.definition.name = "x".repeat(256);
    assert!(apply(&mut session, draft.clone()).is_err());
    draft.definition.name = "🌙".into();
    assert!(apply(&mut session, draft.clone()).is_err());
    draft.definition = new_scenario_spell(1).unwrap();
    assert!(apply(&mut session, draft).is_err());
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().scenario_spells.is_empty());
}

#[test]
fn spell_allocation_rejects_stale_destination_and_raw_imported_residue() {
    let mut session = fresh();
    let draft = session
        .allocate_scenario_spell(None, Some(0))
        .unwrap()
        .draft;
    let mut first = draft.clone();
    first.definition.name = "Occupied".into();
    apply(&mut session, first).unwrap();
    assert!(apply(&mut session, draft).is_err());
    let mut bytes = vec![0; SCENARIO_SPELL_BYTES];
    bytes[SPELL_RECORD_BYTES + 6] = 7;
    assert!(
        session
            .allocate_scenario_spell(Some(&bytes), Some(1))
            .is_err()
    );
    assert!(
        session
            .allocate_scenario_spell(Some(&bytes[..30]), Some(2))
            .is_err()
    );
}

#[test]
fn spell_mechanic_edit_preserves_typed_references_but_presentation_and_clear_invalidate() {
    let mut session = fresh();
    let mut draft = session
        .allocate_scenario_spell(None, Some(0))
        .unwrap()
        .draft;
    draft.definition.name = "Named spell".into();
    apply(&mut session, draft).unwrap();
    let references = session.references();
    let mut definition = session.snapshot().scenario_spells[0].definition.clone();
    definition.cost = 20;
    definition.name = "Renamed spell".into();
    definition.description = "New editor note".into();
    let changed = apply_definition(&mut session, definition.clone());
    assert!(changed.references_unchanged);
    assert_eq!(session.references(), references);
    assert_eq!(
        session.diagnostics(),
        crate::session::diagnostics::diagnostics_for(session.snapshot())
    );
    definition.look_start = 1;
    let changed = session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::UpdateScenarioSpell {
                record_index: 0,
                definition: Box::new(definition),
            },
        })
        .unwrap();
    assert!(!changed.references_unchanged);
    assert_ne!(session.references(), references);
    let changed = apply_definition(&mut session, new_scenario_spell(0).unwrap());
    assert!(!changed.references_unchanged);
    assert!(session.references().is_empty());
}

fn apply_definition(
    session: &mut EditorSession,
    definition: SpellDefinition,
) -> crate::session::ChangeProjection {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::ApplyScenarioSpellDraft {
                draft: Box::new(SpellRecordDraft {
                    record_index: definition.record_index,
                    definition,
                    allocation: None,
                    copy_source: None,
                }),
            },
        })
        .unwrap()
}

#[test]
fn spell_allocation_never_overwrites_a_full_native_range() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("full-spells".into()));
    snapshot.scenario_spells = (0..SCENARIO_SPELL_RECORDS as u16)
        .map(|index| {
            let mut definition = new_scenario_spell(index).unwrap();
            definition.name = format!("Occupied {index}");
            crate::model::SourcedSpellDefinition {
                source: "Data Spell".into(),
                definition,
                source_blob: None,
                text_source_blob: None,
                name_authored: true,
            }
        })
        .collect();
    let session = EditorSession::new(snapshot);
    let before = session.snapshot().clone();
    assert!(session.allocate_scenario_spell(None, None).is_err());
    assert!(session.allocate_scenario_spell(None, Some(104)).is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), Revision(0));
}

#[test]
fn clearing_a_spell_is_atomic_and_undo_restores_the_definition() {
    let mut session = fresh();
    let mut draft = session
        .allocate_scenario_spell(None, Some(0))
        .unwrap()
        .draft;
    draft.definition.name = "Created Spell".into();
    apply(&mut session, draft).unwrap();
    let clear = SpellRecordDraft {
        record_index: 0,
        definition: new_scenario_spell(0).unwrap(),
        allocation: None,
        copy_source: None,
    };
    apply(&mut session, clear).unwrap();
    assert!(session.allocate_scenario_spell(None, Some(0)).is_ok());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(
        session.snapshot().scenario_spells[0].definition.name,
        "Created Spell"
    );
}

#[test]
fn spell_authoring_rejects_reversed_ranges_and_out_of_grid_queue_without_writing() {
    let mut session = fresh();
    let mut draft = session
        .allocate_scenario_spell(None, Some(0))
        .unwrap()
        .draft;
    draft.definition.damage_min = 9;
    draft.definition.damage_max = 2;
    draft.definition.queue_icon = 201;
    let issues = session.spell_draft_issues(&draft);
    assert!(
        issues
            .iter()
            .any(|issue| issue.contains("Low must not exceed High"))
    );
    assert!(issues.iter().any(|issue| issue.contains("0–200")));
    assert!(apply(&mut session, draft.clone()).is_err());
    assert_eq!(session.revision(), Revision(0));
    draft.definition.damage_min = 2;
    draft.definition.damage_max = 9;
    draft.definition.queue_icon = 200;
    apply(&mut session, draft).unwrap();
    assert_eq!(
        session.snapshot().scenario_spells[0].definition.queue_icon,
        200
    );
}

#[test]
fn unrelated_imported_spell_edits_preserve_malformed_range_and_queue_values() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("imported-spell".into()));
    snapshot.origin = crate::model::ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId("sha256:fixture".into()),
    };
    let mut bytes = vec![0; SCENARIO_SPELL_BYTES];
    bytes[2] = 255;
    bytes[11] = 9;
    bytes[12] = 2;
    snapshot.scenario_spells = decode_scenario_spells(&bytes, None).spells;
    let mut session = EditorSession::new(snapshot);
    let mut draft = SpellRecordDraft {
        record_index: 0,
        definition: session.snapshot().scenario_spells[0].definition.clone(),
        allocation: None,
        copy_source: None,
    };
    draft.definition.cost = 12;
    apply(&mut session, draft.clone()).unwrap();
    assert_eq!(
        session.snapshot().scenario_spells[0].definition.queue_icon,
        255
    );
    assert_eq!(
        session.snapshot().scenario_spells[0].definition.damage_min,
        9
    );
    draft.definition.damage_min = 10;
    assert!(apply(&mut session, draft).is_err());
}
