use super::*;
use providence_core::session::spell_authoring::{SpellRecordDraft, new_scenario_spell};

#[test]
fn spell_compound_checkpoint_only_replaces_its_family_and_reopens_exactly() {
    let temporary = tempfile::tempdir().unwrap();
    let initial = snapshot("Spell checkpoint");
    let store = ProjectStore::create(temporary.path(), &initial).unwrap();
    let mut session = EditorSession::new(initial);
    let mut draft = session
        .allocate_scenario_spell(None, Some(104))
        .unwrap()
        .draft;
    draft.definition.name = "  Café  ".into();
    draft.definition.cost = 40;
    for index in 0..3 {
        if index == 1 {
            draft.allocation = None;
            draft.definition.description = "Editor note".into();
            draft.definition.sound_start = 1;
        } else if index == 2 {
            draft = SpellRecordDraft {
                record_index: 104,
                definition: new_scenario_spell(104).unwrap(),
                allocation: None,
                copy_source: None,
            };
        }
        assert_family_checkpoint(&store, &mut session, draft.clone());
    }
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    store
        .checkpoint_session(&session, &json!({"method": "history.undo"}))
        .unwrap();
    assert_eq!(
        session.snapshot().scenario_spells[104].definition.name,
        "  Café  "
    );
    fs::remove_file(store.local_database_path()).unwrap();
    let (_, reopened) = ProjectStore::open(temporary.path()).unwrap();
    assert_eq!(reopened, *session.snapshot());
}

fn assert_family_checkpoint(
    store: &ProjectStore,
    session: &mut EditorSession,
    draft: SpellRecordDraft,
) {
    let before = manifest(store);
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::ApplyScenarioSpellDraft {
                draft: Box::new(draft),
            },
        })
        .unwrap();
    store
        .checkpoint_session(session, &json!({"method": "spell.draft.apply"}))
        .unwrap();
    let after = manifest(store);
    let changes = SNAPSHOT_SEGMENTS
        .iter()
        .filter(|name| before.segments.get(**name) != after.segments.get(**name))
        .copied()
        .collect::<Vec<_>>();
    assert_eq!(changes, ["scenarioSpells"]);
    assert_eq!(
        ProjectStore::load_snapshot_file(store.snapshot_path()).unwrap(),
        *session.snapshot()
    );
}

fn manifest(store: &ProjectStore) -> PortableSnapshotManifest {
    store
        .portable_snapshot_manifest(&fs::read(store.snapshot_path()).unwrap())
        .unwrap()
        .unwrap()
}
