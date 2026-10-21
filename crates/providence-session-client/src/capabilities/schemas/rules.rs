//! Native rule forms expose authored fields, never Sourced* provenance wrappers.
use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "rule.catalog" => vec![
            ("kind", kind()),
            (
                "source",
                choices(&["authoring", "selected", "scenario", "application"]),
            ),
            ("scope", choices(&["all", "stock", "scenario", "vacant"])),
        ],
        "rule.open-authoring" => vec![
            ("kind", kind()),
            ("classicId", integer(1, 30)),
            (
                "source",
                choices(&["authoring", "selected", "scenario", "application"]),
            ),
        ],
        "rule.clear.review" | "rule.used-by" => {
            vec![("kind", kind()), ("classicId", integer(1, 30))]
        }
        "rule.allocation.review" => vec![
            ("kind", kind()),
            ("destinationClassicId", integer(1, 30)),
            ("copySource", nullable(copy_guard())),
        ],
        "rule.draft.prepare" | "rule.draft.apply" => vec![("draft", draft())],
        _ => vec![],
    }
}

fn kind() -> Value {
    choices(&["race", "caste"])
}

fn copy_guard() -> Value {
    object(
        json!({"kind":kind(),"classicId":integer(1,30),"scope":choices(&["stock","scenario"]),
        "definitionHash":identity(),"libraryFingerprint":identity()}),
        &[],
    )
}

fn draft() -> Value {
    let race = object(
        json!({"kind":choices(&["race"]),"definition":definition(false)}),
        &[],
    );
    let caste = object(
        json!({"kind":choices(&["caste"]),"definition":definition(true),
        "nativeFields":object(json!({"startingItems":array(nullable(identity()),20,20),
            "maximumSpellsPerRound":integer(-32768,32767)}),&[])}),
        &[],
    );
    object(
        json!({"edit":{"oneOf":[race,caste]},"expectedFamilyHash":identity(),
        "allocation":{"type":"boolean"},"copySource":nullable(copy_guard())}),
        &["copySource"],
    )
}

fn definition(caste: bool) -> Value {
    let mut properties = json!({"id":identity(),"classicId":integer(1,30),"name":text(1024),
        "description":text(16384),"saveBonuses":words(8),"attributeBonuses":words(6),
        "attributeLimits":words(12),"conditionLevels":words(40),
        "itemCategoryMasks":array(integer(i32::MIN.into(),i32::MAX.into()),2,2)});
    if caste {
        caste_fields(&mut properties);
    } else {
        race_fields(&mut properties);
    }
    object(properties, &[])
}

fn words(count: usize) -> Value {
    array(integer(-32768, 32767), count, count)
}

fn scalars(properties: &mut Value, fields: &str) {
    for field in fields.split_whitespace() {
        properties[field] = integer(-32768, 32767);
    }
}

fn race_fields(properties: &mut Value) {
    scalars(
        properties,
        "maximumAge baseMovement magicResistance twoHandBonus missileBonus baseAttacks maximumAttacks defaultIconSet descriptorFlags",
    );
    properties["eligibleCasteIds"] = array(identity(), 0, 30);
    properties["hitModifiers"] = words(8);
    properties["abilityBonuses"] = words(14);
    properties["ageRanges"] = array(words(2), 5, 5);
    properties["ageChanges"] = array(array(integer(-128, 127), 15, 15), 5, 5);
    for field in ["doesNotDie", "canRegenerate"] {
        properties[field] = json!({"type":"boolean"});
    }
}

fn caste_fields(properties: &mut Value) {
    scalars(
        properties,
        "casteClass minimumAgeGroup movementBonus magicResistanceMultiplier twoHandBonus maximumStaminaBonus bonusAttacks maximumAttacks startMoney defaultIcon",
    );
    properties["eligibleRaceIds"] = array(identity(), 0, 30);
    properties["initialAbilityValues"] = words(14);
    properties["levelAbilityDice"] = words(14);
    properties["victoryThresholds"] = array(integer(i32::MIN.into(), i32::MAX.into()), 30, 30);
    for field in [
        "staminaDice",
        "strengthValues",
        "dodgeValues",
        "toHitValues",
        "missileValues",
        "handToHandValues",
    ] {
        properties[field] = words(2);
    }
    properties["spellcasterRows"] = array(words(3), 4, 4);
    properties["attackLevels"] = array(integer(-128, 127), 10, 10);
    properties["startingItemIds"] = array(identity(), 0, 20);
    for field in ["canUseMissile", "getsMissileBonus"] {
        properties[field] = json!({"type":"boolean"});
    }
}
