use super::*;
use crate::codecs::{decode_caste_rules, decode_race_rules, read_caste_native_fields};
use crate::model::{BlobId, ClassicSourceBlob, ProjectOrigin};
use crate::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};
mod eligibility;

struct Fixture {
    race: Vec<u8>,
    caste: Vec<u8>,
    names: RuleNameCatalog,
}
impl Fixture {
    fn new() -> Self {
        Self {
            race: vec![0; RACE_RECORD_BYTES * 30 + 5],
            caste: vec![0; CASTE_RECORD_BYTES * 30 + 3],
            names: RuleNameCatalog {
                source: "Data Files/Custom Names.rsrc".into(),
                source_blob: BlobId(digest(b"controlled names")),
                race_resource_id: 129,
                caste_resource_id: 131,
                race_names: (1..=30).map(|id| format!("Stock Race {id}")).collect(),
                caste_names: (1..=30).map(|id| format!("Stock Caste {id}")).collect(),
            },
        }
    }
    fn baseline(&self) -> RuleAuthoringBaseline<'_> {
        RuleAuthoringBaseline {
            race: &self.race,
            caste: &self.caste,
            names: &self.names,
            fingerprint: "controlled-library",
        }
    }
    fn sources(&self) -> RuleAuthoringSources<'_> {
        RuleAuthoringSources {
            race: &self.race,
            caste: &self.caste,
        }
    }
}

fn fresh() -> EditorSession {
    EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "rule-authoring".into(),
    )))
}

#[test]
fn cached_rule_vacancy_and_preparation_revalidate_after_authored_callers_change() {
    let fixture = Fixture::new();
    let mut session = fresh();
    for kind in [RuleKind::Race, RuleKind::Caste] {
        assert_eq!(
            session
                .vacant_rule_ids(kind, &fixture.sources(), &fixture.baseline())
                .unwrap(),
            vacant_rule_ids(
                session.snapshot(),
                kind,
                &fixture.sources(),
                &fixture.baseline()
            )
            .unwrap()
        );
    }
    let draft = caste_draft(session.snapshot(), &fixture);
    let prepared = session
        .prepare_rule_draft(&draft, &fixture.sources(), &fixture.baseline())
        .unwrap();
    let sources = RuleAuthoringSources {
        race: &prepared.race_bytes,
        caste: &prepared.caste_bytes,
    };
    apply(&mut session, prepared.commit.clone()).unwrap();
    assert!(
        !session
            .vacant_rule_ids(RuleKind::Caste, &sources, &fixture.baseline())
            .unwrap()
            .contains(&21)
    );
    assert!(
        session
            .prepare_rule_draft(&draft, &sources, &fixture.baseline())
            .is_err()
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert!(
        session
            .vacant_rule_ids(RuleKind::Caste, &fixture.sources(), &fixture.baseline())
            .unwrap()
            .contains(&21)
    );
    assert!(
        session
            .prepare_rule_draft(&draft, &fixture.sources(), &fixture.baseline())
            .is_ok()
    );
}

#[test]
fn bounded_catalog_ownership_matches_single_record_guards() {
    let fixture = Fixture::new();
    let mut session = fresh();
    let draft = caste_draft(session.snapshot(), &fixture);
    let prepared = prepare_rule_draft(
        session.snapshot(),
        &draft,
        &fixture.sources(),
        &fixture.baseline(),
    )
    .unwrap();
    let race = prepared.race_bytes.clone();
    let caste = prepared.caste_bytes.clone();
    apply(&mut session, prepared.commit).unwrap();
    let sources = RuleAuthoringSources {
        race: &race,
        caste: &caste,
    };
    for kind in [RuleKind::Race, RuleKind::Caste] {
        let catalog =
            rule_catalog_ownership(session.snapshot(), kind, &sources, &fixture.baseline())
                .unwrap();
        for id in 1..=30 {
            assert_eq!(
                catalog[usize::from(id - 1)],
                rule_ownership(session.snapshot(), kind, id, &sources, &fixture.baseline())
                    .unwrap()
            );
        }
    }
}

#[test]
fn imported_caste_does_not_claim_application_race_permission_bytes() {
    let mut fixture = Fixture::new();
    fixture.race[19 * RACE_RECORD_BYTES + 208] = 1;
    let mut snapshot = fresh().snapshot().clone();
    snapshot.race_rules = decode_race_rules(&fixture.race, None).rules;
    snapshot.caste_rules = decode_caste_rules(&fixture.caste, None).rules;
    crate::codecs::derive_caste_eligibility(&snapshot.race_rules, &mut snapshot.caste_rules)
        .unwrap();
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data Caste".into(),
        blob: BlobId(digest(&fixture.caste)),
        byte_length: fixture.caste.len() as u64,
    });
    assert!(
        vacant_rule_ids(
            &snapshot,
            RuleKind::Race,
            &fixture.sources(),
            &fixture.baseline()
        )
        .unwrap()
        .contains(&20)
    );
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data Race".into(),
        blob: BlobId(digest(&fixture.race)),
        byte_length: fixture.race.len() as u64,
    });
    assert!(
        !vacant_rule_ids(
            &snapshot,
            RuleKind::Race,
            &fixture.sources(),
            &fixture.baseline()
        )
        .unwrap()
        .contains(&20)
    );
}

#[test]
fn reciprocal_permission_changes_do_not_allocate_unused_stock_custom_races() {
    let mut fixture = Fixture::new();
    for row in fixture.race[..RACE_RECORD_BYTES * 30].chunks_exact_mut(RACE_RECORD_BYTES) {
        row[208 + 20] = 1;
    }
    let mut session = fresh();
    let draft = caste_draft(session.snapshot(), &fixture);
    let prepared = prepare_rule_draft(
        session.snapshot(),
        &draft,
        &fixture.sources(),
        &fixture.baseline(),
    )
    .unwrap();
    let race = prepared.race_bytes.clone();
    let caste = prepared.caste_bytes.clone();
    apply(&mut session, prepared.commit).unwrap();
    let sources = RuleAuthoringSources {
        race: &race,
        caste: &caste,
    };
    assert!(
        session.snapshot().race_rules[19]
            .source
            .contains("eligibility record")
    );
    assert_eq!(
        rule_ownership(
            session.snapshot(),
            RuleKind::Race,
            20,
            &sources,
            &fixture.baseline()
        )
        .unwrap(),
        RuleOwnership::Vacant
    );
    assert!(
        vacant_rule_ids(
            session.snapshot(),
            RuleKind::Race,
            &sources,
            &fixture.baseline()
        )
        .unwrap()
        .contains(&20)
    );
}

#[test]
fn copies_preserve_unchanged_malformed_ranges_but_reject_new_invalid_pairs() {
    let mut fixture = Fixture::new();
    fixture.race[72..76].copy_from_slice(&[0, 10, 0, 2]);
    let session = fresh();
    let mut edit = RuleEdit::Race {
        definition: decode_race_rules(&fixture.race, None).rules[0]
            .definition
            .clone(),
    };
    retarget_rule_edit(&mut edit, 20).unwrap();
    let RuleEdit::Race { definition } = &mut edit else {
        unreachable!()
    };
    definition.name = "Retained copy".into();
    let mut draft = RuleRecordDraft {
        edit,
        expected_family_hash: rule_family_hash(session.snapshot()),
        allocation: true,
        copy_source: Some(
            rule_copy_guard(
                session.snapshot(),
                RuleKind::Race,
                1,
                "stock",
                &fixture.baseline(),
            )
            .unwrap(),
        ),
    };
    assert!(
        prepare_rule_draft(
            session.snapshot(),
            &draft,
            &fixture.sources(),
            &fixture.baseline()
        )
        .is_ok()
    );
    let RuleEdit::Race { definition } = &mut draft.edit else {
        unreachable!()
    };
    definition.attribute_limits[0] = 11;
    assert!(
        prepare_rule_draft(
            session.snapshot(),
            &draft,
            &fixture.sources(),
            &fixture.baseline()
        )
        .err()
        .unwrap()
        .contains("minimum")
    );
}

#[test]
fn rule_draft_is_bound_to_document_and_copy_family() {
    let fixture = Fixture::new();
    let session = fresh();
    let mut draft = caste_draft(session.snapshot(), &fixture);
    let another = ProjectSnapshot::new_authored(StableId("another-document".into()));
    assert!(prepare_rule_draft(&another, &draft, &fixture.sources(), &fixture.baseline()).is_err());
    draft.copy_source = Some(
        rule_copy_guard(
            session.snapshot(),
            RuleKind::Race,
            1,
            "stock",
            &fixture.baseline(),
        )
        .unwrap(),
    );
    assert!(
        prepare_rule_draft(
            session.snapshot(),
            &draft,
            &fixture.sources(),
            &fixture.baseline()
        )
        .is_err()
    );
}

#[test]
fn reviewed_rule_allocations_preserve_occupied_custom_rows() {
    let fixture = Fixture::new();
    let mut session = fresh();
    assert_eq!(
        vacant_rule_ids(
            session.snapshot(),
            RuleKind::Caste,
            &fixture.sources(),
            &fixture.baseline()
        )
        .unwrap(),
        (21..=30).collect::<Vec<_>>()
    );
    let draft = caste_draft(session.snapshot(), &fixture);
    let prepared = prepare_rule_draft(
        session.snapshot(),
        &draft,
        &fixture.sources(),
        &fixture.baseline(),
    )
    .unwrap();
    let sources = RuleAuthoringSources {
        race: &prepared.race_bytes,
        caste: &prepared.caste_bytes,
    };
    apply(&mut session, prepared.commit).unwrap();
    assert!(
        !vacant_rule_ids(
            session.snapshot(),
            RuleKind::Caste,
            &sources,
            &fixture.baseline()
        )
        .unwrap()
        .contains(&21)
    );
}
fn apply(
    session: &mut EditorSession,
    commit: PreparedRuleCommit,
) -> Result<(), crate::session::SessionError> {
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::ApplyRuleRecordDraft(Box::new(commit)),
        })
        .map(|_| ())
}
fn caste_draft(snapshot: &ProjectSnapshot, fixture: &Fixture) -> RuleRecordDraft {
    let mut definition = decode_caste_rules(&fixture.caste, None).rules[20]
        .definition
        .clone();
    definition.name = "Wayfinder".into();
    definition.description = "A project note".into();
    definition.eligible_race_ids = vec![StableId("classic.race.1".into())];
    let mut native_fields = read_caste_native_fields(&fixture.caste, 21).unwrap();
    native_fields.maximum_spells_per_round = 3;
    RuleRecordDraft {
        edit: RuleEdit::Caste {
            definition: Box::new(definition),
            native_fields,
        },
        expected_family_hash: rule_family_hash(snapshot),
        allocation: true,
        copy_source: None,
    }
}

#[test]
fn caste_draft_commits_name_native_source_and_reciprocal_flags_in_one_history_entry() {
    let fixture = Fixture::new();
    let mut session = fresh();
    let draft = caste_draft(session.snapshot(), &fixture);
    let prepared = prepare_rule_draft(
        session.snapshot(),
        &draft,
        &fixture.sources(),
        &fixture.baseline(),
    )
    .unwrap();
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().caste_rules.is_empty());
    assert_eq!(
        read_caste_native_fields(&prepared.caste_bytes, 21)
            .unwrap()
            .maximum_spells_per_round,
        3
    );
    assert_eq!(prepared.race_bytes[208 + 20], 1);
    assert_eq!(&prepared.race_bytes[30 * 408..], &fixture.race[30 * 408..]);
    let expected = prepared.commit.clone();
    apply(&mut session, prepared.commit).unwrap();
    assert_eq!(session.revision(), Revision(1));
    assert_eq!(
        session.snapshot().caste_rules[20].definition.name,
        "Wayfinder"
    );
    assert_eq!(
        session.snapshot().caste_rules[20]
            .definition
            .eligible_race_ids,
        [StableId("classic.race.1".into())]
    );
    assert_eq!(
        session.snapshot().rule_names.as_ref().unwrap().caste_names[20],
        "Wayfinder"
    );
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Undo,
        })
        .unwrap();
    assert!(session.snapshot().race_rules.is_empty());
    assert!(session.snapshot().rule_names.is_none());
    session
        .execute(ExpectedRevisionCommand {
            expected_revision: session.revision(),
            command: EditorCommand::Redo,
        })
        .unwrap();
    assert_eq!(session.snapshot().caste_rules, expected.castes);
    assert_eq!(session.snapshot().race_rules, expected.races);
}

#[test]
fn stale_preparation_and_occupied_allocation_cannot_overwrite_another_rule() {
    let fixture = Fixture::new();
    let mut session = fresh();
    let draft = caste_draft(session.snapshot(), &fixture);
    let first = prepare_rule_draft(
        session.snapshot(),
        &draft,
        &fixture.sources(),
        &fixture.baseline(),
    )
    .unwrap();
    let stale = first.commit.clone();
    apply(&mut session, first.commit).unwrap();
    let before = session.snapshot().clone();
    let revision = session.revision();
    assert!(apply(&mut session, stale).is_err());
    assert_eq!(session.snapshot(), &before);
    assert_eq!(session.revision(), revision);
    let mut occupied = draft.clone();
    occupied.expected_family_hash = rule_family_hash(session.snapshot());
    assert!(
        prepare_rule_draft(
            session.snapshot(),
            &occupied,
            &fixture.sources(),
            &fixture.baseline()
        )
        .is_err()
    );
}

#[test]
fn ownership_protects_stock_from_direct_replacement() {
    let fixture = Fixture::new();
    let session = fresh();
    assert_eq!(
        rule_ownership(
            session.snapshot(),
            RuleKind::Race,
            1,
            &fixture.sources(),
            &fixture.baseline()
        )
        .unwrap(),
        RuleOwnership::Stock
    );
    assert_eq!(
        rule_ownership(
            session.snapshot(),
            RuleKind::Race,
            20,
            &fixture.sources(),
            &fixture.baseline()
        )
        .unwrap(),
        RuleOwnership::Vacant
    );
    let mut definition = decode_race_rules(&fixture.race, None).rules[0]
        .definition
        .clone();
    definition.name = "Replacement Human".into();
    let draft = RuleRecordDraft {
        edit: RuleEdit::Race { definition },
        expected_family_hash: rule_family_hash(session.snapshot()),
        allocation: false,
        copy_source: None,
    };
    assert!(
        prepare_rule_draft(
            session.snapshot(),
            &draft,
            &fixture.sources(),
            &fixture.baseline()
        )
        .is_err()
    );
}

#[test]
fn retained_native_residue_is_never_a_vacant_slot() {
    let fixture = Fixture::new();
    let session = fresh();
    let mut race = fixture.race.clone();
    race[19 * 408 + 346] = 7;
    let sources = RuleAuthoringSources {
        race: &race,
        caste: &fixture.caste,
    };
    assert_eq!(
        rule_ownership(
            session.snapshot(),
            RuleKind::Race,
            20,
            &sources,
            &fixture.baseline()
        )
        .unwrap(),
        RuleOwnership::Scenario
    );
}

#[test]
fn explicit_imported_standard_range_source_remains_scenario_owned_even_when_equal_to_stock() {
    let fixture = Fixture::new();
    let mut snapshot = ProjectSnapshot::new_authored(StableId("imported-rule".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(digest(b"controlled annex")),
    };
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data Caste".into(),
        blob: BlobId(digest(&fixture.caste)),
        byte_length: fixture.caste.len() as u64,
    });
    snapshot.caste_rules =
        decode_caste_rules(&fixture.caste, Some(BlobId(digest(&fixture.caste)))).rules;
    assert_eq!(
        rule_ownership(
            &snapshot,
            RuleKind::Caste,
            1,
            &fixture.sources(),
            &fixture.baseline()
        )
        .unwrap(),
        RuleOwnership::Scenario
    );
}

#[test]
fn rejected_native_and_asymmetric_commands_preserve_the_session() {
    let fixture = Fixture::new();
    let mut session = fresh();
    let mut draft = caste_draft(session.snapshot(), &fixture);
    if let RuleEdit::Caste { native_fields, .. } = &mut draft.edit {
        native_fields.maximum_spells_per_round = 32768;
    }
    assert!(
        prepare_rule_draft(
            session.snapshot(),
            &draft,
            &fixture.sources(),
            &fixture.baseline()
        )
        .is_err()
    );
    let draft = caste_draft(session.snapshot(), &fixture);
    let mut commit = prepare_rule_draft(
        session.snapshot(),
        &draft,
        &fixture.sources(),
        &fixture.baseline(),
    )
    .unwrap()
    .commit;
    commit.castes[20].definition.eligible_race_ids.clear();
    assert!(apply(&mut session, commit).is_err());
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().race_rules.is_empty());
}
