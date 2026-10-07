use super::*;

pub(super) fn complex_encounter() -> crate::model::ComplexEncounter {
    crate::model::ComplexEncounter {
        identity: StableId("complex-encounter:2".into()),
        native_id: NativeRecordId(2),
        actions: vec![ClassicAction {
            slot: 17,
            raw_opcode: -2,
            target_native_id: 31,
        }],
        action_result: 1,
        word_result: 3,
        groups: [1, 0, -1, 0, 0, 0, 0, 0],
        spell_ids: [0; 10],
        spell_results: [0; 10],
        item_ids: [0; 5],
        item_results: [0; 5],
        can_back_out: true,
        thief: false,
        max_times: 2,
        caste_success: 4,
        thief_success: 0,
        thief_fail: 7,
        prompt_message_native_id: 0,
        texts: std::array::from_fn(|slot| {
            if slot == 8 {
                "moonstone".into()
            } else {
                format!("Action {slot}")
            }
        }),
        authored: true,
    }
}
