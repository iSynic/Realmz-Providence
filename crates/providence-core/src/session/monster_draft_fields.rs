use std::collections::BTreeMap;

use serde_json::Value;

use super::SessionError;
use super::monster_draft::validate_text;
use crate::model::MonsterRecord;

pub(crate) fn patch_record(
    existing: &MonsterRecord,
    fields: &BTreeMap<String, Value>,
) -> Result<MonsterRecord, SessionError> {
    if fields.len() > 128 {
        return Err(invalid(
            existing,
            "a Monster draft cannot exceed 128 edited fields",
        ));
    }
    let mut value =
        serde_json::to_value(existing).map_err(|error| invalid(existing, &error.to_string()))?;
    for (field, edited) in fields {
        if !authoring_field(field) {
            return Err(invalid(
                existing,
                &format!("{field} is not an editable Monster field"),
            ));
        }
        let pointer = format!("/{}", field.replace('.', "/"));
        let target = value
            .pointer_mut(&pointer)
            .ok_or_else(|| invalid(existing, &format!("{field} has no existing field or slot")))?;
        *target = edited.clone();
    }
    let record: MonsterRecord = serde_json::from_value(value)
        .map_err(|error| invalid(existing, &format!("invalid Monster field value: {error}")))?;
    crate::codecs::validate_monster_record_shape(&record)
        .map_err(|error| invalid(existing, &error.to_string()))?;
    if fields.contains_key("displayName") {
        validate_text(&existing.identity, &record.display_name, 40)?;
    }
    Ok(record)
}

pub(crate) fn authoring_field(field: &str) -> bool {
    if matches!(
        field,
        "displayName"
            | "hitDice"
            | "staminaBonus"
            | "agility"
            | "movementMax"
            | "armor"
            | "magicResistance"
            | "requiredWeapon"
            | "traitor"
            | "size"
            | "attackCount"
            | "magicAttackCount"
            | "damageBonus"
            | "castPercent"
            | "runPercent"
            | "surrenderPercent"
            | "missilePercent"
            | "canSummon"
            | "weapon"
            | "iconId"
            | "spellPoints"
            | "experience"
            | "stamina"
            | "staminaMax"
            | "magicToHit"
            | "deathMacro"
            | "maxSpellPoints"
    ) {
        return true;
    }
    let parts = field.split('.').collect::<Vec<_>>();
    match parts.as_slice() {
        [family, slot] => {
            let count = match *family {
                "typeFlags" => 8,
                "saves" | "spellImmunities" | "items" => 6,
                "money" => 3,
                "spells" => 10,
                "conditions" => 40,
                _ => return false,
            };
            exact_index(slot, count)
        }
        ["attacks", row, column] => exact_index(row, 5) && exact_index(column, 4),
        _ => false,
    }
}

fn exact_index(value: &str, count: usize) -> bool {
    value
        .parse::<usize>()
        .is_ok_and(|index| index < count && value == index.to_string())
}

fn invalid(record: &MonsterRecord, reason: &str) -> SessionError {
    SessionError::InvalidMonster {
        identity: record.identity.clone(),
        reason: reason.into(),
    }
}

pub(crate) fn issue_message(field: &str, diagnostic: &str) -> String {
    // Ranges come from the canonical deserializer's rejected type, not a UI table.
    for (kind, lower, upper) in [
        ("i8", i8::MIN as i64, i8::MAX as i64),
        ("u8", 0, u8::MAX as i64),
        ("i16", i16::MIN as i64, i16::MAX as i64),
        ("u16", 0, u16::MAX as i64),
        ("i32", i32::MIN as i64, i32::MAX as i64),
        ("u32", 0, u32::MAX as i64),
    ] {
        if diagnostic.contains(&format!("expected {kind}")) {
            return format!("Enter a whole number from {lower} to {upper}.");
        }
    }
    if matches!(field, "description" | "displayName") {
        if diagnostic.contains("ASCII") {
            return "Use ASCII characters so the text can be exported without substitution.".into();
        }
        if let Some(start) = diagnostic.find("text uses ") {
            return diagnostic[start..].to_string();
        }
    }
    if field == "preferredScenarioMonsterId" {
        return "Choose a preferred ID from 0 to 32767; 0 allocates the next free ID.".into();
    }
    if field == "normalNotOnMenu" {
        return "Create an active Normal record before changing Hide from Bestiary.".into();
    }
    "This value cannot be used in this field. Keep the draft and enter a valid value.".into()
}
