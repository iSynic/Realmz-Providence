use super::*;

pub(super) fn action(slot: u8, opcode: i16, target: i16) -> ClassicAction {
    ClassicAction {
        slot,
        raw_opcode: opcode,
        target_native_id: target,
    }
}

pub(super) fn xap(id: u32, actions: Vec<ClassicAction>) -> ExtraActionPoint {
    ExtraActionPoint {
        identity: StableId(format!("extra-action-point:{id}")),
        native_id: NativeRecordId(id),
        classic_door_id: id as i32,
        post_action_level: 0,
        post_action_x: 0,
        post_action_y: 0,
        chance_percent: 100,
        actions,
    }
}

pub(super) fn monster(id: u32, death_macro: i16) -> MonsterRecord {
    MonsterRecord {
        identity: StableId(format!("monster:0:{id}")),
        native_id: NativeRecordId(id),
        hit_dice: 0,
        stamina_bonus: 0,
        agility: 0,
        name_id: 0,
        movement_max: 0,
        armor: 0,
        magic_resistance: 0,
        required_weapon: 0,
        traitor: 0,
        size: 0,
        type_flags: vec![],
        attack_count: 0,
        magic_attack_count: 0,
        attacks: vec![],
        damage_bonus: 0,
        cast_percent: 0,
        run_percent: 0,
        surrender_percent: 0,
        missile_percent: 0,
        can_summon: 0,
        saves: vec![],
        spell_immunities: vec![],
        money: vec![],
        spells: vec![],
        items: vec![],
        weapon: 0,
        icon_id: 0,
        spell_points: 0,
        experience: 0,
        stamina: 0,
        stamina_max: 0,
        underneath: vec![],
        target: 0,
        guarding: 0,
        not_on_menu: false,
        been_attacked: 0,
        movement: 0,
        magic_to_hit: 0,
        conditions: vec![],
        left_right: 0,
        up_down: 0,
        attack_number: 0,
        bonus_attack: 0,
        death_macro,
        max_spell_points: 0,
        display_name: String::new(),
        authored: false,
    }
}

pub(super) fn door_item(target: i32) -> SourcedScenarioItemRule {
    SourcedScenarioItemRule {
        record_index: 0,
        source: "Data NI record 0".into(),
        source_blob: BlobId(format!("sha256:{}", "0".repeat(64))),
        text_source_blob: None,
        definition: ItemRuleDefinition {
            id: StableId("scenario-item:800".into()),
            classic_id: 800,
            name: String::new(),
            unidentified_name: String::new(),
            description: String::new(),
            icon_id: 0,
            item_type: 23,
            strength_bonus: 0,
            blunt: 0,
            hands: 0,
            luck_bonus: 0,
            movement_bonus: 0,
            armor_bonus: 0,
            magic_resistance_bonus: 0,
            damage_bonus: 0,
            spell_point_bonus: 0,
            sound_id: 0,
            weight: 0,
            cost: 0,
            initial_charges: 0,
            cursed_item_id: None,
            magical: false,
            item_category_mask_low: 0,
            item_category_mask_high: 0,
            race_restrictions: 0,
            caste_restrictions: 0,
            specific_race_id: None,
            specific_caste_id: None,
            race_class_only: 0,
            caste_class_only: 0,
            versus_small: 0,
            versus_large: 0,
            heat: 0,
            cold: 0,
            electric: 0,
            versus_undead: 0,
            versus_demon_devil: 0,
            versus_evil: 0,
            special: [0, 0, 0, 0, target],
            weight_per_charge: 0,
            drop_on_empty: false,
        },
    }
}

pub(super) fn fixed_point_fixture() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("reachability".into()));
    snapshot.world.action_points.push(ActionPoint {
        identity: StableId("action-point:land:0:0".into()),
        level_type: LevelType::Land,
        level_index: 0,
        record_index: 0,
        classic_door_id: 1,
        coordinate: Some(MapCoordinate { x: 1, y: 1 }),
        post_action_level: 0,
        post_action_x: 1,
        post_action_y: 1,
        chance_percent: 100,
        actions: vec![action(0, 39, 1)],
    });
    snapshot.extra_action_points = vec![
        xap(1, vec![action(0, 56, 10)]),
        xap(4, vec![action(0, 39, 6)]),
        xap(5, vec![]),
        xap(6, vec![]),
    ];
    snapshot.extra_codes.push(ExtraCodeRow {
        native_id: NativeRecordId(10),
        values: [2, 2, 4, 0, 0],
    });
    let mut grid = vec![0; 169];
    grid[0] = -3;
    snapshot.battles.push(BattleRecord {
        identity: StableId("battle:2".into()),
        native_id: NativeRecordId(2),
        grid,
        distance: 1,
        message_before: 0,
        message_after: 0,
        battle_macro: -4,
        authored: false,
    });
    snapshot.monster_sets.push(MonsterSet {
        set_id: 0,
        native_path: "Data MD".into(),
        monsters: vec![monster(3, 5)],
    });

    snapshot
}

pub(super) fn root_fixture() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("reachability".into()));
    snapshot.extra_action_points = (0..=4).map(|id| xap(id, vec![])).collect();
    let mut application = ScenarioApplicationContract::default();
    application.hooks.start_game = Some(StableId("extra-action-point:1".into()));
    snapshot.scenario_application = Some(application);
    snapshot.timed_encounters = root_timed_rows();
    snapshot.world.maps.push(root_random_map());
    snapshot.scenario_item_rules.push(door_item(4));
    snapshot.battles = (1..=3)
        .map(|id| BattleRecord {
            identity: StableId(format!("battle:{id}")),
            native_id: NativeRecordId(id),
            grid: vec![0; 169],
            distance: 1,
            message_before: 0,
            message_after: 0,
            battle_macro: 0,
            authored: false,
        })
        .collect();

    snapshot
}

fn root_timed_rows() -> Vec<TimedEncounter> {
    vec![
        TimedEncounter {
            identity: StableId("timed-encounter:0".into()),
            native_id: NativeRecordId(0),
            day: 1,
            increment: 0,
            percent: 100,
            door: 2,
            required_level: 0,
            required_random_rect: 0,
            required_x: 0,
            required_y: 0,
            required_item: 0,
            required_quest: 0,
            location_kind: TimedEncounterLocationKind::Any,
            authored: false,
        },
        TimedEncounter {
            identity: StableId("timed-encounter:1".into()),
            native_id: NativeRecordId(1),
            day: 0,
            increment: 0,
            percent: 100,
            door: 99,
            required_level: 0,
            required_random_rect: 0,
            required_x: 0,
            required_y: 0,
            required_item: 0,
            required_quest: 0,
            location_kind: TimedEncounterLocationKind::Any,
            authored: false,
        },
    ]
}

fn root_random_map() -> MapLevel {
    MapLevel {
        identity: StableId("land:0".into()),
        level_type: LevelType::Land,
        native_index: 0,
        name: String::new(),
        tiles: vec![],
        runtime: Some(MapRuntimeMetadata {
            source: "Data RD level 0".into(),
            source_blob: None,
            dark: false,
            uses_los: false,
            landlook: None,
            base_scale: None,
            tileset_id: StableId("tileset".into()),
            base_tile: None,
            random_rectangles: vec![RandomRectangle {
                identity: StableId("land:0:rect:0".into()),
                top: 0,
                left: 0,
                bottom: 1,
                right: 1,
                chance_ten_thousand: 1,
                battle_range: [-3, -1],
                random_doors: [3, 0, 0],
                random_door_percent: [1, 0, 0],
                only: false,
                option: 0,
                sound_id: 0,
                text_id: 0,
            }],
        }),
    }
}
