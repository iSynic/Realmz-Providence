use super::*;

#[test]
fn race_rules_are_revisioned_and_classic_ids_remain_unique() {
    let mut session = EditorSession::new(sample_snapshot());
    let rule = human_race_rule();
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision: Revision(0),
            command: EditorCommand::UpsertRaceRule {
                rule: Box::new(rule.clone()),
            },
        })
        .expect("upsert race rule");
    assert_eq!(
        projection.changed_entities,
        std::slice::from_ref(&rule.definition.id)
    );

    let mut duplicate = rule;
    duplicate.definition.id = StableId("classic.race.alias".into());
    assert_eq!(
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(1),
                command: EditorCommand::UpsertRaceRule {
                    rule: Box::new(duplicate),
                },
            })
            .expect_err("Classic ID must remain unique"),
        SessionError::DuplicateClassicRuleId {
            kind: "race",
            classic_id: 1,
        }
    );
}

fn human_race_rule() -> SourcedRaceRule {
    SourcedRaceRule {
        source: "controlled fixture".into(),
        source_blob: None,
        definition: RaceRuleDefinition {
            id: StableId("classic.race.1".into()),
            classic_id: 1,
            name: "Human".into(),
            description: String::new(),
            eligible_caste_ids: Vec::new(),
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
