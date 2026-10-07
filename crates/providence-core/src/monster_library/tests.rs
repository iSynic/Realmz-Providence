use super::*;
use crate::codecs::MONSTER_RECORD_BYTES;
use crate::{
    model::{NativeRecordId, StableId},
    session::{ExpectedRevisionCommand, Revision},
};

fn scrapbook_row(name: &str, description: &str, hit_dice: u8) -> Vec<u8> {
    let mut row = vec![0; MONSTER_SCRAPBOOK_RECORD_BYTES];
    row[0] = hit_dice;
    row[170..170 + name.len()].copy_from_slice(name.as_bytes());
    row[MONSTER_RECORD_BYTES] = description.len() as u8;
    row[MONSTER_RECORD_BYTES + 1..MONSTER_RECORD_BYTES + 1 + description.len()]
        .copy_from_slice(description.as_bytes());
    row
}

fn library_with_redo() -> (MonsterLibrarySession, DecodedMonsterScrapbook) {
    let decoded = decode_monster_scrapbook(
        &scrapbook_row("Bell Keeper", "Built in.", 8),
        "Monster Scrap Book",
        "donor-commit",
        "Divinity Data/Monster Scrap Book",
    );
    let mut session = MonsterLibrarySession::new(MonsterLibraryCatalog::new(StableId(
        "monster-library:failure".into(),
    )))
    .unwrap();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: MonsterLibraryCommand::ImportBuiltIns {
                source: decoded.source.clone(),
                entries: decoded.entries.clone(),
            },
        })
        .unwrap();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: MonsterLibraryCommand::Undo,
        })
        .unwrap();
    (session, decoded)
}

#[test]
fn failed_library_commands_preserve_identity_allocation_and_redo() {
    let (mut session, decoded) = library_with_redo();
    let before = session.persisted_state();
    let result = session.execute(ExpectedRevisionCommand {
        expected_revision: session.revision(),
        command: MonsterLibraryCommand::CreateCustom {
            label: String::new(),
            preferred_scenario_monster_id: NativeRecordId(42),
            template: Box::new(decoded.entries[0].template.clone()),
            description: String::new(),
            origin: MonsterLibraryOrigin::Blank,
        },
    });
    assert!(matches!(
        result,
        Err(MonsterLibraryError::InvalidCatalog(_))
    ));
    assert_eq!(session.persisted_state(), before);
}

#[test]
fn failed_library_commands_preserve_catalog_after_import_validation() {
    let (mut session, mut decoded) = library_with_redo();
    let before = session.persisted_state();
    decoded.source.record_bytes = 0;
    let result = session.execute(ExpectedRevisionCommand {
        expected_revision: session.revision(),
        command: MonsterLibraryCommand::ImportBuiltIns {
            source: decoded.source,
            entries: decoded.entries,
        },
    });
    assert!(matches!(
        result,
        Err(MonsterLibraryError::InvalidCatalog(_))
    ));
    assert_eq!(session.persisted_state(), before);
}

#[test]
fn decodes_466_byte_scrapbook_rows_with_attributable_source() {
    let mut bytes = scrapbook_row("Bell Keeper", "Guards the western bell.", 8);
    bytes.extend_from_slice(&[0xaa, 0xbb]);
    let decoded = decode_monster_scrapbook(
        &bytes,
        "Monster Scrap Book",
        "donor-commit",
        "Divinity Data/Monster Scrap Book",
    );
    assert_eq!(decoded.source.record_bytes, 466);
    assert_eq!(decoded.source.record_count, 1);
    assert_eq!(decoded.source.trailing_bytes, 2);
    assert_eq!(decoded.entries[0].label, "Bell Keeper");
    assert_eq!(decoded.entries[0].description, "Guards the western bell.");
    assert_eq!(decoded.entries[0].template.hit_dice, 8);
    assert_eq!(
        decoded.entries[0].ownership,
        MonsterLibraryOwnership::BuiltIn
    );
}

#[test]
fn protects_builtins_and_restores_them_by_removing_only_the_override() {
    let decoded = decode_monster_scrapbook(
        &scrapbook_row("Bell Keeper", "Built in.", 8),
        "Monster Scrap Book",
        "donor-commit",
        "Divinity Data/Monster Scrap Book",
    );
    let source = decoded.entries[0].identity.clone();
    let mut session = MonsterLibrarySession::new(MonsterLibraryCatalog::new(StableId(
        "monster-library:test".into(),
    )))
    .unwrap();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: MonsterLibraryCommand::ImportBuiltIns {
                source: decoded.source,
                entries: decoded.entries,
            },
        })
        .unwrap();
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: MonsterLibraryCommand::CustomizeBuiltIn {
                source: source.clone(),
                label: Some("Bell Keeper Custom".into()),
            },
        })
        .unwrap();
    assert_eq!(session.catalog().built_ins.len(), 1);
    assert_eq!(session.catalog().custom_entries.len(), 1);
    assert_eq!(
        session.catalog().effective_entries()[0].label,
        "Bell Keeper Custom"
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: MonsterLibraryCommand::RestoreBuiltIn {
                source: source.clone(),
            },
        })
        .unwrap();
    assert_eq!(session.catalog().built_ins[0].identity, source);
    assert!(session.catalog().custom_entries.is_empty());
    assert_eq!(
        session.catalog().effective_entries()[0].label,
        "Bell Keeper"
    );
}

#[test]
fn custom_mutations_are_revisioned_and_undoable() {
    let decoded = decode_monster_scrapbook(
        &scrapbook_row("Bell Keeper", "Built in.", 8),
        "Monster Scrap Book",
        "donor-commit",
        "Divinity Data/Monster Scrap Book",
    );
    let template = decoded.entries[0].template.clone();
    let mut session = MonsterLibrarySession::new(MonsterLibraryCatalog::new(StableId(
        "monster-library:test".into(),
    )))
    .unwrap();
    let created = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: MonsterLibraryCommand::CreateCustom {
                label: "Scenario Bell Keeper".into(),
                preferred_scenario_monster_id: NativeRecordId(42),
                template: Box::new(template),
                description: "Reusable custom monster.".into(),
                origin: MonsterLibraryOrigin::Blank,
            },
        })
        .unwrap();
    assert_eq!(created.revision, Revision(1));
    assert_eq!(session.catalog().custom_entries.len(), 1);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: MonsterLibraryCommand::Undo,
        })
        .unwrap();
    assert!(session.catalog().custom_entries.is_empty());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: MonsterLibraryCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.catalog().custom_entries.len(), 1);
}
