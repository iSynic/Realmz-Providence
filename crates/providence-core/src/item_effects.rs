// Labels and effect ranges follow Providence 56ac232c ItemSpecialBehaviorFields.tsx.
use super::{ItemReferenceChoice, choice};
use crate::model::ItemRuleDefinition;

const CONDITIONS: &[&str] = &[
    "Running",
    "Helpless",
    "Hindered",
    "Cursed",
    "Magic Aura",
    "Stupid",
    "Slow",
    "Shield From Hits",
    "Shield From Projectiles",
    "Poisoned",
    "Regenerating",
    "Fire Protection",
    "Cold Protection",
    "Electrical Protection",
    "Chemical Protection",
    "Mental Protection",
    "1st Level Spell Protection",
    "2nd Level Spell Protection",
    "3rd Level Spell Protection",
    "4th Level Spell Protection",
    "5th Level Spell Protection",
    "Strong",
    "Protection From Evil",
    "Speed",
    "Invisible",
    "Animated",
    "Stoned",
    "Blind",
    "Diseased",
    "Confused",
    "Reflect Spells",
    "Reflect Attacks",
    "Attack Bonus",
    "Absorb Spell Points",
    "Drain Spell Points",
    "Absorb Spell Points From Attacks",
    "Hinder Attack",
    "Hinder Defense",
    "Defense Bonus",
    "Silenced",
];
const TYPES: &[&str] = &[
    "Ring",
    "Do not use",
    "Melee Weapon",
    "Shield",
    "Armor and Robe",
    "Gauntlet and Gloves",
    "Cloak and Cape",
    "Helmet and Cap",
    "Ion Stone",
    "Boots",
    "Quiver",
    "Waist and Belt",
    "Neck",
    "Scroll Case",
    "Misc Item",
    "Missile Weapon",
    "Broach",
    "Face and Mask",
    "Scabbard",
    "Belt Loop",
    "Scroll",
    "Magic Item",
    "Supply Item",
    "Extra Action Point Item",
    "Identified Item",
    "Scenario Item",
];

pub(super) fn type_choices() -> Vec<ItemReferenceChoice> {
    TYPES
        .iter()
        .enumerate()
        .flat_map(|(index, label)| {
            let values = if index == 0 {
                vec![0]
            } else {
                vec![index as i32, -(index as i32)]
            };
            values.into_iter().map(move |value| {
                rule(
                    value,
                    format!(
                        "{label}{}",
                        if value < 0 {
                            " (signed negative type)"
                        } else {
                            ""
                        }
                    ),
                    "This choice retains the exact type sign.",
                )
            })
        })
        .collect()
}

pub(super) fn effect_choices() -> Vec<ItemReferenceChoice> {
    let mut rows = vec![
        rule(
            -10,
            "Inflict condition".into(),
            "Uses Special 3 for the condition.",
        ),
        rule(
            -23,
            "Run Extra Action Point".into(),
            "Uses Special 5 as the exact Extra Action Point ID.",
        ),
        rule(
            8,
            "Random power level".into(),
            "Realmz selects the power level.",
        ),
        rule(120, "Auto hit".into(), "Always hits in combat."),
        rule(
            121,
            "Penetration bonus".into(),
            "Treats magical plus as doubled for the to-hit display.",
        ),
        rule(
            122,
            "Attack rounds".into(),
            "Uses Special 2 for the attack-round bonus.",
        ),
    ];
    for power in 1..=7 {
        rows.push(rule(
            -power,
            format!("Power level {power}"),
            "Exact signed power level.",
        ));
    }
    for (index, label) in CONDITIONS.iter().enumerate().take(40) {
        rows.push(rule(
            20 + index as i32,
            format!("Add {label}"),
            "Special 2 is the amount.",
        ));
        rows.push(rule(
            60 + index as i32,
            format!("Remove {label}"),
            "Special 2 is the amount.",
        ));
    }
    rows
}

pub(super) fn attribute_choices() -> Vec<ItemReferenceChoice> {
    let mut rows = (1..=15)
        .map(|id| {
            rule(
                id,
                format!("Special ability {id}"),
                "Special 5 is the amount; this field retains the exact ability code.",
            )
        })
        .collect::<Vec<_>>();
    rows.extend((1..=20).map(|id| {
        rule(
            -id,
            format!("Monster type {id}"),
            "Special 5 is the hit bonus against this exact monster type.",
        )
    }));
    rows.extend((30..=40).map(|id| {
        rule(
            id,
            format!("Party condition {id}"),
            "Special 5 is the amount; the exact party-condition code is retained.",
        )
    }));
    rows
}

pub(super) fn inflicted_condition_choices() -> Vec<ItemReferenceChoice> {
    CONDITIONS.iter().enumerate().map(|(index, label)| {
        let value = 20 + index as i32;
        let detail = if (30..=40).contains(&value) {
            "Inflicted condition is this code minus 20. The same code also retains its party-condition bonus using Special 5."
        } else {
            "Inflicted condition is this code minus 20. The exact Special 3 value is retained."
        };
        rule(value, format!("Inflict {label}"), detail)
    }).collect()
}

fn rule(value: i32, label: String, detail: &str) -> ItemReferenceChoice {
    let mut row = choice(
        format!("item-rule:{value}"),
        value,
        label,
        detail.into(),
        "rule",
        true,
        "",
    );
    row.target_identity = None;
    row
}

pub fn describe_item_effects(definition: &ItemRuleDefinition) -> Vec<String> {
    let [primary, second, third, fourth, amount] = definition.special;
    let mut rows = Vec::new();
    if definition.item_type.unsigned_abs() == 23 || primary == -23 {
        rows.push(format!("Item use runs Extra Action Point {amount}."));
    }
    match primary {
        -10 => rows.push(format!("Inflicts {}.", condition(i64::from(third) - 20))),
        -7..=-1 => rows.push(format!("Power level {}.", -primary)),
        8 => rows.push("Random power level.".into()),
        20..=59 => rows.push(format!(
            "Adds {} by {second}.",
            condition(i64::from(primary) - 20)
        )),
        60..=99 => rows.push(format!(
            "Removes {} by {second}.",
            condition(i64::from(primary) - 60)
        )),
        120 => rows.push("Always hits in combat.".into()),
        121 => rows.push("Penetration bonus doubles magical plus for the to-hit display.".into()),
        122 => rows.push(format!("Adds attack rounds using amount {second}.")),
        0 | -23 => {}
        _ => rows.push(format!(
            "Unknown primary effect {primary}; exact value retained."
        )),
    }
    if second > 1100 {
        rows.push(format!("Stores spell {second}."));
    }
    for (slot, value) in [(3, third), (4, fourth)] {
        match value {
            i32::MIN..=-1 => rows.push(format!(
                "Special {slot}: monster-type {} hit bonus {amount}.",
                value.unsigned_abs()
            )),
            1..=15 => rows.push(format!(
                "Special {slot}: adds special ability {value} by {amount}."
            )),
            30..=40 => rows.push(format!(
                "Special {slot}: party condition {value} by {amount}."
            )),
            0 => {}
            _ => rows.push(format!(
                "Special {slot}: unknown effect {value}; exact value retained."
            )),
        }
    }
    if rows.is_empty() {
        rows.push("No decoded special behavior. Exact values remain editable.".into());
    }
    rows
}

fn condition(index: i64) -> String {
    usize::try_from(index)
        .ok()
        .and_then(|id| CONDITIONS.get(id))
        .map_or_else(
            || format!("condition code {index}"),
            |label| label.to_string(),
        )
}
