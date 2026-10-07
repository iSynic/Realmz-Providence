use super::{RecordRow, SUMMARY_CHARACTERS};
use providence_core::{
    codecs::{
        ACTION_POINT_LEVEL_BYTES, ACTION_POINT_RECORD_BYTES, MONSTER_DESCRIPTION_RECORD_BYTES,
        MONSTER_RECORD_BYTES, NativeFileFamily, descriptor,
    },
    model::{LevelType, ProjectSnapshot, StableId},
};

pub(super) fn append_messages(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for message in &snapshot.messages {
        push_fixed(
            rows,
            message.identity.clone(),
            format!("Message {}", message.native_id.0),
            "message",
            NativeFileFamily::ScenarioMessages,
            u64::from(message.native_id.0),
            "message",
            "message.open",
            summary(&message.text),
        );
    }
}

pub(super) fn append_option_labels(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for option in &snapshot.option_labels {
        push_fixed(
            rows,
            option.identity.clone(),
            format!("Option Label {}", option.native_id.0),
            "option-label",
            NativeFileFamily::OptionLabels,
            u64::from(option.native_id.0),
            "option-label",
            "option-label.open",
            summary(&option.text),
        );
    }
}

pub(super) fn append_world_maps(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for map in &snapshot.world.maps {
        let family = match map.level_type {
            LevelType::Land => NativeFileFamily::LandMaps,
            LevelType::Dungeon => NativeFileFamily::DungeonMaps,
        };
        push_fixed(
            rows,
            map.identity.clone(),
            map.name.clone(),
            "map",
            family,
            u64::from(map.native_index),
            "map",
            "map.open",
            format!(
                "{:?} level {}; 90 x 90 cells",
                map.level_type, map.native_index
            ),
        );
    }
}

pub(super) fn append_world_action_points(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for action_point in &snapshot.world.action_points {
        let family = match action_point.level_type {
            LevelType::Land => NativeFileFamily::LandActionPoints,
            LevelType::Dungeon => NativeFileFamily::DungeonActionPoints,
        };
        let byte_start = u64::from(action_point.level_index) * ACTION_POINT_LEVEL_BYTES as u64
            + u64::from(action_point.record_index) * ACTION_POINT_RECORD_BYTES as u64;
        rows.push(RecordRow {
            identity: action_point.identity.clone(),
            label: format!(
                "{:?} Action Point {}:{}",
                action_point.level_type, action_point.level_index, action_point.record_index
            ),
            record_type: "action-point",
            native_path: descriptor(family).native_path.into(),
            record_index: u64::from(action_point.level_index) * 100
                + u64::from(action_point.record_index),
            byte_start,
            byte_end: byte_start + ACTION_POINT_RECORD_BYTES as u64,
            document_kind: "action-point",
            open_command: "action-point.open",
            summary: action_point.coordinate.map_or_else(
                || "Unplaced fixed record".into(),
                |coordinate| format!("Placed at {}, {}", coordinate.x, coordinate.y),
            ),
        });
    }
}

pub(super) fn append_extra_action_points(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for extra in &snapshot.extra_action_points {
        push_fixed(
            rows,
            extra.identity.clone(),
            format!("Extra Action Point {}", extra.native_id.0),
            "extra-action-point",
            NativeFileFamily::ExtraActionPoints,
            u64::from(extra.native_id.0),
            "extra-action-point",
            "extra-action-point.open",
            format!("{} action slots", extra.actions.len()),
        );
    }
}

pub(super) fn append_extra_codes(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for code in &snapshot.extra_codes {
        let identity = StableId(format!("extra-code:{}", code.native_id.0));
        push_fixed(
            rows,
            identity,
            format!("Extra Code {}", code.native_id.0),
            "extra-code",
            NativeFileFamily::ExtraCodes,
            u64::from(code.native_id.0),
            "extra-code",
            "extra-code.open",
            format!("Five signed operands: {:?}", code.values),
        );
    }
}

pub(super) fn append_world_player_maps(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for player_map in &snapshot.world.player_maps {
        push_fixed(
            rows,
            player_map.identity.clone(),
            format!("Player Map {}", player_map.native_id.0),
            "player-map",
            NativeFileFamily::PlayerMaps,
            u64::from(player_map.native_id.0),
            "player-map",
            "player-map.open",
            summary(&player_map.note),
        );
    }
}

pub(super) fn append_simple_encounters(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for encounter in &snapshot.simple_encounters {
        push_fixed(
            rows,
            encounter.identity.clone(),
            format!("Simple Encounter {}", encounter.native_id.0),
            "simple-encounter",
            NativeFileFamily::SimpleEncounters,
            u64::from(encounter.native_id.0),
            "simple-encounter",
            "simple-encounter.open",
            format!(
                "Prompt message {}; {} actions",
                encounter.prompt_message_native_id,
                encounter.actions.len()
            ),
        );
    }
}

pub(super) fn append_complex_encounters(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for encounter in &snapshot.complex_encounters {
        push_fixed(
            rows,
            encounter.identity.clone(),
            format!("Complex Encounter {}", encounter.native_id.0),
            "complex-encounter",
            NativeFileFamily::ComplexEncounters,
            u64::from(encounter.native_id.0),
            "complex-encounter",
            "complex-encounter.open",
            format!(
                "Prompt message {}; {} actions",
                encounter.prompt_message_native_id,
                encounter.actions.len()
            ),
        );
    }
}

pub(super) fn append_rogue_encounters(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for encounter in &snapshot.rogue_encounters {
        push_fixed(
            rows,
            encounter.identity.clone(),
            format!("Rogue Encounter {}", encounter.native_id.0),
            "rogue-encounter",
            NativeFileFamily::RogueEncounters,
            u64::from(encounter.native_id.0),
            "rogue-encounter",
            "rogue-encounter.open",
            format!(
                "{} enabled test flags",
                encounter.type_flags.iter().filter(|flag| **flag).count()
            ),
        );
    }
}

pub(super) fn append_timed_encounters(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for encounter in &snapshot.timed_encounters {
        push_fixed(
            rows,
            encounter.identity.clone(),
            format!("Timed Encounter {}", encounter.native_id.0),
            "timed-encounter",
            NativeFileFamily::TimedEncounters,
            u64::from(encounter.native_id.0),
            "timed-encounter",
            "timed-encounter.open",
            format!(
                "Day {}; increment {}; {}%",
                encounter.day, encounter.increment, encounter.percent
            ),
        );
    }
}

pub(super) fn append_race_rules(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for rule in &snapshot.race_rules {
        push_fixed(
            rows,
            rule.definition.id.clone(),
            providence_core::rule_presentation::record_label(
                providence_core::session::rule_authoring::RuleKind::Race,
                rule.definition.classic_id,
                &rule.definition.name,
            ),
            "race",
            NativeFileFamily::RaceRules,
            u64::from(rule.definition.classic_id.saturating_sub(1)),
            "race-rule",
            "race-rule.open",
            format!(
                "Race {}",
                providence_core::rule_presentation::author_number(rule.definition.classic_id)
                    .unwrap_or(rule.definition.classic_id)
            ),
        );
    }
}

pub(super) fn append_caste_rules(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for rule in &snapshot.caste_rules {
        push_fixed(
            rows,
            rule.definition.id.clone(),
            providence_core::rule_presentation::record_label(
                providence_core::session::rule_authoring::RuleKind::Caste,
                rule.definition.classic_id,
                &rule.definition.name,
            ),
            "caste",
            NativeFileFamily::CasteRules,
            u64::from(rule.definition.classic_id.saturating_sub(1)),
            "caste-rule",
            "caste-rule.open",
            format!(
                "Caste {}",
                providence_core::rule_presentation::author_number(rule.definition.classic_id)
                    .unwrap_or(rule.definition.classic_id)
            ),
        );
    }
}

pub(super) fn append_item_rules(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for item in &snapshot.item_rules {
        push_fixed(
            rows,
            item.definition.id.clone(),
            item.definition.name.clone(),
            "standard-item",
            NativeFileFamily::ItemDefinitions,
            u64::try_from(i32::from(item.definition.classic_id).saturating_sub(1)).unwrap_or(0),
            "item",
            "item.open",
            format!(
                "Classic item {}; type {}",
                item.definition.classic_id, item.definition.item_type
            ),
        );
    }
}

pub(super) fn append_scenario_item_rules(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for item in &snapshot.scenario_item_rules {
        push_fixed(
            rows,
            item.definition.id.clone(),
            item.definition.name.clone(),
            "scenario-item",
            NativeFileFamily::ScenarioItemDefinitions,
            u64::from(item.record_index),
            "item",
            "item.open",
            format!(
                "Scenario item {}; type {}",
                item.definition.classic_id, item.definition.item_type
            ),
        );
    }
}

pub(super) fn append_standard_spells(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for spell in &snapshot.standard_spells {
        push_fixed(
            rows,
            spell.definition.id.clone(),
            spell.definition.name.clone(),
            "standard-spell",
            NativeFileFamily::StandardSpellDefinitions,
            u64::from(spell.definition.record_index),
            "spell-rule",
            "spell-rule.open",
            format!("Classic spell {}", spell.definition.classic_id),
        );
    }
}

pub(super) fn append_scenario_spells(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for spell in &snapshot.scenario_spells {
        push_fixed(
            rows,
            spell.definition.id.clone(),
            spell.definition.name.clone(),
            "scenario-spell",
            NativeFileFamily::ScenarioSpellDefinitions,
            u64::from(spell.definition.record_index),
            "spell-rule",
            "spell-rule.open",
            format!("Scenario spell {}", spell.definition.classic_id),
        );
    }
}

pub(super) fn append_monster_sets(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for set in &snapshot.monster_sets {
        for monster in &set.monsters {
            let byte_start = u64::from(monster.native_id.0) * MONSTER_RECORD_BYTES as u64;
            rows.push(RecordRow {
                identity: monster.identity.clone(),
                label: monster.display_name.clone(),
                record_type: "monster",
                native_path: set.native_path.clone(),
                record_index: u64::from(monster.native_id.0),
                byte_start,
                byte_end: byte_start + MONSTER_RECORD_BYTES as u64,
                document_kind: "monster",
                open_command: "monster.open",
                summary: format!(
                    "Set {}; icon {}; HD {}",
                    set.set_id, monster.icon_id, monster.hit_dice
                ),
            });
        }
    }
}

pub(super) fn append_monster_descriptions(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for description in &snapshot.monster_descriptions {
        let byte_start =
            u64::from(description.native_id.0) * MONSTER_DESCRIPTION_RECORD_BYTES as u64;
        rows.push(RecordRow {
            identity: description.identity.clone(),
            label: format!("Monster Description {}", description.native_id.0),
            record_type: "monster-description",
            native_path: descriptor(NativeFileFamily::MonsterDescriptions)
                .native_path
                .into(),
            record_index: u64::from(description.native_id.0),
            byte_start,
            byte_end: byte_start + MONSTER_DESCRIPTION_RECORD_BYTES as u64,
            document_kind: "monster",
            open_command: "monster.open",
            summary: summary(&description.text),
        });
    }
}

pub(super) fn append_battles(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for battle in &snapshot.battles {
        push_fixed(
            rows,
            battle.identity.clone(),
            format!("Battle {}", battle.native_id.0),
            "battle",
            NativeFileFamily::BattleRecords,
            u64::from(battle.native_id.0),
            "battle",
            "battle.open",
            format!(
                "Distance {}; macro {}",
                battle.distance, battle.battle_macro
            ),
        );
    }
}

pub(super) fn append_treasures(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for treasure in &snapshot.treasures {
        push_fixed(
            rows,
            treasure.identity.clone(),
            format!("Treasure {}", treasure.native_id.0),
            "treasure",
            NativeFileFamily::TreasureRecords,
            u64::from(treasure.native_id.0),
            "treasure",
            "treasure.open",
            format!(
                "{} item slots; {} gold",
                treasure.item_ids.len(),
                treasure.gold
            ),
        );
    }
}

pub(super) fn append_shops(snapshot: &ProjectSnapshot, rows: &mut Vec<RecordRow>) {
    for shop in &snapshot.shops {
        push_fixed(
            rows,
            shop.identity.clone(),
            format!("Shop {}", shop.native_id.0),
            "shop",
            NativeFileFamily::ShopRecords,
            u64::from(shop.native_id.0),
            "shop",
            "shop.open",
            format!(
                "{} item slots; inflation {}",
                shop.item_ids.len(),
                shop.inflation
            ),
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn push_fixed(
    rows: &mut Vec<RecordRow>,
    identity: StableId,
    label: String,
    record_type: &'static str,
    family: NativeFileFamily,
    record_index: u64,
    document_kind: &'static str,
    open_command: &'static str,
    summary: String,
) {
    let codec = descriptor(family);
    let byte_start = record_index.saturating_mul(codec.record_bytes as u64);
    rows.push(RecordRow {
        identity,
        label,
        record_type,
        native_path: codec.native_path.into(),
        record_index,
        byte_start,
        byte_end: byte_start.saturating_add(codec.record_bytes as u64),
        document_kind,
        open_command,
        summary,
    });
}

fn summary(text: &str) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut characters = compact.chars();
    let head = characters
        .by_ref()
        .take(SUMMARY_CHARACTERS)
        .collect::<String>();
    if characters.next().is_some() {
        format!("{head}…")
    } else {
        head
    }
}
