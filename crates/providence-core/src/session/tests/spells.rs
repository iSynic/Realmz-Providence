use super::*;

#[test]
fn spell_import_update_and_undo_use_revisioned_bounded_changes() {
    let source_blob = BlobId("sha256:spell-source".into());
    let annex_blob = BlobId("sha256:spell-annex".into());
    let spells = crate::codecs::decode_scenario_spells(
        &vec![0; crate::codecs::SCENARIO_SPELL_BYTES],
        Some(source_blob.clone()),
    )
    .spells;
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId("spells".into())));
    let imported = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ImportClassicSpellSlice {
                annex_blob: annex_blob.clone(),
                sources: vec![ClassicSourceBlob {
                    native_path: "Data Spell".into(),
                    blob: source_blob,
                    byte_length: crate::codecs::SCENARIO_SPELL_BYTES as u64,
                }],
                spells,
            },
        })
        .expect("import spells");
    assert_eq!(imported.revision, Revision(1));
    assert!(!imported.truncated);
    assert_eq!(imported.changed_entities_total, 106);
    assert_eq!(session.snapshot().scenario_spells.len(), 105);
    assert_eq!(
        session.snapshot().origin,
        ProjectOrigin::Imported {
            compatibility_annex: annex_blob
        }
    );

    let mut definition = session.snapshot().scenario_spells[4].definition.clone();
    definition.cost = 19;
    let changed = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(1),
            command: EditorCommand::UpdateScenarioSpell {
                record_index: 4,
                definition: Box::new(definition),
            },
        })
        .expect("update one spell");
    assert_eq!(
        changed.changed_entities,
        [StableId("classic.spell.5105".into())]
    );
    assert_eq!(session.snapshot().scenario_spells[4].definition.cost, 19);
    assert!(session.snapshot().scenario_spells[4].definition.authored);

    session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(2),
            command: EditorCommand::Undo,
        })
        .expect("undo spell update");
    assert_eq!(session.snapshot().scenario_spells[4].definition.cost, 0);
}

#[test]
fn standard_spell_import_resolves_stock_links_without_changing_project_origin() {
    let data_blob = BlobId("sha256:standard-spells".into());
    let text_blob = BlobId("sha256:standard-spell-names".into());
    let mut spells = crate::codecs::decode_standard_spells(
        &vec![0; crate::codecs::STANDARD_SPELL_BYTES],
        Some(data_blob.clone()),
    )
    .spells;
    for spell in &mut spells {
        spell.text_source_blob = Some(text_blob.clone());
    }
    let snapshot = stock_spell_user_snapshot();
    assert_eq!(
        references_for(&snapshot)
            .into_iter()
            .find(|reference| reference.target_kind == TargetKind::Spell)
            .unwrap()
            .resolution,
        ResolutionState::StockFallback
    );

    let mut session = EditorSession::new(snapshot);
    let result = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::ImportStandardSpellCatalog {
                sources: vec![
                    ClassicSourceBlob {
                        native_path: "Data S".into(),
                        blob: data_blob,
                        byte_length: crate::codecs::STANDARD_SPELL_BYTES as u64,
                    },
                    ClassicSourceBlob {
                        native_path: "Custom Names".into(),
                        blob: text_blob,
                        byte_length: 1,
                    },
                ],
                spells,
            },
        })
        .expect("import standard spells");
    assert_eq!(
        result.changed_entities_total,
        crate::codecs::STANDARD_SPELL_RECORDS
    );
    assert!(result.reference_changes_total >= 1);
    assert_eq!(session.snapshot().origin, ProjectOrigin::Authored);
    assert_eq!(session.snapshot().standard_spells.len(), 420);
    let reference = session
        .references()
        .into_iter()
        .find(|reference| reference.target_kind == TargetKind::Spell)
        .unwrap();
    assert_eq!(reference.target_id, "classic.spell.1201");
    assert_eq!(reference.resolution, ResolutionState::Resolved);
}

#[test]
fn custom_spell_references_resolve_across_monsters_and_encounters() {
    let mut snapshot = custom_spell_users_snapshot();

    let custom = references_for(&snapshot)
        .into_iter()
        .filter(|reference| reference.target_kind == TargetKind::Spell)
        .collect::<Vec<_>>();
    assert_eq!(custom.len(), 3);
    assert!(custom.iter().all(|reference| {
        reference.target_id == "classic.spell.5105"
            && reference.resolution == ResolutionState::Resolved
            && reference.stock_fallback.is_none()
    }));

    snapshot.scenario_spells.clear();
    let missing = references_for(&snapshot)
        .into_iter()
        .filter(|reference| reference.target_kind == TargetKind::Spell)
        .collect::<Vec<_>>();
    assert!(missing.iter().all(|reference| {
        reference.target_id == "5105"
            && reference.resolution == ResolutionState::Missing
            && reference.stock_fallback.is_none()
    }));

    snapshot.monster_sets[0].monsters[0].spells[0] = 1201;
    let stock = references_for(&snapshot)
        .into_iter()
        .find(|reference| {
            reference.source == StableId("monster:0:0".into()) && reference.field.0 == "spells[0]"
        })
        .expect("stock spell reference");
    assert_eq!(stock.resolution, ResolutionState::StockFallback);
    assert_eq!(
        stock.stock_fallback,
        Some("Classic stock spell catalog".into())
    );
}

fn stock_spell_user_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("standard-spells".into()));
    let mut monsters = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    monsters.monsters[0].spells[0] = 1201;
    snapshot.monster_sets.push(monsters);
    snapshot
}

fn custom_spell_users_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("spell-links".into()));
    snapshot.scenario_spells =
        crate::codecs::decode_scenario_spells(&vec![0; crate::codecs::SCENARIO_SPELL_BYTES], None)
            .spells;

    let mut monsters = crate::codecs::decode_monster_set(
        &vec![0; crate::codecs::MONSTER_RECORD_BYTES],
        "Data MD",
        0,
    );
    monsters.monsters[0].spells[0] = 5105;
    snapshot.monster_sets.push(monsters);

    let mut complex = crate::codecs::decode_complex_encounters(&vec![
        0;
        crate::codecs::COMPLEX_ENCOUNTER_RECORD_BYTES
    ])
    .records
    .remove(0);
    complex.spell_ids[0] = 5105;
    snapshot.complex_encounters.push(complex);

    let mut rogue =
        crate::codecs::decode_rogue_encounters(&[0; crate::codecs::ROGUE_ENCOUNTER_RECORD_BYTES])
            .records
            .remove(0);
    rogue.spell = 5105;
    snapshot.rogue_encounters.push(rogue);

    snapshot
}
