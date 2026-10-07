//! Reference decisions follow newland.c at 491816ad, never donor targetFamily hints.
use super::{ActionSemanticInventoryEntry, ActionSemanticInventoryField, ActionTargetKind};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum FieldMeaning {
    Value,
    Preserved,
    Record(ActionTargetKind),
    SimpleResult,
    ComplexResult,
    CodePosition,
    MonsterTag,
    CurrentShop,
    Unresolved,
}

use ActionTargetKind::*;
use FieldMeaning::{CodePosition, Record, Value};

impl FieldMeaning {
    pub(super) fn contextual_presentation(self) -> Option<(String, String)> {
        match self {
            Self::CurrentShop => Some((
                "Current Shop".into(),
                "Change the shop loaded during execution. The caller determines which shop; zero is not Shop 0.".into(),
            )),
            Self::SimpleResult | Self::ComplexResult => {
                let family = if self == Self::SimpleResult {
                    "Simple"
                } else {
                    "Complex"
                };
                Some((format!("Current {family} Encounter Branch"),
                    "Zero-based branch in the encounter loaded during execution, not an encounter record number. Its owning encounter depends on the caller.".into()))
            }
            Self::CodePosition => Some((
                "Code Position".into(),
                "Zero-based position inside the selected encounter branch; 0 starts at the top."
                    .into(),
            )),
            Self::MonsterTag => Some((
                "Monster Name Tag".into(),
                "Matches the stored name tag of existing monsters or allies, not a Monster record number. Multiple records can carry the same tag.".into(),
            )),
            _ => None,
        }
    }
}

pub(crate) fn direct_target_kind(opcode: i16) -> Option<ActionTargetKind> {
    match direct_meaning(opcode) {
        FieldMeaning::Record(kind) => Some(kind),
        _ => None,
    }
}

pub(super) fn direct_meaning(opcode: i16) -> FieldMeaning {
    use ActionTargetKind::*;
    use FieldMeaning::*;
    match opcode {
        1 => Record(Message),
        4 => Record(SimpleEncounter),
        5 => Record(ComplexEncounter),
        6 => Record(Shop),
        8 => Record(SameMapActionPoint),
        9 => Record(Sound),
        10 => Record(Treasure),
        27 => Record(Picture),
        29 => Record(PlayerMap),
        39 => Record(ExtraActionPoint),
        47 => Record(Quest),
        62 => Record(TextResource),
        89 => Record(Monster),
        88 | 127 => MonsterTag,
        -14 | 11 | 14 | 32 | 35 | 36 | 44 | 66 | 71 | 95 | 104 | 105 => Value,
        0 | 24 | 25 | 26 | 28 | 34 | 49 | 82 | 83 | 84 | 91 | 93 | 94 | 96 | 97 | 98 | 99 | 100
        | 101 | 102 | 111 | 112 | 119 => Preserved,
        _ => Unresolved,
    }
}

pub(super) fn field_target_kind(
    entry: &ActionSemanticInventoryEntry,
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
    option_storage: Option<&str>,
) -> Option<ActionTargetKind> {
    match field_meaning(entry, field, values, option_storage) {
        FieldMeaning::Record(kind) => Some(kind),
        _ => None,
    }
}

pub(super) fn field_meaning(
    entry: &ActionSemanticInventoryEntry,
    field: &ActionSemanticInventoryField,
    values: &BTreeMap<String, i16>,
    option_storage: Option<&str>,
) -> FieldMeaning {
    primary_meaning(
        entry.opcode,
        field.index,
        field_words(entry, values),
        option_storage == Some("option-labels"),
    )
}

pub(super) fn field_words(
    entry: &ActionSemanticInventoryEntry,
    values: &BTreeMap<String, i16>,
) -> [i16; 5] {
    let mut words = [0; 5];
    for field in &entry.fields {
        if let Some(word) = words.get_mut(usize::from(field.index)) {
            let key = super::semantic_field_key(
                entry.form_id.as_deref().unwrap_or_default(),
                &field.internal_name,
                field.index,
            );
            *word = values.get(&key).copied().unwrap_or(0);
        }
    }
    words
}

pub(super) fn primary_meaning(op: i16, index: u8, w: [i16; 5], options: bool) -> FieldMeaning {
    use FieldMeaning::{Preserved, Unresolved};
    let Some(mask) = crate::classic_action_settings::primary_words(op) else {
        return Unresolved;
    };
    if index >= 5 {
        return Unresolved;
    }
    if mask & (1 << index) == 0 {
        return Preserved;
    }
    consumed_word_meaning(op, index, w, options)
}

pub(super) fn primary_meanings(
    op: i16,
    index: u8,
    words: [i16; 5],
    options: bool,
) -> Vec<FieldMeaning> {
    let main = primary_meaning(op, index, words, options);
    match (op, index) {
        (2, 2) if words[4] == 10 => vec![FieldMeaning::Record(ActionTargetKind::Sound), main],
        (74, 1) if words[3] != 0 => vec![FieldMeaning::Value, main],
        _ => vec![main],
    }
}

pub(super) fn primary_references(
    op: i16,
    index: u8,
    words: [i16; 5],
    options: bool,
) -> Vec<ActionTargetKind> {
    primary_meanings(op, index, words, options)
        .into_iter()
        .filter_map(|meaning| {
            let FieldMeaning::Record(kind) = meaning else {
                return None;
            };
            // Most dispatch sites guard sound(value) with value != 0. Actions 43
            // and 74 instead call sound(0), which does look up resource zero.
            if kind == ActionTargetKind::Sound
                && words[usize::from(index)] == 0
                && !matches!(op, 43 | 74)
            {
                return None;
            }
            if kind == ActionTargetKind::Message
                && words[usize::from(index)] == 0
                && matches!(op, 2 | 15 | 16 | 20 | 45 | 48 | 56 | 74 | 85 | 107 | 122)
            {
                return None;
            }
            if matches!(kind, ActionTargetKind::Race | ActionTargetKind::Caste)
                && words[usize::from(index)] == 0
                && matches!(op, 53 | 86)
            {
                return None;
            }
            // Rout Monsters checks each nonzero name ID before scanning combatants.
            // Zero is an empty list slot, unlike Spawn Monsters where record zero is valid.
            if kind == ActionTargetKind::Monster && words[usize::from(index)] == 0 && op == 123 {
                return None;
            }
            if op == 2 && index == 2 && kind == ActionTargetKind::ExtraActionPoint {
                return Some(kind);
            }
            Some(kind)
        })
        .collect()
}

fn consumed_word_meaning(op: i16, index: u8, w: [i16; 5], options: bool) -> FieldMeaning {
    if matches!(op, 33 | 38 | 42 | 46 | 58 | 59) && matches!(index, 3 | 4) {
        return forced_branch_meaning(op, index, w);
    }
    if let Some(meaning) = early_record_meaning(op, index, w, options) {
        return meaning;
    }
    match (op, index) {
        (12 | 13 | 23 | -23 | 92, 0) | (37, 1) | (57, 2) => Record(Map),
        (20 | 45, 0) if w[0] >= 0 => Record(Map),
        (13, 1) if matches!(w[1], 1..=99) => Record(SameMapActionPoint),
        (13, 1) if w[1] != 0 => FieldMeaning::Unresolved,
        (13, 3 | 4) if w[3] > 0 && w[3] <= w[4] => Record(SameMapActionPoint),
        (13, 3 | 4) if w[3] < 0 => FieldMeaning::Unresolved,
        (17 | 18, 0) => Record(Spell),
        (21 | 22 | 38 | 67, 0) | (51, 2) | (65, 1 | 2) => Record(Item),
        (22, 4) if w[2] == 3 => Record(Item),
        (23 | -23, 1) | (92, 1) => Record(RandomRectangle),
        (23 | -23, 3 | 4) if w[usize::from(index)] >= 0 => Record(Battle),
        (31 | 64 | 81, 3 | 4) | (55, 3) | (107, 4) | (126, 3) => Record(ExtraActionPoint),
        (56, 2) if w[2] != -1 => Record(ExtraActionPoint),
        (126, 4) if w[2] == 2 => Record(ExtraActionPoint),
        (21 | 87, 4) if w[2] == 2 => Record(Message),
        (21 | 87, 4) if w[2] != 0 => Value,
        (67, 3) if w[3] == -1 && matches!(w[1], 1 | 2) => Value,
        (21 | 67 | 87, 3 | 4) => record_branch(w[1]),
        (77 | 78 | 86, 3 | 4) if w[usize::from(index)] != 0 => record_branch(w[2]),
        (40, 2) => record_branch(w[1].saturating_sub(1)),
        (72 | 75, 4) => record_branch(w[3]),
        (76, 4) if w[3] != 0 => record_branch(w[2].saturating_sub(1)),
        (85, 1 | 2) => record_branch(w[0]),
        (41, 0) => Record(SimpleEncounter),
        (48, 4) => Record(Treasure),
        (51, 0) if w[0] == 0 => FieldMeaning::CurrentShop,
        (51, 0) if w[0] < 0 => FieldMeaning::Unresolved,
        (51 | 73, 0) => Record(Shop),
        (52, 1) if matches!(w[0], 2 | 7) => Record(Item),
        (50, 2) if w[0] == 0 => Record(Race),
        (50, 2) if w[0] == 2 => Record(Caste),
        (53, 0) => Record(Caste),
        (54, 0) => Record(TimedEncounter),
        (55, 4) if w[1] == 1 => Record(ExtraActionPoint),
        (55, 4) if w[1] == 2 => Record(Message),
        (46 | 76 | 77, 0) => Record(Quest),
        (72, 0 | 1) if w[0] <= w[1] => Record(Quest),
        (73, 1..=4) => restricted_shop_range(index, w),
        (74, 1) if w[3] != 0 => Record(Sound),
        (86, 1) if w[0] == 0 => Record(Caste),
        (86, 1) if w[0] == 1 => Record(Race),
        (87 | 125, 0) | (120, 1) => FieldMeaning::MonsterTag,
        (120, 3) if w[3] != -1 => Record(MonsterAppearance),
        (124, 1) | (123, 0..=4) => Record(Monster),
        _ => Value,
    }
}

fn early_record_meaning(op: i16, index: u8, w: [i16; 5], options: bool) -> Option<FieldMeaning> {
    Some(match (op, index) {
        (2 | 48 | 56 | 107, 0) => Record(Battle),
        (2 | 48 | 56 | 107, 1) if w[1] != 0 => Record(Battle),
        (2, 2) if w[4] == 10 => Record(ExtraActionPoint),
        (2 | 48 | 107, 2) | (15 | 16 | 20 | 43 | 45 | 56 | 85 | 124, 3) | (122, 1) => Record(Sound),
        (2 | 48 | 107, 3) | (15 | 16 | 20 | 45 | 56 | 74 | 85, 4) | (19, 0 | 1) | (122, 0) => {
            Record(Message)
        }
        (3, 2) => choice_destination(w[1]),
        (3, 3 | 4) if w[3] != 0 => Record(if options { OptionLabel } else { Message }),
        (7, 0) if w[0] >= 0 => Record(Map),
        (7, 1) => patch_destination(w[0]),
        (7, 2) => Record(ExtraActionPoint),
        _ => return None,
    })
}

fn restricted_shop_range(index: u8, words: [i16; 5]) -> FieldMeaning {
    let low = if index <= 2 { words[1] } else { words[3] };
    if low != 0 { Record(Item) } else { Value }
}

fn forced_branch_meaning(op: i16, index: u8, words: [i16; 5]) -> FieldMeaning {
    match index {
        3 if forcebranch_active(op, words) => local_branch(words[2]),
        4 if forcebranch_active(op, words) && matches!(words[2], 1 | 2) => CodePosition,
        _ => Value,
    }
}

fn patch_destination(level: i16) -> FieldMeaning {
    match level {
        -1 => FieldMeaning::Record(ActionTargetKind::SimpleEncounter),
        -2 => FieldMeaning::Record(ActionTargetKind::ComplexEncounter),
        0.. => FieldMeaning::Record(ActionTargetKind::SameMapActionPoint),
        _ => FieldMeaning::Unresolved,
    }
}

fn forcebranch_active(op: i16, w: [i16; 5]) -> bool {
    match op {
        42 | 58 | 59 => w[1] == 1,
        33 | 38 | 46 => matches!(w[1], 0..=2),
        _ => false,
    }
}

fn record_branch(mode: i16) -> FieldMeaning {
    use ActionTargetKind::*;
    match mode {
        0 => FieldMeaning::Record(ExtraActionPoint),
        1 => FieldMeaning::Record(SimpleEncounter),
        2 => FieldMeaning::Record(ComplexEncounter),
        _ => FieldMeaning::Value,
    }
}

fn local_branch(mode: i16) -> FieldMeaning {
    match mode {
        0 => FieldMeaning::Record(ActionTargetKind::ExtraActionPoint),
        1 => FieldMeaning::SimpleResult,
        2 => FieldMeaning::ComplexResult,
        _ => FieldMeaning::Value,
    }
}

fn choice_destination(mode: i16) -> FieldMeaning {
    match mode {
        1 => FieldMeaning::Record(ActionTargetKind::ExtraActionPoint),
        2 => FieldMeaning::SimpleResult,
        3 => FieldMeaning::ComplexResult,
        _ => FieldMeaning::Value,
    }
}
