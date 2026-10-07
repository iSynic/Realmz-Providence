use super::*;

#[test]
fn new_permissions_reject_vacant_targets_in_both_editors() {
    let fixture = Fixture::new();
    let session = fresh();
    for kind in [RuleKind::Race, RuleKind::Caste] {
        let mut edit = empty_rule_edit(kind, kind.custom_start()).unwrap();
        match &mut edit {
            RuleEdit::Race { definition } => {
                definition.eligible_caste_ids = vec![RuleKind::Caste.identity(21)]
            }
            RuleEdit::Caste { definition, .. } => {
                definition.eligible_race_ids = vec![RuleKind::Race.identity(20)]
            }
        }
        let draft = RuleRecordDraft {
            edit,
            expected_family_hash: rule_family_hash(session.snapshot()),
            allocation: true,
            copy_source: None,
        };
        let error = prepare_rule_draft(
            session.snapshot(),
            &draft,
            &fixture.sources(),
            &fixture.baseline(),
        )
        .err()
        .unwrap();
        assert!(error.contains("empty slot"), "{error}");
    }
}

#[test]
fn existing_stock_copy_permission_is_preserved_and_can_be_removed() {
    let mut fixture = Fixture::new();
    fixture.race[208 + 20] = 255; // Retained stock Race 1 permits an otherwise vacant Caste 21.
    let session = fresh();
    let copy = rule_copy_guard(
        session.snapshot(),
        RuleKind::Race,
        1,
        "stock",
        &fixture.baseline(),
    )
    .unwrap();
    let mut edit = RuleEdit::Race {
        definition: decode_race_rules(&fixture.race, None).rules[0]
            .definition
            .clone(),
    };
    retarget_rule_edit(&mut edit, 20).unwrap();
    if let RuleEdit::Race { definition } = &mut edit {
        definition.name = "Copied Race".into();
    }
    let mut draft = RuleRecordDraft {
        edit,
        expected_family_hash: rule_family_hash(session.snapshot()),
        allocation: true,
        copy_source: Some(copy),
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
    definition.eligible_caste_ids.clear();
    assert!(
        prepare_rule_draft(
            session.snapshot(),
            &draft,
            &fixture.sources(),
            &fixture.baseline()
        )
        .is_ok()
    );
}

#[test]
fn actual_allocation_enables_new_permission_without_allocating_other_slots() {
    let fixture = Fixture::new();
    let mut session = fresh();
    let prepared = prepare_rule_draft(
        session.snapshot(),
        &caste_draft(session.snapshot(), &fixture),
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
    let mut edit = empty_rule_edit(RuleKind::Race, 20).unwrap();
    let RuleEdit::Race { definition } = &mut edit else {
        unreachable!()
    };
    definition.eligible_caste_ids = vec![RuleKind::Caste.identity(21)];
    let draft = RuleRecordDraft {
        edit,
        expected_family_hash: rule_family_hash(session.snapshot()),
        allocation: true,
        copy_source: None,
    };
    assert!(prepare_rule_draft(session.snapshot(), &draft, &sources, &fixture.baseline()).is_ok());
}

#[test]
fn empty_stock_slot_cannot_be_forged_as_a_copy_source() {
    let fixture = Fixture::new();
    let session = fresh();
    let copy = rule_copy_guard(
        session.snapshot(),
        RuleKind::Race,
        30,
        "stock",
        &fixture.baseline(),
    )
    .unwrap();
    let draft = RuleRecordDraft {
        edit: empty_rule_edit(RuleKind::Race, 20).unwrap(),
        expected_family_hash: rule_family_hash(session.snapshot()),
        allocation: true,
        copy_source: Some(copy),
    };
    assert!(
        prepare_rule_draft(
            session.snapshot(),
            &draft,
            &fixture.sources(),
            &fixture.baseline()
        )
        .err()
        .unwrap()
        .contains("not a copy source")
    );
}
