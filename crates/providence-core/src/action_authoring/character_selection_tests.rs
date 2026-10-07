use super::*;
use crate::model::{ProjectSnapshot, SourcedCasteRule, SourcedRaceRule, StableId};

fn snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("character-selection".into()));
    snapshot.race_rules.push(
        serde_json::from_value::<SourcedRaceRule>(serde_json::json!({
            "source": "Data Race", "sourceBlob": null,
            "definition": {
                "id": "classic.race.7", "classicId": 7, "name": "Dwarf",
                "description": "Stout mountain folk", "eligibleCasteIds": [],
                "hitModifiers": [], "abilityBonuses": [], "saveBonuses": [],
                "attributeBonuses": [], "attributeLimits": [], "conditionLevels": [],
                "ageRanges": [], "ageChanges": [], "maximumAge": 0,
                "doesNotDie": false, "baseMovement": 0, "magicResistance": 0,
                "twoHandBonus": 0, "missileBonus": 0, "baseAttacks": 0,
                "maximumAttacks": 0, "canRegenerate": false, "defaultIconSet": 0,
                "itemCategoryMasks": [], "descriptorFlags": 0
            }
        }))
        .unwrap(),
    );
    snapshot.caste_rules.push(
        serde_json::from_value::<SourcedCasteRule>(serde_json::json!({
            "source": "Data Caste", "sourceBlob": null,
            "definition": {
                "id": "classic.caste.4", "classicId": 4, "name": "Archer",
                "description": "Missile specialist", "eligibleRaceIds": [],
                "initialAbilityValues": [], "levelAbilityDice": [], "victoryThresholds": [],
                "saveBonuses": [], "attributeBonuses": [], "attributeLimits": [],
                "conditionLevels": [], "staminaDice": [], "strengthValues": [],
                "dodgeValues": [], "toHitValues": [], "missileValues": [],
                "handToHandValues": [], "spellcasterRows": [], "attackLevels": [],
                "startingItemIds": [], "casteClass": 3, "minimumAgeGroup": 0,
                "movementBonus": 0, "magicResistanceMultiplier": 0, "twoHandBonus": 0,
                "maximumStaminaBonus": 0, "bonusAttacks": 0, "maximumAttacks": 0,
                "startMoney": 0, "canUseMissile": true, "getsMissileBonus": true,
                "defaultIcon": 0, "itemCategoryMasks": []
            }
        }))
        .unwrap(),
    );
    snapshot
}

fn query(selector: i16, gender: i16, value: i16) -> ActionFormDescribeQuery {
    ActionFormDescribeQuery {
        action_identity: "realmz.action.50".into(),
        target_native_id: 12,
        values: decode_form_values(
            "race-caste-gender-selector",
            [selector, gender, value, -317, 33],
        )
        .unwrap(),
        secondary_values: Default::default(),
        context: Default::default(),
    }
}

#[test]
fn property_modes_expose_only_the_relevant_named_control() {
    let snapshot = snapshot();
    for (mode, active, label, target, choice_count) in [
        (
            0,
            "raceCasteOrClass",
            "Race",
            Some(ActionTargetKind::Race),
            0,
        ),
        (1, "gender", "Gender To Pick", None, 2),
        (
            2,
            "raceCasteOrClass",
            "Caste",
            Some(ActionTargetKind::Caste),
            0,
        ),
        (3, "raceCasteOrClass", "Race Class", None, 9),
        (4, "raceCasteOrClass", "Caste Class", None, 7),
    ] {
        let values = if mode == 0 {
            7
        } else if mode == 2 {
            4
        } else {
            1
        };
        let description = describe_action_form(&snapshot, &query(mode, 1, values)).unwrap();
        let control = &description.authoring.controls[0];
        assert_eq!(control.label, "Property");
        assert_eq!(control.value, mode);
        assert_eq!(control.active_fields, [active]);
        let field = description
            .fields
            .iter()
            .find(|field| field.key == active)
            .unwrap();
        assert_eq!(field.label, label);
        assert_eq!(field.target_kind, target);
        assert_eq!(field.choices.len(), choice_count);
        assert_eq!(
            field.control,
            if target.is_some() {
                FormControl::Target
            } else {
                FormControl::Choice
            }
        );
        assert_character_selection_summary(mode, &description);
    }
}

fn assert_character_selection_summary(mode: i16, description: &ActionFormDescription) {
    assert!(description.summary.starts_with("Replace selection with "));
    let property = match mode {
        0 => "Race:",
        1 => "Gender:",
        2 => "Caste:",
        3 => "Race class:",
        4 => "Caste class:",
        _ => unreachable!(),
    };
    assert!(description.summary.contains(property));
    if mode != 1 {
        assert!(!description.summary.contains("Gender To Pick"));
    }
}

#[test]
fn race_and_caste_modes_resolve_exact_rules_but_classes_never_become_links() {
    let snapshot = snapshot();
    let race = describe_action_form(&snapshot, &query(0, 2, 7)).unwrap();
    let race_value = &race.fields[2];
    assert_eq!(
        race_value.preview.as_ref().unwrap().identity.0,
        "classic.race.7"
    );
    assert_eq!(
        settings_target_fields(50, [0, 2, 7, -317, 33], false)[0].kind,
        ActionTargetKind::Race
    );
    let caste = describe_action_form(&snapshot, &query(2, 2, 4)).unwrap();
    assert_eq!(
        caste.fields[2].preview.as_ref().unwrap().identity.0,
        "classic.caste.4"
    );
    for mode in [3, 4] {
        let class = describe_action_form(&snapshot, &query(mode, 2, 4)).unwrap();
        assert!(class.fields[2].target_kind.is_none() && class.fields[2].preview.is_none());
        assert!(settings_target_fields(50, [mode, 2, 4, -317, 33], false).is_empty());
    }
}

#[test]
fn mode_changes_retain_inactive_values_and_unknown_imports() {
    let snapshot = snapshot();
    let mut draft = query(0, 2, 7);
    draft
        .context
        .authoring
        .modes
        .insert("characterProperty".into(), 1);
    draft
        .context
        .authoring
        .selections
        .insert("gender".into(), 1);
    let gender = describe_action_form(&snapshot, &draft).unwrap();
    assert_eq!(gender.authoring.resolved_values["selector"], 1);
    assert_eq!(gender.authoring.resolved_values["gender"], 1);
    assert_eq!(gender.authoring.resolved_values["raceCasteOrClass"], 7);
    draft
        .context
        .authoring
        .modes
        .insert("characterProperty".into(), 0);
    draft
        .context
        .authoring
        .selections
        .insert("raceCasteOrClass".into(), 7);
    let race = describe_action_form(&snapshot, &draft).unwrap();
    assert_eq!(race.authoring.resolved_values["gender"], 2);
    assert_eq!(race.authoring.resolved_values["raceCasteOrClass"], 7);

    let unknown = describe_action_form(&snapshot, &query(99, -8, -300)).unwrap();
    assert!(unknown.authoring.controls[0].active_fields.is_empty());
    assert!(
        unknown.authoring.controls[0]
            .display
            .contains("not understood")
    );
    assert_eq!(
        unknown.authoring.resolved_values,
        query(99, -8, -300).values
    );
}

#[test]
fn explicit_mode_changes_require_a_valid_active_choice_but_untouched_imports_remain_preservable() {
    let snapshot = snapshot();
    let untouched = describe_action_form(&snapshot, &query(0, 2, 99)).unwrap();
    assert!(untouched.authoring.errors.is_empty());

    for (mode, value, phrase) in [
        (0, 99, "race"),
        (1, 7, "gender"),
        (2, 99, "caste"),
        (3, 10, "race class"),
        (4, 8, "caste class"),
    ] {
        let mut draft = query(0, value, value);
        draft
            .context
            .authoring
            .modes
            .insert("characterProperty".into(), mode);
        let description = describe_action_form(&snapshot, &draft).unwrap();
        assert_eq!(description.authoring.errors.len(), 1);
        assert!(description.authoring.errors[0].contains(phrase));
    }

    let mut valid = query(3, 2, 7);
    valid
        .context
        .authoring
        .modes
        .insert("characterProperty".into(), 0);
    assert!(
        describe_action_form(&snapshot, &valid)
            .unwrap()
            .authoring
            .errors
            .is_empty()
    );
}

#[test]
fn zero_group_only_caste_and_misc_presence_values_are_explicit_non_links() {
    assert!(settings_target_fields(53, [0, 2, 0, 0, 0], false).is_empty());
    assert_eq!(
        settings_target_fields(53, [4, 2, 0, 0, 0], false)[0].kind,
        ActionTargetKind::Caste
    );
    assert!(settings_target_fields(86, [0, 0, 0, 0, 0], false).is_empty());
    assert_eq!(
        settings_target_fields(86, [0, -4, 0, 0, 0], false)[0].kind,
        ActionTargetKind::Caste
    );
    assert_eq!(
        settings_target_fields(86, [1, -7, 0, 0, 0], false)[0].kind,
        ActionTargetKind::Race
    );
}

#[test]
fn unnamed_classic_rules_still_have_author_facing_picker_labels() {
    let mut snapshot = snapshot();
    snapshot.race_rules[0].definition.name.clear();
    snapshot.race_rules[0].definition.description.clear();
    snapshot.caste_rules[0].definition.name.clear();
    snapshot.caste_rules[0].definition.description.clear();

    let race = target_preview(
        &snapshot,
        ActionTargetKind::Race,
        7,
        &ActionTargetContext::default(),
    )
    .unwrap();
    assert_eq!(race.label, "Race 7");
    assert_eq!(race.detail, "Data Race record 7");

    let caste = target_preview(
        &snapshot,
        ActionTargetKind::Caste,
        4,
        &ActionTargetContext::default(),
    )
    .unwrap();
    assert_eq!(caste.label, "Caste 4");
    assert_eq!(caste.detail, "Data Caste record 4");
}
