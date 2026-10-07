use super::authoring_flow_tests::{named, word};
use super::*;
use crate::model::{ActionPoint, LevelType, MapLevel, ProjectSnapshot, StableId};
use std::collections::BTreeMap;

fn maps_and_matching_ap_numbers() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("context".into()));
    for (name, kind, index) in [
        ("land:0", LevelType::Land, 0),
        ("land:1", LevelType::Land, 1),
        ("dungeon:1", LevelType::Dungeon, 1),
    ] {
        snapshot.world.maps.push(MapLevel {
            identity: StableId(name.into()),
            level_type: kind,
            native_index: index,
            name: name.into(),
            tiles: vec![],
            runtime: None,
        });
        snapshot.world.action_points.push(ActionPoint {
            identity: StableId(format!("ap:{name}:33")),
            level_type: kind,
            level_index: index,
            record_index: 33,
            classic_door_id: 0,
            coordinate: None,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: vec![],
        });
    }
    snapshot
}

fn query(opcode: i16, words: [i16; 5]) -> ActionFormDescribeQuery {
    let form = action_definition(&format!("realmz.action.{opcode}"))
        .unwrap()
        .form_id
        .unwrap();
    ActionFormDescribeQuery {
        action_identity: format!("realmz.action.{opcode}"),
        target_native_id: 0,
        values: decode_form_values(&form, words).unwrap(),
        secondary_values: BTreeMap::new(),
        context: ActionFormContext {
            target_context: ActionTargetContext {
                map_identity: Some(StableId("land:0".into())),
                level_type: Some(LevelType::Land),
            },
            script_kind: Some("action-point".into()),
            ..Default::default()
        },
    }
}

#[test]
fn draft_map_kind_and_level_control_both_preview_and_picker() {
    let snapshot = maps_and_matching_ap_numbers();
    for (mode, expected) in [
        (0, "land:1"),
        (1, "land:1"),
        (2, "dungeon:1"),
        (-1, "dungeon:1"),
    ] {
        let description = describe_action_form(&snapshot, &query(7, [1, 33, 0, mode, 0])).unwrap();
        let field = named(&description, "targetRecord");
        assert_eq!(
            field.target_context.map_identity.as_ref().unwrap().0,
            expected
        );
        assert_eq!(
            field.preview.as_ref().unwrap().identity.0,
            format!("ap:{expected}:33")
        );
        let page = list_targets(
            &snapshot,
            &ActionTargetQuery {
                kind: field.target_kind.unwrap(),
                context: field.target_context.clone(),
                search: String::new(),
                cursor: None,
                limit: 40,
            },
        )
        .unwrap();
        assert_eq!(page.total, 1);
        assert_eq!(
            page.items[0].identity,
            field.preview.as_ref().unwrap().identity
        );
    }
    let description = describe_action_form(&snapshot, &query(7, [99, 33, 0, 1, 0])).unwrap();
    assert!(named(&description, "targetRecord").preview.is_none());
}

#[test]
fn absent_caller_context_cannot_choose_a_same_numbered_record_from_another_map() {
    let snapshot = maps_and_matching_ap_numbers();
    let mut query = query(7, [1, 33, 0, 0, 0]);
    query.context = Default::default();
    let description = describe_action_form(&snapshot, &query).unwrap();
    assert!(named(&description, "targetRecord").preview.is_none());
    for kind in [
        ActionTargetKind::SameMapActionPoint,
        ActionTargetKind::Map,
        ActionTargetKind::RandomRectangle,
    ] {
        let page = list_targets(
            &snapshot,
            &ActionTargetQuery {
                kind,
                context: Default::default(),
                search: String::new(),
                cursor: None,
                limit: 40,
            },
        )
        .unwrap();
        assert!(page.items.is_empty());
    }
}

#[test]
fn each_map_consuming_opcode_uses_its_classic_level_discriminator() {
    let snapshot = maps_and_matching_ap_numbers();
    for (opcode, words, index, expected) in [
        (12, [1, 0, 0, 0, -1], 0, "dungeon:1"),
        (13, [1, 33, 0, -1, 0], 1, "dungeon:1"),
        (20, [1, 0, 0, 0, 0], 0, "land:1"),
        (45, [1, 0, 0, 0, 0], 0, "land:1"),
        (23, [1, 0, 0, 0, 0], 1, "land:1"),
        (-23, [1, 0, 0, 0, 0], 1, "dungeon:1"),
        (37, [0, 1, 0, 0, 0], 1, "dungeon:1"),
        (37, [1, 1, 0, 0, 0], 1, "land:1"),
        (57, [0, 0, 1, 0, 0], 2, "land:1"),
        (92, [1, 0, 1, 0, 0], 1, "dungeon:1"),
    ] {
        let description = describe_action_form(&snapshot, &query(opcode, words)).unwrap();
        assert_eq!(
            word(&description, index)
                .target_context
                .map_identity
                .as_ref()
                .unwrap()
                .0,
            expected,
            "opcode {opcode}"
        );
    }
}
