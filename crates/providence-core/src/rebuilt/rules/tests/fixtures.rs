use crate::model::{
    CasteRuleDefinition, ProjectSnapshot, RaceRuleDefinition, SourcedCasteRule, SourcedRaceRule,
    StableId,
};

pub(crate) fn complete_rule_snapshot() -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rules".into()));
    snapshot.race_rules = (1..=30).map(race_rule).collect();
    snapshot.caste_rules = (1..=30).map(caste_rule).collect();
    snapshot
}

fn race_rule(classic_id: u8) -> SourcedRaceRule {
    SourcedRaceRule {
        source: "controlled standard-rule fixture".into(),
        source_blob: None,
        definition: RaceRuleDefinition {
            id: StableId(format!("classic.race.{classic_id}")),
            classic_id,
            name: format!("Race {classic_id}"),
            description: String::new(),
            eligible_caste_ids: vec![StableId("classic.caste.1".into())],
            hit_modifiers: vec![0; 8],
            ability_bonuses: vec![0; 14],
            save_bonuses: vec![0; 8],
            attribute_bonuses: vec![0; 6],
            attribute_limits: vec![18; 12],
            condition_levels: vec![0; 40],
            age_ranges: vec![vec![1, 100]; 5],
            age_changes: vec![vec![0; 15]; 5],
            maximum_age: 100,
            does_not_die: false,
            base_movement: 12,
            magic_resistance: 0,
            two_hand_bonus: 0,
            missile_bonus: 0,
            base_attacks: 1,
            maximum_attacks: 4,
            can_regenerate: false,
            default_icon_set: 1,
            item_category_masks: vec![0, 0],
            descriptor_flags: 0,
        },
    }
}

fn caste_rule(classic_id: u8) -> SourcedCasteRule {
    SourcedCasteRule {
        source: "controlled standard-rule fixture".into(),
        source_blob: None,
        definition: CasteRuleDefinition {
            id: StableId(format!("classic.caste.{classic_id}")),
            classic_id,
            name: format!("Caste {classic_id}"),
            description: String::new(),
            eligible_race_ids: if classic_id == 1 {
                (1..=30)
                    .map(|race_id| StableId(format!("classic.race.{race_id}")))
                    .collect()
            } else {
                Vec::new()
            },
            initial_ability_values: vec![0; 14],
            level_ability_dice: vec![0; 14],
            victory_thresholds: vec![100; 30],
            save_bonuses: vec![0; 8],
            attribute_bonuses: vec![0; 6],
            attribute_limits: vec![18; 12],
            condition_levels: vec![0; 40],
            stamina_dice: vec![1, 8],
            strength_values: vec![1, 6],
            dodge_values: vec![1, 6],
            to_hit_values: vec![1, 6],
            missile_values: vec![1, 6],
            hand_to_hand_values: vec![1, 6],
            spellcaster_rows: vec![vec![0; 3]; 4],
            attack_levels: vec![1; 10],
            starting_item_ids: Vec::new(),
            caste_class: 1,
            minimum_age_group: 0,
            movement_bonus: 0,
            magic_resistance_multiplier: 0,
            two_hand_bonus: 0,
            maximum_stamina_bonus: 0,
            bonus_attacks: 0,
            maximum_attacks: 4,
            start_money: 100,
            can_use_missile: true,
            gets_missile_bonus: false,
            default_icon: 1,
            item_category_masks: vec![0, 0],
        },
    }
}
