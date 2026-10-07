use super::*;
use crate::{
    codecs::{
        SCENARIO_SPELL_BYTES, STANDARD_SPELL_BYTES, decode_scenario_spells, decode_standard_spells,
    },
    rebuilt::{
        RebuiltV3ApplicationHooks, RebuiltV3ClassicInstruction, RebuiltV3InstructionKind,
        RebuiltV3ProgramOwnerKind, RebuiltV3ScenarioProgram, item_rule_fixture,
        scenario_item_rule_fixture,
    },
};

mod fixtures;
use fixtures::*;

#[test]
fn selected_custom_item_closure_follows_curse_and_spell_dependencies_only() {
    let mut snapshot = snapshot();
    snapshot.scenario_item_rules[0].definition.cursed_item_id =
        Some(StableId("classic.item.801".into()));
    snapshot.scenario_item_rules[1].definition.special[1] = 5101;
    snapshot.scenario_item_rules[1].definition.cursed_item_id =
        Some(StableId("classic.item.800".into()));
    snapshot.scenario_item_rules[199].definition.id = StableId("malformed-unreachable".into());
    snapshot.scenario_spells[104].definition.name.clear();

    let first = select_programs(&snapshot, &scenario(800)).expect("selected closure");
    let second = select_programs(&snapshot, &scenario(800)).expect("repeat selected closure");

    assert_eq!(first, second);
    assert_eq!(first.portable_standard_item_count, 799);
    assert_eq!(first.portable_standard_spell_count, 420);
    assert_eq!(first.reachable_scenario_item_ids, [800, 801]);
    assert_eq!(first.reachable_scenario_spell_ids, [5101]);
    assert_eq!(first.items.len(), 801);
    assert_eq!(first.spells.len(), 421);
    assert!(first.references.iter().any(|reference| {
        reference.source.0 == "classic.item.800"
            && reference.field_path == "cursedItemId"
            && reference.target_id.0 == "classic.item.801"
    }));
    assert!(first.references.iter().any(|reference| {
        reference.source.0 == "classic.item.801"
            && reference.field_path == "special[1]"
            && reference.target_id.0 == "classic.spell.5101"
    }));
}

#[test]
fn sorted_missing_roots_precede_standard_item_effect_errors() {
    let mut snapshot = snapshot();
    snapshot
        .scenario_item_rules
        .retain(|item| !matches!(item.definition.classic_id, 800 | 801));
    snapshot.item_rules[0].definition.special[1] = 5103;
    snapshot.scenario_spells.clear();
    let mut document = scenario(801);
    document.programs[0].id = StableId("xap:2".into());
    document.programs[0].owner_id = StableId("extra-action-point:2".into());
    document.programs.extend(scenario(800).programs);

    assert!(matches!(select_programs(&snapshot, &document),
        Err(RebuiltV3ReachableItemSpellError::MissingDefinition {
            source, classic_id: 800, target_kind: RebuiltV3RuntimeDefinitionKind::Item, ..
        }) if source.0 == "xap:1"
    ));
}

#[test]
fn selected_missing_custom_spell_is_a_hard_error() {
    let mut snapshot = snapshot();
    snapshot.scenario_item_rules[0].definition.special[1] = 5101;
    snapshot.scenario_spells.clear();

    assert!(matches!(
        select_programs(&snapshot, &scenario(800)),
        Err(RebuiltV3ReachableItemSpellError::MissingDefinition {
            source,
            field_path,
            target_kind: RebuiltV3RuntimeDefinitionKind::Spell,
            classic_id: 5101,
        }) if source.0 == "classic.item.800" && field_path == "special[1]"
    ));
}

#[test]
fn imported_missing_item_and_spell_operands_are_preserved_as_references() {
    let mut snapshot = snapshot();
    snapshot.origin = crate::model::ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    let mut scenario = scenario(0);
    scenario.programs[0]
        .instructions
        .push(RebuiltV3ClassicInstruction {
            kind: RebuiltV3InstructionKind::ClassicAction,
            slot: 1,
            raw_opcode: 17,
            opcode: 17,
            id: 2,
            gosub: false,
            extra_code: Some(vec![1, 0, 0, 0, 0]),
        });

    let selection = select_programs(&snapshot, &scenario)
        .expect("imported unavailable definitions are deferred");
    assert!(selection.references.iter().any(|reference| {
        reference.target_kind == RebuiltV3RuntimeDefinitionKind::Item
            && reference.classic_id == 0
            && reference.field_path == "actions[0].extraCode[0]"
    }));
    assert!(selection.references.iter().any(|reference| {
        reference.target_kind == RebuiltV3RuntimeDefinitionKind::Spell
            && reference.classic_id == 1
            && reference.field_path == "actions[1].extraCode[0]"
    }));
    assert!(!selection.items.iter().any(|item| item.classic_id == 0));
    assert!(!selection.spells.iter().any(|spell| spell.classic_id == 1));
}

#[test]
fn item_closure_defers_unavailable_spell_effects_only_for_imports() {
    let mut imported = snapshot();
    imported.origin = crate::model::ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    imported.scenario_spells.clear();
    imported.item_rules[0].definition.special[1] = 5103;

    let selection =
        select_programs(&imported, &scenario(800)).expect("unavailable imported spell is deferred");
    assert!(selection.references.iter().any(|reference| {
        reference.source.0 == "classic.item.1"
            && reference.field_path == "special[1]"
            && reference.classic_id == 5103
    }));
    assert!(
        !selection
            .spells
            .iter()
            .any(|spell| spell.classic_id == 5103)
    );
    assert!(!selection.reachable_scenario_spell_ids.contains(&5103));

    let mut authored = snapshot();
    authored.scenario_spells.clear();
    authored.item_rules[0].definition.special[1] = 5103;
    assert!(matches!(
        select_programs(&authored, &scenario(800)),
        Err(RebuiltV3ReachableItemSpellError::MissingDefinition {
            source,
            field_path,
            classic_id: 5103,
            ..
        }) if source.0 == "classic.item.1" && field_path == "special[1]"
    ));
}

#[test]
fn imported_excessive_random_item_count_does_not_block_export() {
    let mut snapshot = snapshot();
    let mut scenario = scenario(800);
    let instruction = &mut scenario.programs[0].instructions[0];
    instruction.raw_opcode = 65;
    instruction.opcode = 65;
    instruction.extra_code = Some(vec![50, 1, 2, 0, 0]);
    assert!(matches!(
        select_programs(&snapshot, &scenario),
        Err(RebuiltV3ReachableItemSpellError::InvalidRandomItemCount { count: 50, .. })
    ));
    snapshot.origin = crate::model::ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    select_programs(&snapshot, &scenario)
        .expect("native operands remain intact for consumer-time failure");
    assert_eq!(
        scenario.programs[0].instructions[0]
            .extra_code
            .as_ref()
            .unwrap()[0],
        50
    );
}

#[test]
fn complex_comparison_literals_only_select_definition_domain_ids() {
    let selection = project_rebuilt_v3_reachable_items_and_spells(
        &snapshot(),
        &scenario(1),
        &[complex_encounter_with_comparison_literals()],
        &[],
        &owners(),
        &combat(),
    )
    .expect("comparison-only sentinels do not require definitions");

    assert_eq!(selection.reachable_scenario_item_ids, [800]);
    assert_eq!(selection.reachable_scenario_spell_ids, [5101]);
    assert!(
        selection
            .references
            .iter()
            .all(|reference| !matches!(reference.classic_id, 1000 | 1100 | 9999 | 6))
    );
}
