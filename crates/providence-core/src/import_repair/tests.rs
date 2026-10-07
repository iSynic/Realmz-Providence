use super::*;
use crate::model::ClassicSourceBlob;
use crate::model::{BlobId, ProjectOrigin, ProjectSnapshot, StableId};
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

fn fixture() -> (ProjectSnapshot, BTreeMap<String, Vec<u8>>) {
    // Geometry from Castle Data Spell: 105 numeric records, 30 bytes each.
    let mut bytes = vec![0; crate::codecs::SCENARIO_SPELL_BYTES + 7];
    bytes[0] = 241;
    bytes[crate::codecs::SCENARIO_SPELL_BYTES..].fill(0xa5);
    let blob = BlobId(format!("sha256:{:x}", Sha256::digest(&bytes)));
    let mut snapshot = ProjectSnapshot::new_authored(StableId("repair-fixture".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: blob.clone(),
    };
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data Spell".into(),
        blob,
        byte_length: bytes.len() as u64,
    });
    (snapshot, BTreeMap::from([("Data Spell".into(), bytes)]))
}

fn command(assessment: RepairAssessment) -> RepairCommand {
    RepairCommand {
        expected_source_identity: assessment.source_identity,
        expected_previous_version: assessment.previous_version,
        changes: assessment.entries,
    }
}

#[test]
fn missing_names_recover_numeric_records_as_one_undoable_command() {
    let (snapshot, files) = fixture();
    let assessment = assess(&snapshot, &files).unwrap();
    assert_eq!(assessment.entries.len(), 105);
    assert!(assessment.entries.iter().all(|entry| !entry.conflict));
    let original = snapshot.clone();
    let mut session = EditorSession::new(snapshot);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::RepairImportedContent(command(assessment)),
        })
        .unwrap();
    assert_eq!(
        session.snapshot().scenario_spells[0].definition.range_min,
        241
    );
    assert_eq!(
        session.snapshot().import_interpretation_version,
        INTERPRETATION_VERSION
    );
    assert_eq!(session.undo_history().len(), 1);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert_eq!(session.snapshot(), &original);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot().scenario_spells.len(), 105);
    assert_eq!(assess(session.snapshot(), &files).unwrap().entries.len(), 0);
    let encoded = crate::codecs::encode_scenario_spells(
        &session.snapshot().scenario_spells,
        Some(&files["Data Spell"]),
    )
    .unwrap();
    assert_eq!(encoded, files["Data Spell"]);
}

#[test]
fn incomplete_sources_and_changed_source_bytes_do_not_invent_recovery() {
    let (snapshot, mut files) = fixture();
    assert!(
        assess(&snapshot, &BTreeMap::new())
            .unwrap()
            .entries
            .is_empty()
    );
    assert_eq!(
        assess(&snapshot, &BTreeMap::new())
            .unwrap()
            .source_requirements
            .len(),
        1
    );
    files.get_mut("Data Spell").unwrap()[0] ^= 1;
    assert!(assess(&snapshot, &files).is_err());
}

#[test]
fn changed_destination_rejects_entire_repair_without_partial_mutation() {
    let (mut snapshot, files) = fixture();
    let assessment = assess(&snapshot, &files).unwrap();
    let RepairChange::Spell { record } = &assessment.entries[100].change else {
        panic!("spell");
    };
    snapshot.scenario_spells.push(*record.clone());
    snapshot.scenario_spells[0].definition.range_min = 73;
    let before = snapshot.clone();
    assert!(apply(&mut snapshot, command(assessment)).is_err());
    assert_eq!(snapshot, before);
    assert!(assess(&snapshot, &files).unwrap().entries.is_empty());
}

#[test]
fn interpretation_and_source_identity_are_guarded() {
    let (mut snapshot, files) = fixture();
    let mut stale = command(assess(&snapshot, &files).unwrap());
    stale.expected_source_identity = "0".repeat(64);
    let before = snapshot.clone();
    assert!(apply(&mut snapshot, stale).is_err());
    assert_eq!(snapshot, before);
    let assessment = assess(&snapshot, &files).unwrap();
    snapshot.import_interpretation_version = 1;
    let before = snapshot.clone();
    assert!(apply(&mut snapshot, command(assessment)).is_err());
    assert_eq!(snapshot, before);
}
