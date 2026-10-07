use super::{ClassicAction, NativeRecordId, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleEncounter {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub actions: Vec<ClassicAction>,
    pub choice_results: [i8; 4],
    pub can_back_out: bool,
    pub max_times: i8,
    pub caste_success: i8,
    pub prompt_message_native_id: i16,
    pub texts: [String; 4],
    #[serde(default)]
    pub authored: bool,
}

impl SimpleEncounter {
    pub fn has_semantics(&self) -> bool {
        if self.authored {
            return true;
        }
        let results_are_structural = self
            .choice_results
            .iter()
            .enumerate()
            .all(|(slot, result)| (0..=4).contains(result) || (slot == 0 && *result == -4));
        results_are_structural
            && (self.choice_results[0] == -4
                || self
                    .texts
                    .iter()
                    .zip(self.choice_results)
                    .any(|(label, result)| {
                        simple_encounter_text_is_authored(label) && (1..=4).contains(&result)
                    }))
    }
}

fn simple_encounter_text_is_authored(text: &str) -> bool {
    !text.trim().is_empty()
        && text
            .chars()
            .all(|character| !character.is_control() || matches!(character, '\r' | '\n' | '\t'))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComplexEncounter {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub actions: Vec<ClassicAction>,
    pub action_result: i8,
    pub word_result: i8,
    pub groups: [i8; 8],
    pub spell_ids: [i16; 10],
    pub spell_results: [i8; 10],
    pub item_ids: [i16; 5],
    pub item_results: [i8; 5],
    pub can_back_out: bool,
    pub thief: bool,
    pub max_times: i8,
    pub caste_success: i8,
    pub thief_success: i8,
    pub thief_fail: i8,
    pub prompt_message_native_id: i16,
    pub texts: [String; 9],
    #[serde(default)]
    pub authored: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RogueEncounter {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub type_flags: [bool; 10],
    pub modifiers: [i8; 8],
    pub success_codes: [i8; 8],
    pub failure_codes: [i8; 8],
    pub success_text: [i16; 8],
    pub failure_text: [i16; 8],
    pub success_sounds: [i16; 8],
    pub failure_sounds: [i16; 8],
    pub spell: i16,
    pub low_damage: i16,
    pub high_damage: i16,
    pub tumblers: i16,
    pub prompts: [i16; 3],
    pub prompt_sounds: [i16; 3],
    #[serde(default)]
    pub authored: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TimedEncounterLocationKind {
    Any,
    Land,
    Dungeon,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimedEncounter {
    pub identity: StableId,
    pub native_id: NativeRecordId,
    pub day: i16,
    pub increment: i16,
    pub percent: i16,
    pub door: i16,
    pub required_level: i16,
    pub required_random_rect: i16,
    pub required_x: i16,
    pub required_y: i16,
    pub required_item: i16,
    pub required_quest: i16,
    pub location_kind: TimedEncounterLocationKind,
    #[serde(default)]
    pub authored: bool,
}

pub(super) fn normalize(
    simple: &mut [SimpleEncounter],
    complex: &mut [ComplexEncounter],
    rogue: &mut [RogueEncounter],
    timed: &mut [TimedEncounter],
) {
    simple.sort_by_key(|encounter| encounter.native_id);
    complex.sort_by_key(|encounter| encounter.native_id);
    rogue.sort_by_key(|encounter| encounter.native_id);
    timed.sort_by_key(|encounter| encounter.native_id);
}
