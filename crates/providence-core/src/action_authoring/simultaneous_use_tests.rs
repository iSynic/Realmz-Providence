use super::authoring_flow_tests::named;
use super::*;
use crate::model::{
    ClassicAction, ExtraActionPoint, ExtraCodeRow, NativeRecordId, ProjectSnapshot, StableId,
};
use crate::references::TargetKind;

#[test]
fn battle_word_two_is_sound_and_after_combat_xap_and_zero_only_suppresses_sound() {
    // newland.c:1461-1505 guards sound with word2, but mode10 always calls loaddoor2(word2).
    for value in [0, 33] {
        let words = [1, 0, value, 0, 10];
        let fields = settings_target_fields(2, words, false);
        assert_eq!(
            fields
                .iter()
                .filter(|field| field.index == 2)
                .map(|field| field.kind)
                .collect::<Vec<_>>(),
            if value == 0 {
                vec![ActionTargetKind::ExtraActionPoint]
            } else {
                vec![ActionTargetKind::Sound, ActionTargetKind::ExtraActionPoint]
            }
        );
        let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-effects".into()));
        snapshot.extra_codes.push(ExtraCodeRow {
            native_id: NativeRecordId(5),
            values: words,
        });
        snapshot.extra_action_points.push(ExtraActionPoint {
            identity: StableId("extra-action-point:7".into()),
            native_id: NativeRecordId(7),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![ClassicAction {
                slot: 0,
                raw_opcode: 2,
                target_native_id: 5,
            }],
        });
        let refs = crate::session::references_for(&snapshot);
        let sound = refs
            .iter()
            .filter(|r| r.source.0 == "extra-action-point:7" && r.target_kind == TargetKind::Sound)
            .count();
        let xap = refs
            .iter()
            .find(|r| {
                r.source.0 == "extra-action-point:7"
                    && r.target_kind == TargetKind::ExtraActionPoint
            })
            .unwrap();
        assert_eq!(sound, usize::from(value != 0));
        assert_eq!(xap.target_id, value.to_string());
        assert_eq!(xap.byte_provenance.as_ref().unwrap().byte_start, 54);
    }
}

#[test]
fn spell_points_roll_remains_a_quantity_when_its_number_also_selects_sound() {
    // newland.c:2985-2993 reads word1 in both sound and randrange; misc.c:1875 accepts sound0.
    for switch in [i16::MIN, -1, 0, 1, 33, i16::MAX] {
        for low in [0, 33] {
            let query = ActionFormDescribeQuery {
                action_identity: "realmz.action.74".into(),
                target_native_id: 5,
                values: decode_form_values("spell-points", [1, low, 50, switch, 0]).unwrap(),
                secondary_values: Default::default(),
                context: Default::default(),
            };
            let snapshot = ProjectSnapshot::new_authored(StableId("roll-effects".into()));
            let description = describe_action_form(&snapshot, &query).unwrap();
            let field = named(&description, "lowOrSound");
            assert_eq!(field.control, FormControl::Integer);
            assert_eq!(field.uses[0].role, ActionFieldRole::Quantity);
            assert_eq!(field.uses.len(), if switch == 0 { 1 } else { 2 });
            if switch != 0 {
                assert_eq!(field.uses[1].target_kind, Some(ActionTargetKind::Sound));
            }
            assert_eq!(named(&description, "playSound").target_kind, None);
            assert!(
                named(&description, "playSound")
                    .choices
                    .iter()
                    .any(|choice| choice.value == switch)
            );
        }
    }
}
