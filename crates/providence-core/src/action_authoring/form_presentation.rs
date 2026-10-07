//! Context-sensitive author labels, choices, units, and special-value vocabulary.

use super::target_rules::{FieldMeaning, field_meaning};
use super::{
    ActionSemanticInventoryEntry, ActionSemanticInventoryField, ActionTargetKind, FormChoice,
    SemanticSpecialValue,
};
use std::collections::BTreeMap;

pub(super) fn field_presentation(
    opcode: i16,
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
    option_storage: Option<&str>,
) -> (String, String) {
    if let Some(presentation) = super::field_label_cleanup::presentation(opcode, field.index) {
        return presentation;
    }
    match opcode {
        -23 | 23 => super::random_region_control::field_presentation(opcode, field),
        20 | 45 => super::teleport_control::field_presentation(field),
        33 => super::payment_control::field_presentation(field),
        43 => super::condition_duration_control::field_presentation(field),
        15 | 16 => super::stamina_change_control::field_presentation(field, values),
        37 => super::dungeon_move_presentation::field_presentation(field, values),
        54 => super::timed_encounter_control::field_presentation(field),
        63 => super::time_mutation_control::field_presentation(field, values),
        64 => super::time_branch_control::field_presentation(field),
        65 | 124 => super::random_item_control::field_presentation(opcode, field, values),
        74 => super::spell_points_control::field_presentation(field, values),
        76 => super::quest_value_control::field_presentation(field),
        120 => super::combat_monster_control::field_presentation(field),
        125 => super::destroy_related_control::field_presentation(field),
        13 => super::trigger_mutation_control::field_presentation(field),
        108 => super::selected_character_presentation::field_presentation(field, values),
        126 => super::battle_macro_presentation::battle_macro_field_presentation(field, values),
        _ => common_field_presentation(opcode, field, values, option_storage),
    }
}

fn common_field_presentation(
    opcode: i16,
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
    option_storage: Option<&str>,
) -> (String, String) {
    match (opcode, field.index) {
        (48 | 56 | 107, 1) => ("Random Battle Range High".into(), "Zero selects only the first battle; otherwise this is the high endpoint of the battle range.".into()),
        (22, 4) => ("Replacement Item".into(), "Item used only when Replace item is selected. Other modes retain this value without using it.".into()),
        (33 | 38 | 42 | 46 | 58 | 59, 3) => ("Destination".into(), "Used only when the behavior branches. Extra Action Point mode loads a script; encounter modes select a branch in the already loaded encounter.".into()),
        (73, 1..=4) => super::restricted_shop_presentation::field_presentation(field),
        (74, 1) => ("Roll Low / Optional Sound".into(), "Low endpoint of the spell-point roll. When Play Sound is nonzero, Classic also plays this number as a sound; it remains the roll endpoint.".into()),
        (74, 3) => ("Play Sound".into(), "Zero disables sound. Any nonzero value plays the sound whose number is also the Roll Low value.".into()),
        (3, 0) => ("Continue When".into(), "Choose which answer continues to the next step.".into()),
        (3, 1) => ("Otherwise".into(), "Choose what happens after the other answer.".into()),
        (3, 2) => ("Otherwise Destination".into(), "Destination used by the selected Otherwise behavior.".into()),
        (3, 3) => super::choice_presentation::prompt("Left Option", option_storage),
        (3, 4) => super::choice_presentation::prompt("Right Option", option_storage),
        (12, 1) if values.get("isDungeon") == Some(&1) => ("Dungeon Y Cell".into(), "Vertical dungeon cell coordinate; Classic stores dungeon coordinates in Y/X order.".into()),
        (12, 1) => ("Land X Cell".into(), "Horizontal land-map cell coordinate.".into()),
        (12, 2) if values.get("isDungeon") == Some(&1) => ("Dungeon X Cell".into(), "Horizontal dungeon cell coordinate; Classic stores dungeon coordinates in Y/X order.".into()),
        (12, 2) => ("Land Y Cell".into(), "Vertical land-map cell coordinate.".into()),
        (12, 3) => ("Replacement Tile".into(), "Tile ID written at the selected land or dungeon cell.".into()),
        (17 | 18, 1) => ("Power Level".into(), "Power level assigned before the spell resolves.".into()),
        (17 | 18, 2) => ("Resistance Modifier".into(), "Signed percentage-point adjustment applied to the spell's resistance check.".into()),
        (22, 3) => ("Charge Change".into(), "Signed number of charges to add; negative values drain charges.".into()),
        (41, 1) => ("Choice To Eliminate".into(), "Choose the one-based Simple Encounter choice to eliminate.".into()),
        (33, 1) => ("Branch When".into(), "Choose whether successful or failed payment branches. Skip to final step on failure continues at the eighth code; it does not repeat the previous step.".into()),
        (38, 1) => ("Branch When".into(), "Choose whether possessing or missing the item branches, or branch unconditionally.".into()),
        (33 | 38 | 42 | 46 | 58 | 59, 4) => ("Code Position".into(), "For an in-encounter branch, choose its result-program slot; zero selects the top Code/ID. This word is not the destination record.".into()),
        (46, 1) => ("Branch When".into(), "Choose which quest-flag state triggers the branch.".into()),
        (50, 4) => ("Characters To Check".into(), "Check everyone or only characters with positive stamina. This action replaces the picked-character selection.".into()),
        (60, 1) => ("Remove Money From".into(), "Remove the selected kind of money from everyone or only currently picked characters, regardless of stamina.".into()),
        (52, 0) => ("Check".into(), "Choose the property used to select characters.".into()),
        (52, 1) => ("Check Value".into(), "Meaning follows the selected check: movement, position, item, chance, attribute, or spell type.".into()),
        (52, 2) => ("Characters To Check".into(), "Choose all, living, or currently picked characters.".into()),
        (58, 0) => ("Minimum Difficulty".into(), "Branch when scenario difficulty is this level or harder.".into()),
        (58 | 59, 1) => ("When Matched".into(), "Choose whether to branch, exit and keep codes, or exit and erase codes.".into()),
        (59, 0) => ("Tile To Check".into(), "Branch when the party is standing on this tile.".into()),
        (68, 0) => ("Fatigue Change".into(), "Choose full fatigue, rested, or a percentage calculation.".into()),
        (68, 2) => ("Fatigue Multiplier".into(), "Pinned Classic divides this signed percentage by 100 before multiplying current fatigue. Values 1–99 therefore produce zero fatigue; 100 preserves it and 200 doubles it.".into()),
        (70, 0) => ("Position Operation".into(), "Save the current position or return to the last saved position.".into()),
        (75, 1) => ("Required Spell Points".into(), "Minimum spell points required for the selected characters.".into()),
        (81, 0) => ("Condition Number".into(), "Condition slot that every selected character must currently have.".into()),
        (81, 1) => ("Characters To Check".into(), "Check the whole party, currently picked characters, or one documented one-based party position.".into()),
        (90, 1) => ("Distribution".into(), "Apply to each character, picked characters, or spread across the party.".into()),
        (103, 0) => ("Boat Requirement".into(), "Choose a required boat state, or do not test boat status. A failed requirement stops the remaining steps.".into()),
        (103, 1) => ("Camping Requirement".into(), "Choose a required camping state, or do not test camping status. A failed requirement stops the remaining steps.".into()),
        (103, 2) => ("Boat State After Check".into(), "Keep the current boat state or explicitly put the party in or out of a boat after the requirements pass.".into()),
        _ => (field.label.clone(), field.help.clone()),
    }
}

fn battle_field_presentation(
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
) -> (String, String) {
    let (label, help) = match field.index {
        0 => (
            "Battle Number / Range Low",
            "Choose one battle or the low end of a random battle range. Negative battle numbers surprise the party.",
        ),
        1 => (
            "Random Battle Range High",
            "Use zero for a single battle or choose the high end of the random range.",
        ),
        2 if values.get("revivePartyFlag") == Some(&10) => (
            "Before-battle Sound / After-battle Script",
            "The same stored number selects a sound before combat and an Extra Action Point after combat, on either victory or revived loss. Changing either selection changes both effects.",
        ),
        2 => (
            "Sound To Play Before Battle",
            "Optional sound played as the party enters combat.",
        ),
        4 => (
            "Battle Outcome",
            "Choose normal victory rewards, victory points only, or revive the party after a loss.",
        ),
        _ => return (field.label.clone(), field.help.clone()),
    };
    (label.into(), help.into())
}

pub(super) fn resolved_field_presentation(
    entry: &ActionSemanticInventoryEntry,
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
    option_storage: Option<&str>,
) -> (String, String, FieldMeaning, bool) {
    let (mut label, mut explanation) = if entry.opcode == 2 {
        battle_field_presentation(field, values)
    } else {
        field_presentation(entry.opcode, field, values, option_storage)
    };
    let meaning = field_meaning(entry, field, values, option_storage);
    if let Some(presentation) = meaning.contextual_presentation() {
        (label, explanation) = presentation;
    }
    let preserved = field.preserved || meaning == FieldMeaning::Preserved;
    if meaning == FieldMeaning::Preserved {
        explanation = "The audited action consumer does not read this compatibility word.".into();
    }
    (label, explanation, meaning, preserved)
}

macro_rules! field_choice_entries {
    ($opcode:expr, $index:expr) => {
        match ($opcode, $index) {
            (2, 4) => &[
                (0, "Victory and treasure"),
                (5, "Victory only"),
                (10, "Revive after loss"),
            ],
            (3, 0) => &[
                (-1, "Either answer continues"),
                (0, "Right / No continues"),
                (1, "Left / Yes continues"),
            ],
            (3, 1) => &[
                (-1, "Continue"),
                (0, "Back Up"),
                (1, "Extra Action Point"),
                (2, "Simple Encounter Result"),
                (3, "Complex Encounter Result"),
                (4, "Eliminate Action Point"),
            ],
            (7, 3) => &[
                (0, "Current / same map kind"),
                (1, "Land level"),
                (2, "Dungeon level"),
            ],
            (7, 4) => &[
                (0, "Result 1"),
                (1, "Result 2"),
                (2, "Result 3"),
                (3, "Result 4"),
            ],
            (12, 4) | (92, 2) => &[(0, "Land map"), (1, "Dungeon map")],
            (17 | 18, 3) => &[(0, "Allow resistance"), (1, "Force effect")],
            (21 | 67, 1) => branch_choices(),
            (87, 1) => branch_choices(),
            (21, 2) | (87, 2) => &[
                (0, "Use destination"),
                (1, "Continue current script"),
                (2, "Show string and exit"),
            ],
            (22, 2) => &[(1, "Drop item"), (2, "Change charges"), (3, "Replace item")],
            (30, 3) | (31, 2) => &[(0, "Special ability"), (1, "Attribute")],
            (30, 2) => &[
                (0, "Picked characters"),
                (1, "Everyone"),
                (2, "Living characters"),
            ],
            (33, 1) => &[
                (0, "Payment fails"),
                (1, "Payment succeeds"),
                (2, "Always"),
                (-1, "Skip to final step on failure"),
            ],
            (37, index) => super::dungeon_move_presentation::choices(index),
            (38, 1) => &[
                (0, "Party does not have item"),
                (1, "Party has item"),
                (2, "Always"),
            ],
            (33 | 38 | 42 | 46 | 58 | 59, 2) => &[
                (-1, "Continue at final code"),
                (0, "Extra Action Point"),
                (1, "Within current Simple Encounter"),
                (2, "Within current Complex Encounter"),
                (3, "Exit and keep codes"),
            ],
            (40, 0) => &[(1, "Condition exists"), (2, "Condition does not exist")],
            (40, 3) => super::classic_choices::party_conditions(),
            (41, 1) => &[
                (1, "Choice 1"),
                (2, "Choice 2"),
                (3, "Choice 3"),
                (4, "Choice 4"),
            ],
            (40, 1) | (76, 2) => &[
                (0, "No branch"),
                (1, "Extra Action Point"),
                (2, "Simple Encounter"),
                (3, "Complex Encounter"),
            ],
            (42, 1) | (58 | 59, 1) => &[
                (1, "Branch"),
                (2, "Exit and keep codes"),
                (-2, "Exit and erase codes"),
            ],
            (43, 0) => &[
                (0, "Whole party"),
                (1, "Picked characters"),
                (2, "Living characters"),
            ],
            (43, 1) | (81, 0) => super::classic_choices::character_conditions(),
            (81, 1) => super::classic_choices::condition_subjects(),
            (46, 1) => &[(0, "Quest is not set"), (1, "Quest is set"), (2, "Always")],
            (50, 0) => &[
                (0, "Race"),
                (1, "Gender"),
                (2, "Caste"),
                (3, "Race class"),
                (4, "Caste class"),
            ],
            (50, 1) => &[(1, "Male"), (2, "Female")],
            (50, 4) => &[(0, "Everyone"), (1, "Living characters")],
            (60, 1) => &[(0, "Everyone"), (1, "Picked characters")],
            (52, 0) => &[
                (0, "Movement"),
                (1, "Position"),
                (2, "Item possession"),
                (3, "Percent chance"),
                (4, "Save vs attribute"),
                (5, "Save vs spell type"),
                (6, "Current selected character"),
                (7, "Item worn"),
                (8, "Exact party position"),
            ],
            (52 | 53, 2) => &[(0, "All"), (1, "Living only"), (2, "Picked only")],
            (53, 1) => &[
                (1, "Fighter types"),
                (2, "Magical types"),
                (3, "Monk / rogue"),
            ],
            (54, 3) => &[(0, "Keep scheduled day"), (1, "Reset to current day")],
            (58, 0) => super::classic_choices::difficulty_levels(),
            (55, 0) => super::classic_choices::picked_branch_conditions(),
            (55, 1) => &[
                (0, "Exit on failure"),
                (1, "Extra Action Point on failure"),
                (2, "Show string and exit"),
            ],
            (57, 0) => &[
                (0, "Plains"),
                (3, "Subterranean"),
                (4, "Castle"),
                (5, "Desert"),
                (9, "Swamp"),
                (10, "Snow"),
            ],
            (57, 1) => &[(0, "Daylight"), (1, "Dark")],
            (60, 0) => &[(1, "Gold"), (2, "Gems"), (3, "Jewelry")],
            (61, 3) => &[(0, "Exact distance"), (1, "Random distance")],
            (63, 0) => &[(1, "Set absolute time"), (2, "Add time offset")],
            (68, 0) => &[
                (1, "Set fatigue to 100%"),
                (2, "Set fatigue to 0%"),
                (3, "Calculate from current fatigue"),
            ],
            (69, 0..=2) => &[(0, "On"), (1, "Off")],
            (74, 3) => &[(0, "Off"), (1, "On")],
            (70, 0) => &[
                (1, "Save current position"),
                (2, "Return to saved position"),
            ],
            (75, 0) => &[(1, "Picked characters"), (2, "All living characters")],
            (75, 2) => &[(0, "Continue on failure"), (1, "Exit and keep codes")],
            (72 | 75, 3) | (77 | 78, 2) | (85, 0) | (86, 2) => branch_choices(),
            (78, 0) => &[
                (1, "Shoreline"),
                (2, "Boat state"),
                (3, "Path"),
                (4, "Blocks line of sight"),
                (5, "Requires fly / float"),
                (6, "Special terrain type"),
                (7, "Specific tile"),
            ],
            (86, 0) => &[
                (0, "Caste present"),
                (1, "Race present"),
                (2, "Gender present"),
                (3, "In boat"),
                (4, "Camping"),
                (5, "Caste class present"),
                (6, "Race class present"),
                (7, "Total party levels"),
                (8, "Picked character levels"),
            ],
            (90, 1) => &[
                (0, "Each character"),
                (1, "Picked characters"),
                (2, "Spread across party"),
            ],
            (92, 4) => &[
                (-1, "Keep current shape"),
                (0, "Set coordinates"),
                (1, "Offset rectangle"),
                (2, "Warp with paired details"),
            ],
            (103, 0) => &[
                (0, "Do not test boat status"),
                (1, "Continue if in boat"),
                (2, "Continue if not in boat"),
            ],
            (103, 1) => &[
                (0, "Do not test camping status"),
                (1, "Continue if camping"),
                (2, "Continue if not camping"),
            ],
            (103, 2) => &[
                (0, "Keep boat state"),
                (1, "Set in boat"),
                (2, "Set not in boat"),
            ],
            (106, 0) => &[(1, "Make light"), (2, "Make dark")],
            (106, 1) => &[(0, "Continue even if unchanged"), (1, "Stop if unchanged")],
            (108, 0) => &[
                (1, "Melee attacks"),
                (2, "Spell attacks"),
                (3, "Movement"),
                (4, "Damage"),
                (5, "Spell points"),
                (6, "Hand-to-hand"),
                (7, "Stamina"),
                (8, "Armor rating"),
                (9, "To-hit"),
                (10, "Projectile to-hit"),
                (11, "Magic resistance"),
                (12, "Prestige"),
            ],
            (120, 0) => &[(1, "NPC"), (2, "Monster")],
            (120, 4) => &[(0, "Join player side"), (1, "Join enemy side")],
            (124, 4) => &[
                (-1, "Keep the monster's authored allegiance"),
                (0, "Use caller/default allegiance"),
                (1, "Force enemy side"),
            ],
            (125, 4) => &[
                (0, "Protect allied monsters"),
                (1, "Include allied monsters"),
            ],
            (126, 0) => &[
                (0, "After round"),
                (1, "Percent chance each round"),
                (2, "Flee / fail"),
            ],
            (126, 2) => &[
                (0, "One Extra Action Point once"),
                (1, "One Extra Action Point each matching round"),
                (2, "One random Extra Action Point once"),
            ],
            _ => &[],
        }
    };
}

pub(super) fn field_choices(opcode: i16, index: u8, current: i16) -> Vec<FormChoice> {
    let entries: &[(i16, &str)] = field_choice_entries!(opcode, index);
    entries
        .iter()
        .map(|(value, label)| {
            let preserves_signed_category = opcode == 124
                && index == 4
                && ((*value == -1 && current < 0) || (*value == 1 && current > 0));
            let preserves_nonzero_category = matches!(
                (opcode, index),
                (50, 4) | (60, 1) | (74, 3) | (120, 4) | (125, 4)
            ) && *value == 1
                && current != 0;
            FormChoice {
                value: if preserves_signed_category || preserves_nonzero_category {
                    current
                } else {
                    *value
                },
                label: (*label).into(),
            }
        })
        .collect()
}

fn branch_choices() -> &'static [(i16, &'static str)] {
    &[
        (0, "Extra Action Point"),
        (1, "Simple Encounter"),
        (2, "Complex Encounter"),
    ]
}

pub(super) fn direct_choices(opcode: i16) -> Vec<FormChoice> {
    let entries: &[(i16, &str)] = match opcode {
        35 => &[
            (1, "Choice 1"),
            (2, "Choice 2"),
            (3, "Choice 3"),
            (4, "Choice 4"),
        ],
        36 => &[(0, "Restore captured equipment"), (1, "Capture equipment")],
        66 => &[(0, "Allow camping"), (1, "Prevent camping")],
        44 => &[
            (1, "Choice 1"),
            (2, "Choice 2"),
            (3, "Choice 3"),
            (4, "Choice 4"),
        ],
        71 => &[(0, "Show coordinates"), (1, "Hide coordinates")],
        95 => &[
            (1, "North"),
            (2, "East"),
            (3, "South"),
            (4, "West"),
            (-1, "Random"),
        ],
        104 => &[
            (0, "Disable random encounters"),
            (1, "Allow random encounters"),
        ],
        105 => &[(1, "Suspend allies"), (2, "Activate allies")],
        _ => &[],
    };
    entries
        .iter()
        .map(|(value, label)| FormChoice {
            value: *value,
            label: (*label).into(),
        })
        .collect()
}

pub(super) fn field_special_values(
    opcode: i16,
    index: u8,
    words: [i16; 5],
) -> Vec<SemanticSpecialValue> {
    let entries: &[(i16, &str)] = match (opcode, index) {
        (20 | 45, 0..=2) | (23 | -23, 3 | 4) | (54, 1 | 2 | 4) => &[(-1, "Keep the current value")],
        (23 | -23, 2) => &[(0, "Disable encounters"), (-1, "Invisible encounter")],
        (13, 2) => &[(-1, "Disable the selected Action Point or range")],
        (53, 0) => &[(0, "No specific caste; use the caste type choice only")],
        (86, 1) if matches!(words[0], 0 | 1) => &[(0, "No matching caste or race")],
        (56, 2) => &[(-1, "Back up one step")],
        (64, 0 | 1) => &[(-1, "Skip this part of the time test")],
        (67, 3) if matches!(words[1], 1 | 2) => &[(-1, "Continue the current script")],
        (65, 0) | (124, 2) => &[(
            -1,
            "Negative limits choose a random count from 1 through the absolute value",
        )],
        (73, 0) => &[(-1, "Negative shop IDs open the shop immediately")],
        (120, 3 | 4) => &[(-1, "Keep the current value")],
        (125, 1) => &[(0, "Destroy every matching monster")],
        _ => &[],
    };
    entries
        .iter()
        .map(|(value, meaning)| SemanticSpecialValue {
            value: *value,
            meaning: (*meaning).into(),
        })
        .collect()
}

pub(super) fn direct_special_values(opcode: i16) -> Vec<SemanticSpecialValue> {
    let entries: &[(i16, &str)] = match opcode {
        1 => &[(
            -1,
            "Negative string IDs display without waiting for a click",
        )],
        6 => &[(
            -1,
            "Negative shop IDs open the shop immediately; positive IDs enable the Shop command",
        )],
        9 => &[(
            -1,
            "Negative sound IDs wait for playback to finish before the next step",
        )],
        -14 | 14 => &[(
            -1,
            "A negative count limits selection to conscious or animated characters",
        )],
        29 => &[(-1, "Negative map IDs display the map immediately")],
        47 => &[(-1, "Negative quest IDs clear the selected quest flag")],
        _ => &[],
    };
    entries
        .iter()
        .map(|(value, meaning)| SemanticSpecialValue {
            value: *value,
            meaning: (*meaning).into(),
        })
        .collect()
}

pub(super) fn field_context(opcode: i16, index: u8) -> String {
    match (opcode, index) {
        (2, 2) => {
            "Sound before combat; also an Extra Action Point after combat in Revive after loss mode.".into()
        }
        (3, _) => {
            "Choice action in an Action Point, Extra Action Point, or encounter script.".into()
        }
        (7, 3) => "Only Action Point replacement.".into(),
        (7, 4) => "Only simple or complex encounter replacement.".into(),
        (37, _) => "Dungeon transition; the script stops after movement.".into(),
        (126, _) => "Battle macro only.".into(),
        _ => "Any script context accepted by this action.".into(),
    }
}

pub(super) fn direct_context(opcode: i16) -> String {
    match opcode {
        34 => "Encounter scripts only.".into(),
        100 | 119 | 127 => "Battle or battle-macro context only.".into(),
        _ => "Any script context accepted by this action.".into(),
    }
}

pub(super) fn resolved_explanation(
    label: &str,
    explanation: &str,
    choices: &[FormChoice],
    target_kind: Option<ActionTargetKind>,
    units: Option<&str>,
    special_values: &[SemanticSpecialValue],
) -> String {
    if !explanation.trim().eq_ignore_ascii_case(label.trim()) {
        return explanation.trim().to_owned();
    }
    if let Some(kind) = target_kind {
        return format!(
            "Select the referenced {} record used by this action.",
            target_noun(kind)
        );
    }
    if !choices.is_empty() {
        return format!("Choose one of the source-defined behaviors for {label}.");
    }
    if let Some(units) = units {
        return format!("Enter {label} measured in {units}.");
    }
    if !special_values.is_empty() {
        return format!("Enter {label}; the documented special values are listed below.");
    }
    String::new()
}

fn target_noun(kind: ActionTargetKind) -> &'static str {
    match kind {
        ActionTargetKind::Message => "message",
        ActionTargetKind::OptionLabel => "option label",
        ActionTargetKind::Quest => "quest",
        ActionTargetKind::Battle => "battle",
        ActionTargetKind::Treasure => "treasure",
        ActionTargetKind::Item => "item",
        ActionTargetKind::Shop => "shop",
        ActionTargetKind::SimpleEncounter => "simple encounter",
        ActionTargetKind::ComplexEncounter => "complex encounter",
        ActionTargetKind::RogueEncounter => "rogue encounter",
        ActionTargetKind::TimedEncounter => "timed encounter",
        ActionTargetKind::ExtraActionPoint => "Extra Action Point",
        ActionTargetKind::SameMapActionPoint => "same-map Action Point",
        ActionTargetKind::Sound => "sound",
        ActionTargetKind::Picture => "picture",
        ActionTargetKind::Monster => "monster",
        ActionTargetKind::MonsterAppearance => "monster appearance",
        ActionTargetKind::MonsterNameTag => "monster name tag",
        ActionTargetKind::Map => "map",
        ActionTargetKind::MapTile => "map tile",
        ActionTargetKind::PlayerMap => "player map",
        ActionTargetKind::RandomRectangle => "random rectangle",
        ActionTargetKind::TextResource => "text resource",
        ActionTargetKind::Spell => "spell",
        ActionTargetKind::Race => "race",
        ActionTargetKind::Caste => "caste",
    }
}
