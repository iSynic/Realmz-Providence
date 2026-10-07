use super::*;
use crate::model::{BlobId, ExtraCodeRow, NativeRecordId, ProjectOrigin};

mod fixtures;
use fixtures::{action, runtime_snapshot};

#[test]
fn selection_is_exact_deterministic_and_preserves_unreachable_invalid_sources() {
    let snapshot = runtime_snapshot();
    let source = snapshot.clone();
    let first = project_rebuilt_v3_reachable_runtime(&snapshot).expect("runtime selection");
    let second = project_rebuilt_v3_reachable_runtime(&snapshot).expect("repeat selection");

    assert_eq!(first, second);
    assert_eq!(snapshot, source);
    assert_eq!(first.reachable_simple_encounter_ids, vec![2]);
    assert_eq!(first.reachable_complex_encounter_ids, vec![7]);
    assert_eq!(first.reachable_rogue_encounter_ids, vec![6]);
    assert_eq!(first.reachable_message_ids, vec![1]);
    assert_eq!(first.reachable_treasure_ids, vec![3]);
    assert_eq!(first.reachable_shop_ids, vec![4]);
    assert_eq!(
        first.messages,
        [RebuiltV3Message {
            id: 1,
            text: "Choose a road.".into()
        }]
    );
    assert_eq!(first.message_references.len(), 2);
    assert_eq!(first.catalog_references.len(), 2);
    assert_eq!(first.item_spells.portable_standard_item_count, 799);
    assert_eq!(first.item_spells.portable_standard_spell_count, 420);
    assert!(first.item_spells.reachable_scenario_item_ids.is_empty());
    assert!(first.item_spells.reachable_scenario_spell_ids.is_empty());
    assert_eq!(first.timed_encounters.len(), 1);
    assert_eq!(first.excluded_timed_encounter_ids, vec![1]);
    assert_eq!(first.treasures.len(), 1);
    assert_eq!(first.shops.len(), 1);
    assert_eq!(first.simple_encounters.len(), 1);
    assert_eq!(first.complex_encounters.len(), 1);
    assert_eq!(first.rogue_encounters.len(), 1);
    assert_eq!(first.scenario.programs.len(), 9);
    for result in 0..4 {
        assert!(
            first
                .scenario
                .programs
                .iter()
                .any(|program| program.id.0 == format!("complex:7:result:{result}"))
        );
    }
    assert!(
        first
            .scenario
            .programs
            .iter()
            .all(|program| program.id != StableId("xap:99".into()))
    );
    assert_eq!(
        serde_json::to_vec(&first).expect("serialize selection"),
        serde_json::to_vec(&second).expect("repeat serialization")
    );
    assert!(super::super::project_rebuilt_v3_scenario(&snapshot).is_err());
}

#[test]
fn selection_refuses_a_missing_transitive_program_before_emission() {
    let mut snapshot = runtime_snapshot();
    snapshot
        .extra_action_points
        .retain(|row| row.native_id.0 != 6);
    snapshot.extra_action_points[0]
        .actions
        .push(action(6, 44, 4));

    let error = project_rebuilt_v3_reachable_runtime(&snapshot).expect_err("missing reachable XAP");
    assert!(matches!(
        error,
        RebuiltV3ReachableRuntimeError::Combat(
            RebuiltV3ReachableCombatError::UnresolvedReferences(_)
        )
    ));
}

#[test]
fn imported_selection_preserves_callers_and_defers_missing_optional_targets() {
    let mut snapshot = runtime_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.messages.clear();
    snapshot.shops.clear();
    snapshot
        .extra_action_points
        .retain(|row| row.native_id.0 != 6);

    let selection = project_rebuilt_v3_reachable_runtime(&snapshot)
        .expect("imported missing optional targets are deferred");

    assert!(selection.messages.is_empty());
    assert!(selection.shops.is_empty());
    assert!(
        selection
            .scenario
            .programs
            .iter()
            .flat_map(|program| &program.instructions)
            .any(|instruction| instruction.opcode == 6 && instruction.id == -4)
    );
    assert!(
        selection.deferred_references.iter().any(|reference| {
            reference.target_kind == "program" && reference.target_id == "xap:6"
        })
    );
    assert!(
        selection
            .deferred_references
            .iter()
            .any(|reference| { reference.target_kind == "message" && reference.target_id == "1" })
    );
    assert!(
        selection
            .deferred_references
            .iter()
            .any(|reference| { reference.target_kind == "shop" && reference.target_id == "4" })
    );
}

#[test]
fn imported_opcode_92_preserves_the_instruction_and_defers_only_its_missing_map() {
    let mut snapshot = runtime_snapshot();
    snapshot.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    snapshot.extra_action_points[0].actions = vec![action(0, 92, 100)];
    snapshot.extra_codes.extend([
        ExtraCodeRow {
            native_id: NativeRecordId(100),
            values: [3, 1, 0, 0, 0],
        },
        ExtraCodeRow {
            native_id: NativeRecordId(101),
            values: [7, 7, 8, 8, 0],
        },
    ]);

    let selection = project_rebuilt_v3_reachable_runtime(&snapshot)
        .expect("an imported missing opcode 92 map is deferred");

    assert_eq!(selection.scenario.programs[0].instructions[0].opcode, 92);
    assert!(selection.deferred_references.iter().any(|reference| {
        reference.source == StableId("xap:1".into())
            && reference.field == "actions[0].extraCode[0]"
            && reference.target_kind == "land-map"
            && reference.target_id == "3"
    }));
}

#[test]
fn selection_refuses_opcode_44_outside_an_encounter_result_context() {
    let mut snapshot = runtime_snapshot();
    snapshot.extra_action_points[0].actions = vec![action(0, 44, 4)];
    snapshot.messages.clear();

    let error = project_rebuilt_v3_reachable_runtime(&snapshot)
        .expect_err("Action Point opcode 44 is context-unsafe");
    assert_eq!(
        error,
        RebuiltV3ReachableRuntimeError::Scenario(
            RebuiltV3ScenarioError::InvalidEncounterResultOpcode {
                program: StableId("xap:1".into()),
                slot: 0,
                result: 4,
            }
        )
    );
}

#[test]
fn selection_preserves_opcode_44_in_a_simple_result_context() {
    let mut snapshot = runtime_snapshot();
    snapshot.simple_encounters[0].actions = vec![action(0, 44, 4)];

    let selection = project_rebuilt_v3_reachable_runtime(&snapshot)
        .expect("authored Simple Encounter opcode 44 is preserved");
    let program = selection
        .scenario
        .programs
        .iter()
        .find(|program| program.id == StableId("simple:2:result:0".into()))
        .expect("Simple result program");
    assert_eq!(program.instructions[0].opcode, 44);
    assert_eq!(program.instructions[0].id, 4);
}

#[test]
fn selection_emits_only_reachable_text_and_same_id_style_assets() {
    let mut snapshot = runtime_snapshot();
    snapshot.extra_action_points[0]
        .actions
        .push(action(2, 62, -200));
    for (kind, resource_type, id) in [
        ("text-resource", "TEXT", -200),
        ("text-style-resource", "styl", -200),
        ("text-resource", "TEXT", -201),
    ] {
        snapshot
            .assets
            .push(fixtures::text_asset(kind, resource_type, id));
    }

    let selection = project_rebuilt_v3_reachable_runtime(&snapshot).expect("selection");
    assert_eq!(selection.reachable_text_resource_ids, [-200]);
    assert_eq!(selection.reachable_style_resource_ids, [-200]);
    assert_eq!(selection.assets.assets.len(), 2);
    assert!(
        selection
            .assets
            .assets
            .iter()
            .all(|asset| asset.resource_id == Some(-200))
    );
}
