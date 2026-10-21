//! Expose only field-owned Monster edits, never imported row metadata.
use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "monster-appearance.open" => vec![("iconId", integer(-32768, 32767))],
        "monster.draft.prepare" | "monster.draft.apply" => vec![("draft", draft())],
        "monster.operation.prepare" => vec![
            ("operation", operation()),
            ("section", choices(&["changes", "uses", "excluded"])),
        ],
        "monster.operation.commit" => vec![("operation", operation())],
        "monster-description.update" => vec![(
            "description",
            object(
                json!({
            "identity":identity(),"nativeId":integer(0,32767),"text":text(255),
            "authored":{"type":"boolean"}}),
                &["authored"],
            ),
        )],
        _ => vec![],
    }
}

fn draft() -> Value {
    object(
        json!({"setId":json!({"type":"integer","enum":[-1,0,1]}),
        "nativeId":integer(0,32767),"fields":edited_fields(),"description":nullable(text(255)),
        "normalNotOnMenu":nullable(json!({"type":"boolean"}))}),
        &["fields", "description", "normalNotOnMenu"],
    )
}

fn edited_fields() -> Value {
    let mut properties = json!({"displayName":text(40)});
    for (fields, low, high) in [
        ("hitDice staminaBonus agility movementMax", 0, 255),
        (
            "armor magicResistance requiredWeapon traitor size attackCount magicAttackCount damageBonus castPercent runPercent surrenderPercent missilePercent canSummon magicToHit",
            -128,
            127,
        ),
        (
            "weapon iconId spellPoints experience stamina staminaMax deathMacro maxSpellPoints",
            -32768,
            32767,
        ),
    ] {
        for field in fields.split_whitespace() {
            properties[field] = integer(low, high);
        }
    }
    for (family, count, low, high) in [
        ("typeFlags", 8, -128, 127),
        ("saves", 6, -128, 127),
        ("spellImmunities", 6, -128, 127),
        ("money", 3, -32768, 32767),
        ("spells", 10, -32768, 32767),
        ("items", 6, -32768, 32767),
        ("conditions", 40, -128, 127),
    ] {
        for slot in 0..count {
            properties[format!("{family}.{slot}")] = integer(low, high);
        }
    }
    for row in 0..5 {
        for column in 0..4 {
            properties[format!("attacks.{row}.{column}")] = integer(-128, 127);
        }
    }
    let mut schema = object(properties, &[]);
    schema["required"] = json!([]);
    schema["maxProperties"] = json!(128);
    schema
}

fn operation() -> Value {
    let mut actions = Vec::new();
    for (kind, fields) in [
        ("create", "setId nativeId"),
        ("duplicate", "setId sourceId targetId"),
        ("clear", "setId nativeId"),
        ("switch", "setId firstId secondId"),
        ("copy-all-sets", "sourceSetId nativeId"),
        ("generate-variants", "nativeId"),
        ("generate-all-variants", ""),
    ] {
        let mut properties = json!({"kind":choices(&[kind])});
        for field in fields.split_whitespace() {
            properties[field] = if field.ends_with("SetId") || field == "setId" {
                json!({"type":"integer","enum":[-1,0,1]})
            } else {
                integer(0, 32767)
            };
        }
        actions.push(object(properties, &[]));
    }
    object(
        json!({"action":{"oneOf":actions},"retargetUses":array(object(json!({
        "source":identity(),"field":text(512),"targetId":integer(1,32767)}),&[]),0,128)}),
        &[],
    )
}
