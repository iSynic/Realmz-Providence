use super::*;
use crate::{
    codecs::*,
    rebuilt::{RebuiltV3DeferredDisposition, item_rule_fixture},
};

#[test]
fn imported_missing_text_keeps_the_caller_requested_id_and_source_diagnostic() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("missing-text".into()));
    snapshot.item_rules = (1..=799).map(item_rule_fixture).collect();
    snapshot.standard_spells = decode_standard_spells(&vec![0; STANDARD_SPELL_BYTES], None).spells;
    let mut source = vec![0; EXTRA_ACTION_POINT_RECORD_BYTES];
    source[8..10].copy_from_slice(&62_i16.to_be_bytes());
    source[24..26].copy_from_slice(&153_i16.to_be_bytes());
    snapshot.extra_action_points = decode_extra_action_points(&source).records;
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: crate::model::ScenarioApplicationHooks {
            start_game: Some(StableId("extra-action-point:0".into())),
            ..Default::default()
        },
    });
    assert!(project_rebuilt_v3_runtime(&snapshot).is_err());
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let original = snapshot.clone();
    let selected = project_rebuilt_v3_runtime(&snapshot).unwrap();
    assert_eq!(selected.reachable_text_resource_ids, [153]);
    assert!(selected.assets.assets.is_empty());
    let program = selected
        .scenario
        .programs
        .iter()
        .find(|program| program.id.0 == "xap:0")
        .unwrap();
    assert_eq!(
        (program.instructions[0].opcode, program.instructions[0].id),
        (62, 153)
    );
    assert!(
        selected
            .deferred_references
            .iter()
            .any(|reference| reference.target_kind == "TEXT" && reference.target_id == "153")
    );
    assert_eq!(snapshot, original);
}

#[test]
fn imported_runtime_keeps_missing_extra_code_callers_and_explicit_deferred_diagnostics() {
    for opcode in [17_i16, 18, 21, 22, 38, 48, 51, 52, 65, 67, 73] {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("missing-extra-code".into()));
        snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
        };
        snapshot.scenario_application = Some(Default::default());
        snapshot.item_rules = (1..=799).map(item_rule_fixture).collect();
        snapshot.standard_spells =
            decode_standard_spells(&vec![0; STANDARD_SPELL_BYTES], None).spells;
        let mut source = vec![0; EXTRA_ACTION_POINT_RECORD_BYTES];
        source[8..10].copy_from_slice(&opcode.to_be_bytes());
        source[24..26].copy_from_slice(&32766_i16.to_be_bytes());
        snapshot.extra_action_points = decode_extra_action_points(&source).records;
        let original = snapshot.clone();
        let selected = project_rebuilt_v3_runtime(&snapshot).unwrap();
        let program = selected
            .scenario
            .programs
            .iter()
            .find(|program| program.id.0 == "xap:0")
            .unwrap();
        assert_eq!(
            (program.instructions[0].opcode, program.instructions[0].id),
            (opcode, 32766)
        );
        assert!(program.instructions[0].extra_code.is_none());
        assert!(selected.catalog_references.is_empty());
        assert!(selected.item_spells.references.is_empty());
        assert!(
            selected
                .deferred_references
                .iter()
                .any(|reference| reference.target_kind == "extra-code"
                    && reference.target_id == "32766")
        );
        assert_eq!(snapshot, original);
        assert_eq!(
            encode_extra_action_points(&snapshot.extra_action_points, Some(&source)).unwrap(),
            source
        );
    }
}

#[test]
fn imported_stock_of_shops_no_program_opens_is_dormant() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("dormant-shops".into()));
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.item_rules = (1..=799).map(item_rule_fixture).collect();
    snapshot.standard_spells = decode_standard_spells(&vec![0; STANDARD_SPELL_BYTES], None).spells;
    let mut shops = vec![0; SHOP_RECORD_BYTES * 3];
    for shop in [1, 2] {
        shops[shop * SHOP_RECORD_BYTES..][..2].copy_from_slice(&8224_i16.to_be_bytes());
    }
    snapshot.shops = decode_shops(&shops).records;
    let mut program = vec![0; EXTRA_ACTION_POINT_RECORD_BYTES];
    program[8..10].copy_from_slice(&6_i16.to_be_bytes());
    program[24..26].copy_from_slice(&1_i16.to_be_bytes());
    snapshot.extra_action_points = decode_extra_action_points(&program).records;
    snapshot.scenario_application = Some(crate::model::ScenarioApplicationContract {
        hooks: crate::model::ScenarioApplicationHooks {
            start_game: Some(StableId("extra-action-point:0".into())),
            ..Default::default()
        },
    });
    let selected = project_rebuilt_v3_runtime(&snapshot).unwrap();
    let stock = selected
        .deferred_references
        .iter()
        .filter(|reference| reference.field == "stock[0].itemId")
        .map(|reference| (reference.source.0.as_str(), reference.disposition))
        .collect::<Vec<_>>();
    assert_eq!(
        stock,
        [
            ("classic.shop.1", RebuiltV3DeferredDisposition::Deferred),
            ("classic.shop.2", RebuiltV3DeferredDisposition::Dormant),
        ]
    );
}
