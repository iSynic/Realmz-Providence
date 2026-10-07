//! Named selectors for Classic character ability and attribute checks.

use super::{DescribedActionField, FormChoice, FormControl};

pub(super) fn decorate(
    values: &std::collections::BTreeMap<String, i16>,
    fields: &mut [DescribedActionField],
) {
    let attribute_mode = values.get("attributeFlag").copied().unwrap_or(0) != 0;
    let Some(selector) = fields.iter_mut().find(|field| {
        matches!(
            field.key.as_str(),
            "signedAbilityOrAttribute" | "abilityOrAttribute"
        )
    }) else {
        return;
    };

    selector.label = if attribute_mode {
        "Attribute".into()
    } else {
        "Special Ability".into()
    };
    selector.explanation = if selector.value < 0 {
        "This imported negative selector is retained exactly. Its documented failure meaning does not execute consistently in pinned Classic source, so Providence does not reinterpret it as a named choice.".into()
    } else if attribute_mode {
        "Choose the character attribute used by the check.".into()
    } else {
        "Choose the character special ability used by the percentage check.".into()
    };

    // A negative selector is a separate documented outcome convention with disputed
    // shipped behavior. Keeping it numeric avoids silently losing its sign, including
    // the unrepresentable negative-zero case for selector 0.
    if selector.value < 0 {
        selector.control = FormControl::Integer;
        selector.choices.clear();
        return;
    }

    selector.control = FormControl::Choice;
    selector.choices = if attribute_mode {
        attribute_choices()
    } else {
        special_ability_choices()
    };
}

fn attribute_choices() -> Vec<FormChoice> {
    [
        (0, "Brawn"),
        (1, "Knowledge"),
        (2, "Judgment"),
        (3, "Agility"),
        (4, "Vitality"),
        (5, "Unused (always fails)"),
        (6, "Luck"),
    ]
    .into_iter()
    .map(choice)
    .collect()
}

fn special_ability_choices() -> Vec<FormChoice> {
    [
        (0, "Sneak Attack"),
        (1, "Hide in Shadows"),
        (2, "Resurrect"),
        (3, "Major Wound"),
        (4, "Detect Secret"),
        (5, "Acrobatic Act"),
        (6, "Detect Trap"),
        (7, "Disarm Trap"),
        (8, "Hear Noise"),
        (9, "Force Lock / Door"),
        (10, "Move Silently"),
        (11, "Pick Lock"),
        (12, "Pick Pocket"),
        (13, "Turn Undead"),
    ]
    .into_iter()
    .map(choice)
    .collect()
}

fn choice((value, label): (i16, &str)) -> FormChoice {
    FormChoice {
        value,
        label: label.into(),
    }
}
