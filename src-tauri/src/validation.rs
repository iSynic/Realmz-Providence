use crate::project::*;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

fn managed_resource_type_supported(resource_type: &str) -> bool {
    matches!(resource_type, "PICT" | "cicn" | "snd " | "TEXT" | "styl")
}

pub fn validate_project(project: &ProvidenceProject) -> ValidationReport {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut exportable_files = Vec::new();
    let mut pass_through_files = Vec::new();
    let imported_project = project.source.requires_compatibility_annex();
    let authored_manifest_files = if imported_project {
        None
    } else {
        match crate::exporter::expected_authored_scenario_manifest_files(
            project,
            ScenarioTarget::WindowsRealmzFolder,
        ) {
            Ok(files) => Some(files),
            Err(error) => {
                errors.push(format!("Native scenario compiler: {error}"));
                Some(Vec::new())
            }
        }
    };
    const SCENARIO_PICTURE_MIN_ID: i16 = 30000;
    const SCENARIO_PICTURE_MAX_ID: i16 = 30128;
    const SCENARIO_SOUND_MIN_ID: i16 = 200;
    const SCENARIO_SOUND_MAX_ID: i16 = 500;
    let message_ids = project
        .messages
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let battle_ids = project
        .battles
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let monster_ids = project
        .monsters
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let monster_records_by_id = project
        .monsters
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok().map(|id| (id, record)))
        .collect::<BTreeMap<_, _>>();
    let treasure_ids = project
        .treasures
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let shop_ids = project
        .shops
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let simple_encounter_ids = project
        .simple_encounters
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let complex_encounter_ids = project
        .complex_encounters
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let thief_encounter_ids = project
        .thief_encounters
        .iter()
        .filter_map(|record| i16::try_from(record.id).ok())
        .collect::<BTreeSet<_>>();
    let macro_ids = project
        .triggers
        .iter()
        .filter(|trigger| trigger.source == "Data ED3")
        .filter_map(|trigger| i16::try_from(trigger.record_index).ok())
        .collect::<BTreeSet<_>>();
    let edcd_ids = project
        .extracodes
        .iter()
        .filter_map(|row| i16::try_from(row.id).ok())
        .collect::<BTreeSet<_>>();
    let refs = TargetReferenceSets {
        messages: &message_ids,
        battles: &battle_ids,
        monsters: &monster_ids,
        treasures: &treasure_ids,
        shops: &shop_ids,
        simple_encounters: &simple_encounter_ids,
        complex_encounters: &complex_encounter_ids,
        macros: &macro_ids,
        edcd_rows: &edcd_ids,
    };
    let trigger_slots = project
        .triggers
        .iter()
        .filter_map(|trigger| {
            Some((
                trigger.level_type?,
                trigger.level_index?,
                trigger.record_index,
            ))
        })
        .collect::<BTreeSet<_>>();

    if project.maps.is_empty() {
        errors.push(
            "Project has no maps. At least one land or dungeon map is required for V1 export."
                .to_string(),
        );
    }
    for map in &project.maps {
        if map.width != MAP_SIZE || map.height != MAP_SIZE {
            errors.push(format!(
                "{} is {} x {}; Realmz maps must be 90 x 90.",
                map.id, map.width, map.height
            ));
        }
        if map.tiles.len() != MAP_SIZE * MAP_SIZE {
            errors.push(format!(
                "{} has {} tiles; Realmz maps require 8100 tiles.",
                map.id,
                map.tiles.len()
            ));
        }
    }
    validate_dense_map_indices(project, LevelType::Land, &mut errors);
    validate_dense_map_indices(project, LevelType::Dungeon, &mut errors);
    for trigger in &project.triggers {
        if trigger.actions.len() > 8 {
            errors.push(format!("{} has more than 8 actions.", trigger.id));
        }
        validate_trigger_actions(trigger, &refs, &mut errors, &mut warnings);
        if let Some(coord) = &trigger.coordinate {
            if coord.x >= MAP_SIZE || coord.y >= MAP_SIZE {
                errors.push(format!("{} has an out-of-bounds coordinate.", trigger.id));
            }
        }
        if trigger.level_type.is_some()
            && ((trigger.target_x as usize) >= MAP_SIZE || (trigger.target_y as usize) >= MAP_SIZE)
        {
            errors.push(format!(
                "{} has an out-of-bounds target coordinate.",
                trigger.id
            ));
        }
    }
    for level in &project.random_levels {
        if !level.raw_values.is_empty()
            && level.raw_values.len() != crate::realmz::RANDLEVEL_BYTES / 2
        {
            errors.push(format!(
                "{} has invalid raw random-level storage.",
                level.id
            ));
        }
        for rect in &level.rects {
            if rect.rect_index >= 20 {
                errors.push(format!(
                    "{} has random rect {} outside 0..19.",
                    level.id, rect.rect_index
                ));
            }
            if rect.left < 0
                || rect.top < 0
                || rect.right > MAP_SIZE as i16
                || rect.bottom > MAP_SIZE as i16
            {
                warnings.push(format!(
                    "{} random rect {} is outside the 90x90 map.",
                    level.id, rect.rect_index
                ));
            }
            if rect.left > rect.right || rect.top > rect.bottom {
                warnings.push(format!(
                    "{} random rect {} has invalid bounds.",
                    level.id, rect.rect_index
                ));
            }
            if rect.percent > 10000 {
                warnings.push(format!(
                    "{} random rect {} has Times in 10,000 value {} above 10000.",
                    level.id, rect.rect_index, rect.percent
                ));
            } else if rect.percent < 0 {
                warnings.push(format!(
                    "{} random rect {} has negative Times in 10,000 value {}; Realmz preserves this but normal authoring should use 0..10000.",
                    level.id, rect.rect_index, rect.percent
                ));
            }
            for (slot, percent) in rect.random_door_percent.iter().enumerate() {
                if !(-100..=100).contains(percent) {
                    warnings.push(format!(
                        "{} random rect {} extra door {} has percent {} outside -100..100.",
                        level.id, rect.rect_index, slot, percent
                    ));
                }
            }
            for (slot, door) in rect.random_doors.iter().enumerate() {
                if *door > 0
                    && !trigger_slots.contains(&(
                        level.level_type,
                        level.level_index,
                        *door as usize,
                    ))
                {
                    warnings.push(format!(
                        "{} random rect {} extra door {} points at missing Action Point record {}.",
                        level.id, rect.rect_index, slot, door
                    ));
                }
            }
        }
        for (left_index, left_rect) in level.rects.iter().enumerate() {
            for right_rect in level.rects.iter().skip(left_index + 1) {
                if random_rects_overlap(left_rect, right_rect) {
                    let priority = left_rect.rect_index.max(right_rect.rect_index);
                    warnings.push(format!(
                        "{} random rects {} and {} overlap; Realmz checks higher indexes first, so rect {} has priority.",
                        level.id, left_rect.rect_index, right_rect.rect_index, priority
                    ));
                }
            }
        }
    }
    validate_map_records(project, &mut errors, &mut warnings);
    validate_tile_attributes(project, authored_manifest_files.as_deref(), &mut warnings);
    for message in &project.messages {
        let message_bytes = classic_text_len(&message.text);
        if message_bytes > 255 {
            errors.push(format!(
                "Message {} is {} byte(s); Data SD2 supports at most 255 ASCII bytes.",
                message.id, message_bytes
            ));
        }
        if !message.text.is_ascii() {
            warnings.push(format!(
                "Message {} contains non-ASCII text; Classic text records are byte-oriented and may not render it as intended.",
                message.id
            ));
        }
    }
    for option in &project.option_labels {
        let option_bytes = classic_text_len(&option.text);
        if option_bytes > crate::realmz::OPTION_LABEL_BYTES - 1 {
            errors.push(format!(
                "Option label {} is {} byte(s); Data OD supports at most 24 ASCII bytes.",
                option.id, option_bytes
            ));
        }
        if !option.text.is_ascii() {
            warnings.push(format!(
                "Option label {} contains non-ASCII text; Classic option records are byte-oriented and may not render it as intended.",
                option.id
            ));
        }
    }
    for description in &project.monster_descriptions {
        let description_bytes = classic_text_len(&description.text);
        if description_bytes > crate::realmz::MONSTER_DESCRIPTION_BYTES - 1 {
            errors.push(format!(
                "Monster description {} is {} byte(s); Data DES supports at most 255 ASCII bytes.",
                description.id, description_bytes
            ));
        }
        if !description.text.is_ascii() {
            warnings.push(format!(
                "Monster description {} contains non-ASCII text; Classic text records are byte-oriented and may not render it as intended.",
                description.id
            ));
        }
    }
    for battle in &project.battles {
        if battle.grid.len() != 13 * 13 {
            errors.push(format!(
                "Battle {} has {} grid cells; Data BD requires 169.",
                battle.id,
                battle.grid.len()
            ));
        }
        let placed_monsters = battle.grid.iter().filter(|monster| **monster != 0).count();
        if placed_monsters == 0 {
            warnings.push(format!("Battle {} has no monsters placed.", battle.id));
        }
        if placed_monsters > 100 {
            warnings.push(format!(
                "Battle {} places {} monsters; Divinity documents a practical 100-monster limit.",
                battle.id, placed_monsters
            ));
        }
        if battle.authored && !(1..=30).contains(&battle.dist) {
            warnings.push(format!(
                "Battle {} distance {} is outside Divinity's usual 1-30 placement range.",
                battle.id, battle.dist
            ));
        }
        validate_optional_reference(
            "Battle",
            battle.id,
            "before message",
            battle.message_before,
            &message_ids,
            "message",
            &mut warnings,
        );
        validate_optional_reference(
            "Battle",
            battle.id,
            "after message",
            battle.message_after,
            &message_ids,
            "message",
            &mut warnings,
        );
        validate_battle_macro_reference(battle.id, battle.battle_macro, &macro_ids, &mut warnings);
        for (slot, monster) in battle.grid.iter().enumerate() {
            let monster_id = monster.abs();
            if *monster != 0 && !monster_ids.contains(&monster_id) {
                warnings.push(format!(
                    "Battle {} grid slot {} references monster {}, but no matching Data MD monster record is present.",
                    battle.id,
                    slot,
                    monster_id
                ));
            } else if *monster != 0
                && monster_records_by_id
                    .get(&monster_id)
                    .map(|record| record.hit_dice == 0)
                    .unwrap_or(false)
            {
                warnings.push(format!(
                    "Battle {} grid slot {} references blank monster {}; Realmz skips Data MD records with Stamina Level 0 during battle setup.",
                    battle.id,
                    slot,
                    monster_id
                ));
            }
        }
    }
    for monster in &project.monsters {
        if monster.type_flags.len() > 8 {
            errors.push(format!(
                "Monster {} has {} trait flags; Data MD supports 8.",
                monster.id,
                monster.type_flags.len()
            ));
        }
        if monster.attacks.len() > 5 {
            errors.push(format!(
                "Monster {} has {} attack rows; Data MD supports 5.",
                monster.id,
                monster.attacks.len()
            ));
        }
        if monster.items.len() > 6 {
            errors.push(format!(
                "Monster {} has {} item slots; Data MD supports 6.",
                monster.id,
                monster.items.len()
            ));
        }
        if monster.spells.len() > 10 {
            errors.push(format!(
                "Monster {} has {} spell slots; Data MD supports 10.",
                monster.id,
                monster.spells.len()
            ));
        }
        if monster.saves.len() > 6 || monster.spell_immunities.len() > 6 {
            errors.push(format!(
                "Monster {} has malformed save or immunity fields; Data MD supports 6 each.",
                monster.id
            ));
        }
        if monster.conditions.len() > 40 {
            errors.push(format!(
                "Monster {} has {} condition fields; Data MD supports 40.",
                monster.id,
                monster.conditions.len()
            ));
        }
        if monster.hit_dice == 255 {
            warnings.push(format!(
                "Monster {} has Stamina Level 255; Realmz uses this as a Bestiary list terminator.",
                monster.id
            ));
        }
        if monster.hit_dice != 0 && monster.display_name.trim().is_empty() {
            warnings.push(format!(
                "Monster {} is active but has no display name.",
                monster.id
            ));
        }
        if monster.hit_dice != 0 && !(1..=5).contains(&monster.attack_count) {
            warnings.push(format!(
                "Monster {} attack count {} is outside Divinity's 1..5 range.",
                monster.id, monster.attack_count
            ));
        }
        if !(0..=3).contains(&monster.size) {
            warnings.push(format!(
                "Monster {} size {} is outside Divinity's 0..3 range.",
                monster.id, monster.size
            ));
        }
        for (label, value) in [
            ("Cast spell %", monster.cast_percent),
            ("Run away %", monster.run_percent),
            ("Surrender %", monster.surrender_percent),
            ("Use missile %", monster.missile_percent),
        ] {
            if !(0..=100).contains(&value) {
                warnings.push(format!(
                    "Monster {} {} value {} is outside 0..100.",
                    monster.id, label, value
                ));
            }
        }
        let has_spell_slots = monster.spells.iter().any(|spell| *spell != 0);
        let magic_using = monster.type_flags.first().copied().unwrap_or_default() != 0;
        if (monster.magic_attack_count > 0 || monster.cast_percent > 0 || has_spell_slots)
            && !magic_using
        {
            warnings.push(format!(
                "Monster {} can cast or has spell slots but is not marked Magic Using.",
                monster.id
            ));
        }
        validate_monster_macro_reference(
            monster.id,
            monster.death_macro,
            &macro_ids,
            &mut warnings,
        );
        if monster.display_name.as_bytes().len() > 40 {
            warnings.push(format!(
                "Monster {} name is longer than the fixed 40-byte Realmz field.",
                monster.id
            ));
        }
    }
    for monster_set in &project.monster_sets {
        if monster_set.source_file != "Data MD1" && monster_set.source_file != "Data MD-1" {
            warnings.push(format!(
                "{} is an unusual alternate monster-set filename; Realmz normally uses Data MD1 or Data MD-1.",
                monster_set.source_file
            ));
        }
    }
    for treasure in &project.treasures {
        if treasure.item_ids.len() > 20 {
            errors.push(format!(
                "Treasure {} has {} item slots; Data TD supports 20.",
                treasure.id,
                treasure.item_ids.len()
            ));
        }
    }
    for item in &project.scenario_items {
        if !item.raw_bytes.is_empty() && item.raw_bytes.len() != crate::realmz::ITEM_BYTES {
            errors.push(format!(
                "Scenario item {} has invalid {}-byte compatibility storage.",
                item.id,
                crate::realmz::ITEM_BYTES
            ));
        }
        if item.spare2.len() != 7 {
            errors.push(format!(
                "Scenario item {} must define 7 semantic spare words.",
                item.id
            ));
        }
        if item.id > 199 {
            errors.push(format!(
                "Custom item record {} is outside the scenario item table capacity.",
                item.id
            ));
        }
        if item.item_id < 800 || item.item_id > 999 {
            warnings.push(format!(
                "Custom item record {} uses item ID {}; Realmz scenario item IDs are normally 800-999.",
                item.id, item.item_id
            ));
        }
        if item.id >= 100 && item.item_id < 900 {
            warnings.push(format!(
                "Custom item record {} is in the custom range but uses item ID {}.",
                item.id, item.item_id
            ));
        }
    }
    for shop in &project.shops {
        if shop.item_ids.len() > 1000 || shop.quantities.len() > 1000 {
            errors.push(format!(
                "Shop {} exceeds Data SD capacity of 1000 item and quantity slots.",
                shop.id
            ));
        }
    }
    for encounter in &project.simple_encounters {
        if encounter.authored {
            validate_encounter_actions(
                "Simple encounter",
                encounter.id,
                &encounter.actions,
                &refs,
                &mut errors,
                &mut warnings,
            );
            if encounter.choice_results.len() > 4 {
                errors.push(format!(
                    "Simple encounter {} has {} choice result rows; Data ED supports 4.",
                    encounter.id,
                    encounter.choice_results.len()
                ));
            }
            validate_optional_reference(
                "Simple encounter",
                encounter.id,
                "prompt message",
                encounter.prompt,
                &message_ids,
                "message",
                &mut warnings,
            );
            if encounter
                .texts
                .iter()
                .any(|text| classic_text_len(text) > 79)
            {
                errors.push(format!(
                    "Simple encounter {} has text longer than 79 bytes.",
                    encounter.id
                ));
            }
            if encounter.texts.iter().any(|text| !text.is_ascii()) {
                warnings.push(format!(
                    "Simple encounter {} contains non-ASCII text; Classic encounter text is byte-oriented.",
                    encounter.id
                ));
            }
        } else if encounter.raw_bytes.len() != crate::realmz::SIMPLE_ENCOUNTER_BYTES {
            warnings.push(format!(
                "Simple encounter {} has incomplete preserved source bytes and should be re-imported before editing.",
                encounter.id
            ));
        }
    }
    for encounter in &project.complex_encounters {
        if encounter.authored {
            validate_encounter_actions(
                "Complex encounter",
                encounter.id,
                &encounter.actions,
                &refs,
                &mut errors,
                &mut warnings,
            );
            if encounter.choice_results.len() > 4 {
                errors.push(format!(
                    "Complex encounter {} has {} choice result rows; Data ED2 supports 4.",
                    encounter.id,
                    encounter.choice_results.len()
                ));
            }
            if encounter.word_results.len() > 4 {
                errors.push(format!(
                    "Complex encounter {} has {} word result rows; Data ED2 supports 4.",
                    encounter.id,
                    encounter.word_results.len()
                ));
            }
            validate_optional_reference(
                "Complex encounter",
                encounter.id,
                "prompt message",
                encounter.prompt,
                &message_ids,
                "message",
                &mut warnings,
            );
            if encounter.thief
                && encounter.thief_success > 0
                && !thief_encounter_ids.contains(&(encounter.thief_success as i16))
            {
                warnings.push(format!(
                    "Complex encounter {} points to Rogue encounter {}, but that record does not exist.",
                    encounter.id, encounter.thief_success
                ));
            }
            if encounter
                .texts
                .iter()
                .any(|text| classic_text_len(text) > 39)
            {
                errors.push(format!(
                    "Complex encounter {} has text longer than 39 bytes.",
                    encounter.id
                ));
            }
            if encounter.texts.iter().any(|text| !text.is_ascii()) {
                warnings.push(format!(
                    "Complex encounter {} contains non-ASCII text; Classic encounter text is byte-oriented.",
                    encounter.id
                ));
            }
        } else if encounter.raw_bytes.len() != crate::realmz::COMPLEX_ENCOUNTER_BYTES {
            warnings.push(format!(
                "Complex encounter {} has incomplete preserved source bytes and should be re-imported before editing.",
                encounter.id
            ));
        }
    }
    for encounter in &project.thief_encounters {
        if encounter.authored {
            if encounter.type_flags.len() > 10 {
                errors.push(format!(
                    "Rogue encounter {} has {} state flags; Data TD2 supports 10.",
                    encounter.id,
                    encounter.type_flags.len()
                ));
            }
            for (label, values) in [
                ("modifiers", &encounter.modifiers),
                ("success result codes", &encounter.success_codes),
                ("failure result codes", &encounter.failure_codes),
            ] {
                if values.len() > 8 {
                    errors.push(format!(
                        "Rogue encounter {} has {} {}; Data TD2 supports 8.",
                        encounter.id,
                        values.len(),
                        label
                    ));
                }
            }
            for (label, values) in [
                ("success messages", &encounter.success_text),
                ("failure messages", &encounter.failure_text),
            ] {
                if values.len() > 8 {
                    errors.push(format!(
                        "Rogue encounter {} has {} {}; Data TD2 supports 8.",
                        encounter.id,
                        values.len(),
                        label
                    ));
                }
                for (slot, message_id) in values.iter().enumerate() {
                    validate_optional_reference(
                        "Rogue encounter",
                        encounter.id,
                        &format!("{label} slot {slot}"),
                        *message_id,
                        &message_ids,
                        "message",
                        &mut warnings,
                    );
                }
            }
            if encounter.low_damage != 0
                && encounter.high_damage != 0
                && encounter.low_damage > encounter.high_damage
            {
                warnings.push(format!(
                    "Rogue encounter {} trap damage low is greater than high.",
                    encounter.id
                ));
            }
        } else if encounter.raw_bytes.len() != crate::realmz::THIEF_ENCOUNTER_BYTES {
            warnings.push(format!(
                "Rogue encounter {} has incomplete preserved source bytes and should be re-imported before editing.",
                encounter.id
            ));
        }
    }
    let scenario_assets = project
        .assets
        .iter()
        .filter(|asset| {
            !matches!(
                asset.library_scope,
                Some(ManagedAssetLibraryScope::CustomLibrary)
            )
        })
        .collect::<Vec<_>>();
    for asset in &scenario_assets {
        if matches!(asset.export_state, ManagedAssetExportState::Blocked) {
            errors.push(format!(
                "{} is blocked from export: converted Realmz resource data is not available.",
                asset.label
            ));
        }
        if !managed_resource_type_supported(asset.resource_type.as_str()) {
            errors.push(format!(
                "{} targets unsupported resource type {}.",
                asset.label, asset.resource_type
            ));
        }
        if matches!(asset.export_state, ManagedAssetExportState::PreviewOnly) {
            warnings.push(format!(
                "{} is preview-only in this environment; desktop export needs converted resource bytes.",
                asset.label
            ));
        }
        if matches!(asset.kind, ManagedAssetKind::Picture) {
            if asset.resource_type != "PICT" {
                errors.push(format!(
                    "{} is a scenario picture but targets {}; pictures must export as PICT resources.",
                    asset.label, asset.resource_type
                ));
            }
            let custom_landlook_atlas = asset.conversion.as_ref().is_some_and(|conversion| {
                matches!(conversion.target, AssetImportTarget::CustomLandlookAtlas)
            });
            if !custom_landlook_atlas
                && (asset.resource_id < SCENARIO_PICTURE_MIN_ID
                    || asset.resource_id > SCENARIO_PICTURE_MAX_ID)
            {
                warnings.push(format!(
                    "{} uses PICT id {}; scenario pictures normally use {}-{}.",
                    asset.label,
                    asset.resource_id,
                    SCENARIO_PICTURE_MIN_ID,
                    SCENARIO_PICTURE_MAX_ID
                ));
            }
        }
        if matches!(asset.kind, ManagedAssetKind::Sound) {
            if asset.resource_type != "snd " {
                errors.push(format!(
                    "{} is a scenario sound but targets {}; sounds must export as snd resources.",
                    asset.label, asset.resource_type
                ));
            }
            if asset.resource_id < SCENARIO_SOUND_MIN_ID
                || asset.resource_id > SCENARIO_SOUND_MAX_ID
            {
                warnings.push(format!(
                    "{} uses snd id {}; custom scenario sounds normally use {}-{}.",
                    asset.label, asset.resource_id, SCENARIO_SOUND_MIN_ID, SCENARIO_SOUND_MAX_ID
                ));
            }
        }
        if matches!(asset.kind, ManagedAssetKind::Text) {
            if asset.resource_type != "TEXT" && asset.resource_type != "styl" {
                errors.push(format!(
                    "{} is a text resource but targets {}; scrolling text assets must export as TEXT resources, with imported style companions preserved as styl.",
                    asset.label, asset.resource_type
                ));
            }
            if asset.resource_type == "TEXT" && !(-300..=-200).contains(&asset.resource_id) {
                warnings.push(format!(
                    "{} uses TEXT id {}; Divinity documents scrolling text resources in the -200 through -300 range. Realmz source uses direct TEXT lookup, so Providence preserves this ID.",
                    asset.label, asset.resource_id
                ));
            }
        }
        if matches!(
            asset.kind,
            ManagedAssetKind::Icon | ManagedAssetKind::SpecialLandTile
        ) {
            if asset.resource_type != "cicn" {
                errors.push(format!(
                    "{} is an icon-style asset but targets {}; icon-style assets must export as cicn resources.",
                    asset.label, asset.resource_type
                ));
            }
            if asset.width != Some(32) || asset.height != Some(32) {
                warnings.push(format!(
                    "{} should be converted to 32 x 32 pixels before export.",
                    asset.label
                ));
            }
        }
        if matches!(asset.kind, ManagedAssetKind::SpecialLandTile) {
            if asset.resource_type != "cicn" {
                errors.push(format!(
                    "{} is a Special Land Tile but targets {}; special land tiles must export as cicn resources.",
                    asset.label, asset.resource_type
                ));
            }
            if asset.resource_id >= 0 {
                errors.push(format!(
                    "{} uses resource id {}; Special Land Tiles should use negative cicn ids such as -100.",
                    asset.label, asset.resource_id
                ));
            }
            if asset.width.is_none() || asset.height.is_none() {
                warnings.push(format!(
                    "{} has no original image dimensions recorded; its 32 x 32 cicn conversion should be rechecked before export.",
                    asset.label
                ));
            }
        }
        if let Some(conversion) = &asset.conversion {
            if matches!(
                conversion.target,
                AssetImportTarget::Icon | AssetImportTarget::SpecialLandTile
            ) && (conversion.final_width != Some(32) || conversion.final_height != Some(32))
            {
                warnings.push(format!(
                    "{} conversion target is {}, not 32 x 32.",
                    asset.label,
                    match (conversion.final_width, conversion.final_height) {
                        (Some(width), Some(height)) => format!("{width} x {height}"),
                        _ => "unknown size".to_string(),
                    }
                ));
            }
            if matches!(conversion.target, AssetImportTarget::CustomLandlookAtlas) {
                if asset.resource_type != "PICT" || !(306..=308).contains(&asset.resource_id) {
                    errors.push(format!(
                        "{} must export as custom landlook PICT 306, 307, or 308.",
                        asset.label
                    ));
                }
                if conversion.final_width != Some(640) || conversion.final_height != Some(320) {
                    errors.push(format!(
                        "{} must be converted to a 640 x 320 custom landlook atlas before export.",
                        asset.label
                    ));
                }
                let expected = format!("landlook:{}", asset.resource_id - 300);
                if asset.linked_entity.as_deref() != Some(expected.as_str()) {
                    errors.push(format!(
                        "{} must be linked to {} for custom landlook export.",
                        asset.label, expected
                    ));
                }
            }
            for warning in &conversion.warnings {
                warnings.push(format!("{} import note: {}", asset.label, warning));
            }
        }
        if asset.resource_id == 0 {
            warnings.push(format!(
                "{} uses resource id 0; Realmz resources normally use explicit nonzero ids.",
                asset.label
            ));
        }
    }
    validate_semantic_schema(project, &mut errors, &mut warnings);

    let has_scenario_file = authored_manifest_files.as_ref().map_or_else(
        || {
            project
                .source
                .files
                .iter()
                .any(|file| file.name == "Scenario")
        },
        |files| files.iter().any(|file| file == "Scenario"),
    );
    if imported_project && !has_scenario_file {
        warnings.push(
            "No Scenario file was imported; exported folders may not appear in Realmz menus."
                .to_string(),
        );
    }
    if let Some(shell) = &project.scenario.shell {
        if shell.source_file.trim().is_empty() {
            errors.push("Scenario marker/main file name is empty.".to_string());
        }
        if shell.look_x < 0
            || shell.look_x >= MAP_SIZE as i32
            || shell.look_y < 0
            || shell.look_y >= MAP_SIZE as i32
        {
            errors.push(format!(
                "Scenario startup coordinates {},{} are outside the 0..{} map range.",
                shell.look_x,
                shell.look_y,
                MAP_SIZE - 1
            ));
        }
        if !project.maps.iter().any(|map| {
            matches!(map.level_type, LevelType::Land) && map.index == shell.land_level as usize
        }) {
            warnings.push(format!(
                "Scenario startup land level {} does not resolve to an imported land map.",
                shell.land_level
            ));
        }
    } else if imported_project {
        warnings.push("No parsed Scenario startup shell is available; export will rely on source pass-through.".to_string());
    }
    validate_rules_overrides(project, &mut errors, &mut warnings);
    if let Some(files) = authored_manifest_files {
        exportable_files.extend(files);
    } else {
        for file in &project.source.files {
            if is_generated_cache_name(&file.name) {
                continue;
            }
            if matches!(file.role, SourceFileRole::SupportedBinary) {
                exportable_files.push(file.name.clone());
            } else {
                pass_through_files.push(file.name.clone());
            }
        }
    }
    exportable_files.sort();
    exportable_files.dedup();
    pass_through_files.sort();
    pass_through_files.dedup();
    if !pass_through_files.is_empty() {
        warnings.push(format!(
            "{} source file(s) are not V1 writer-supported and will be copied through unchanged: {}{}",
            pass_through_files.len(),
            pass_through_files
                .iter()
                .take(12)
                .cloned()
                .collect::<Vec<_>>()
                .join(", "),
            if pass_through_files.len() > 12 {
                ", ..."
            } else {
                "."
            }
        ));
    }
    if !scenario_assets.is_empty() {
        warnings.push(format!(
            "{} managed media asset(s) will be written into the exported Scenario resource fork.",
            scenario_assets.len()
        ));
    }

    let target_compatibility_issues = validate_target_compatibility(project);
    let target_compatibility = bucket_target_compatibility_issues(&target_compatibility_issues);

    ValidationReport {
        ok: errors.is_empty(),
        errors,
        warnings,
        exportable_files,
        pass_through_files,
        target_compatibility_issues,
        target_compatibility,
    }
}

fn validate_dense_map_indices(
    project: &ProvidenceProject,
    level_type: LevelType,
    errors: &mut Vec<String>,
) {
    let mut maps = project
        .maps
        .iter()
        .filter(|map| map.level_type == level_type)
        .collect::<Vec<_>>();
    maps.sort_by_key(|map| map.index);
    for (expected, map) in maps.iter().enumerate() {
        if map.index != expected {
            errors.push(format!(
                "{} maps must have dense indices; expected {}, found {}.",
                level_type.as_str(),
                expected,
                map.index
            ));
        }
    }
}

pub fn bucket_target_compatibility_issues(
    issues: &[TargetCompatibilityIssue],
) -> TargetCompatibilityBuckets {
    let mut buckets = TargetCompatibilityBuckets::default();
    for issue in issues {
        match issue.severity {
            DiagnosticSeverity::Error => buckets.blockers.push(issue.clone()),
            DiagnosticSeverity::Warning => buckets.warnings.push(issue.clone()),
            DiagnosticSeverity::Info => buckets.notes.push(issue.clone()),
        }
    }
    buckets
}

pub fn validate_target_compatibility(project: &ProvidenceProject) -> Vec<TargetCompatibilityIssue> {
    let mut issues = Vec::new();
    let has_resource_fork = project
        .source
        .files
        .iter()
        .any(|file| matches!(file.role, SourceFileRole::ResourceFork));
    let sidecar_resource_forks = project
        .source
        .files
        .iter()
        .filter(|file| {
            matches!(file.role, SourceFileRole::ResourceFork)
                && (file.name.ends_with(".rsrc")
                    || file.name.ends_with(".rsf")
                    || file.name.starts_with("._"))
        })
        .count();
    let unknown_source_files = project
        .source
        .files
        .iter()
        .filter(|file| matches!(file.role, SourceFileRole::Unknown))
        .count();
    let resource_references = project
        .semantic_schema
        .entities
        .iter()
        .filter(|entity| {
            matches!(
                entity.entity_type.as_str(),
                "resource" | "icon-resource" | "special-land-tile" | "picture" | "sound"
            )
        })
        .count();
    if resource_references > 0 && !has_resource_fork && project.assets.is_empty() {
        issues.push(TargetCompatibilityIssue {
            target: ScenarioTarget::MacClassicFolder,
            severity: DiagnosticSeverity::Warning,
            code: "missing-scenario-resource-fork".to_string(),
            message: format!(
                "{resource_references} resource reference(s) were found, but the imported package did not include a scenario resource fork."
            ),
            source: Some("Scenario resources".to_string()),
        });
        issues.push(TargetCompatibilityIssue {
            target: ScenarioTarget::WindowsRealmzFolder,
            severity: DiagnosticSeverity::Warning,
            code: "missing-scenario-resource-fork".to_string(),
            message: format!(
                "{resource_references} resource reference(s) were found, but the imported package did not include a scenario resource fork or sidecar."
            ),
            source: Some("Scenario resources".to_string()),
        });
    }
    let apple_double_sidecars = project
        .source
        .files
        .iter()
        .filter(|file| file.name.starts_with("._"))
        .count();
    if apple_double_sidecars > 0 {
        issues.push(TargetCompatibilityIssue {
            target: ScenarioTarget::MacClassicFolder,
            severity: DiagnosticSeverity::Info,
            code: "appledouble-sidecars-preserved".to_string(),
            message: format!(
                "{apple_double_sidecars} AppleDouble sidecar file(s) are preserved as Classic Mac resource-fork packaging."
            ),
            source: Some("Source package".to_string()),
        });
        issues.push(TargetCompatibilityIssue {
            target: ScenarioTarget::WindowsRealmzFolder,
            severity: DiagnosticSeverity::Warning,
            code: "appledouble-sidecars-in-windows-target".to_string(),
            message: format!(
                "{apple_double_sidecars} AppleDouble sidecar file(s) will be preserved, but Windows Realmz compatibility is not proven for this packaging."
            ),
            source: Some("Source package".to_string()),
        });
    }
    if sidecar_resource_forks > 0 {
        issues.push(TargetCompatibilityIssue {
            target: ScenarioTarget::MacClassicFolder,
            severity: DiagnosticSeverity::Info,
            code: "resource-sidecars-preserved".to_string(),
            message: format!(
                "{sidecar_resource_forks} resource sidecar file(s) are preserved as imported packaging."
            ),
            source: Some("Source package".to_string()),
        });
    }
    let custom_music = project
        .source
        .files
        .iter()
        .filter(|file| is_custom_music_file(&file.name))
        .count();
    if custom_music > 0 {
        issues.push(TargetCompatibilityIssue {
            target: ScenarioTarget::ProvidencePortableFolder,
            severity: DiagnosticSeverity::Info,
            code: "custom-music-preserved".to_string(),
            message: format!(
                "{custom_music} custom music file(s) are scenario-owned media and will be preserved byte-for-byte."
            ),
            source: Some("Custom music".to_string()),
        });
    }
    let unsupported_managed_assets = project
        .assets
        .iter()
        .filter(|asset| !managed_resource_type_supported(asset.resource_type.as_str()))
        .count();
    if unsupported_managed_assets > 0 {
        for target in [
            ScenarioTarget::MacClassicFolder,
            ScenarioTarget::WindowsRealmzFolder,
            ScenarioTarget::ProvidencePortableFolder,
        ] {
            issues.push(TargetCompatibilityIssue {
                target,
                severity: DiagnosticSeverity::Warning,
                code: "unsupported-managed-media-type".to_string(),
                message: format!(
                    "{unsupported_managed_assets} managed asset(s) target unsupported resource types; only PICT, cicn, snd, TEXT, and styl are known-good replacement writers."
                ),
                source: Some("Assets".to_string()),
            });
        }
    }
    for landlook in used_custom_landlooks(project) {
        if !has_custom_landlook_metadata(project, landlook) {
            for target in [
                ScenarioTarget::MacClassicFolder,
                ScenarioTarget::WindowsRealmzFolder,
                ScenarioTarget::ProvidencePortableFolder,
            ] {
                issues.push(TargetCompatibilityIssue {
                    target,
                    severity: DiagnosticSeverity::Error,
                    code: "custom-landlook-metadata-missing".to_string(),
                    message: format!(
                        "Landlook {landlook} is used by a land map, but {} is missing.",
                        custom_landlook_metadata_file(landlook)
                            .unwrap_or("custom landlook metadata")
                    ),
                    source: Some(format!("landlook-{landlook}")),
                });
            }
        }
        if !custom_landlook_art_available(project, landlook) {
            for target in [
                ScenarioTarget::MacClassicFolder,
                ScenarioTarget::WindowsRealmzFolder,
                ScenarioTarget::ProvidencePortableFolder,
            ] {
                issues.push(TargetCompatibilityIssue {
                    target,
                    severity: DiagnosticSeverity::Error,
                    code: "custom-landlook-art-missing".to_string(),
                    message: format!(
                        "Landlook {landlook} is used by a land map, but PICT {} is missing from scenario resources or managed assets.",
                        custom_landlook_pict_id(landlook).unwrap_or_default()
                    ),
                    source: Some(format!("landlook-{landlook}")),
                });
            }
        }
    }
    for landlook in project
        .custom_landlooks
        .iter()
        .map(|metadata| metadata.landlook)
    {
        if !used_custom_landlooks(project).contains(&landlook) {
            issues.push(TargetCompatibilityIssue {
                target: ScenarioTarget::ProvidencePortableFolder,
                severity: DiagnosticSeverity::Info,
                code: "unused-custom-landlook-preserved".to_string(),
                message: format!(
                    "Custom landlook {landlook} metadata is preserved even though no imported land map currently uses it."
                ),
                source: custom_landlook_metadata_file(landlook).map(str::to_string),
            });
        }
    }
    if unknown_source_files > 0 {
        for target in [
            ScenarioTarget::MacClassicFolder,
            ScenarioTarget::WindowsRealmzFolder,
            ScenarioTarget::ProvidencePortableFolder,
        ] {
            issues.push(TargetCompatibilityIssue {
                target,
                severity: DiagnosticSeverity::Warning,
                code: "unknown-source-files-preserved".to_string(),
                message: format!(
                    "{unknown_source_files} imported source file(s) are preserved but not yet classified as authored scenario data, resource packaging, runtime cache, or compatibility baggage."
                ),
                source: Some("Source package".to_string()),
            });
        }
    }
    issues
}

fn used_custom_landlooks(project: &ProvidenceProject) -> BTreeSet<i8> {
    project
        .maps
        .iter()
        .filter_map(|map| map.render.landlook)
        .filter(|landlook| (6..=8).contains(landlook))
        .collect()
}

fn has_custom_landlook_metadata(project: &ProvidenceProject, landlook: i8) -> bool {
    project
        .custom_landlooks
        .iter()
        .any(|metadata| metadata.landlook == landlook)
}

fn custom_landlook_art_available(project: &ProvidenceProject, landlook: i8) -> bool {
    let Some(pict_id) = custom_landlook_pict_id(landlook) else {
        return false;
    };
    project.asset_catalog.tilesets.iter().any(|tileset| {
        tileset.landlook == landlook
            && tileset.pict_id == Some(i32::from(pict_id))
            && tileset.available
    }) || project.assets.iter().any(|asset| {
        !matches!(
            asset.library_scope,
            Some(ManagedAssetLibraryScope::CustomLibrary)
        ) && asset.resource_type == "PICT"
            && asset.resource_id == pict_id
            && matches!(asset.export_state, ManagedAssetExportState::Ready)
    })
}

fn custom_landlook_pict_id(landlook: i8) -> Option<i16> {
    match landlook {
        6 => Some(306),
        7 => Some(307),
        8 => Some(308),
        _ => None,
    }
}

fn custom_landlook_metadata_file(landlook: i8) -> Option<&'static str> {
    match landlook {
        6 => Some("Data Custom 1 BD"),
        7 => Some("Data Custom 2 BD"),
        8 => Some("Data Custom 3 BD"),
        _ => None,
    }
}

fn is_custom_music_file(name: &str) -> bool {
    if !name.starts_with("Custom ") {
        return false;
    }
    let suffix = name.trim_start_matches("Custom ");
    let Some(first) = suffix.chars().next() else {
        return false;
    };
    first.is_ascii_digit() && (suffix.len() == 1 || suffix.ends_with(" Music"))
}

fn random_rects_overlap(a: &RandomRect, b: &RandomRect) -> bool {
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

fn validate_tile_attributes(
    project: &ProvidenceProject,
    authored_manifest_files: Option<&[String]>,
    warnings: &mut Vec<String>,
) {
    let has_solids = authored_manifest_files.map_or_else(
        || {
            project
                .source
                .files
                .iter()
                .any(|file| file.name == "Data Solids")
        },
        |files| files.iter().any(|file| file == "Data Solids"),
    );
    if !has_solids {
        warnings.push(
            "Data Solids is missing; special negative tile solidity will remain unknown."
                .to_string(),
        );
    }
    let mapstats_landlooks = project
        .tile_attributes
        .iter()
        .filter(|profile| matches!(profile.source_kind, TileAttributeSourceKind::Mapstats))
        .filter_map(|profile| profile.landlook)
        .collect::<BTreeSet<_>>();
    let used_landlooks = project
        .maps
        .iter()
        .filter_map(|map| map.render.landlook)
        .filter(|landlook| *landlook >= 0)
        .collect::<BTreeSet<_>>();
    for landlook in used_landlooks {
        if landlook != 2 && !mapstats_landlooks.contains(&landlook) {
            warnings.push(format!(
                "Landlook {landlook} has no decoded mapstats; tile attributes will be shown as unknown metadata."
            ));
        }
        if (6..=8).contains(&landlook) {
            if !project
                .custom_landlooks
                .iter()
                .any(|custom| custom.landlook == landlook)
            {
                warnings.push(format!(
                    "Custom land tiles for landlook {landlook} are missing metadata; this scenario can be preserved, but tile definitions cannot be edited safely."
                ));
            }
            let atlas_available = custom_landlook_art_available(project, landlook);
            if !atlas_available {
                warnings.push(format!(
                    "Custom landlook art for landlook {landlook} is missing; Realmz may not be able to draw this custom landlook after export."
                ));
            }
        }
    }
    let mut known_icons: BTreeSet<i16> = BTreeSet::new();
    for asset in &project.assets {
        if matches!(
            asset.library_scope,
            Some(ManagedAssetLibraryScope::CustomLibrary)
        ) {
            continue;
        }
        if asset.resource_type == "cicn" {
            insert_icon_id(&mut known_icons, asset.resource_id as i32);
        }
    }
    for asset in &project.asset_catalog.icons {
        insert_icon_id(&mut known_icons, asset.resource_id);
    }
    for entity in &project.semantic_schema.entities {
        if entity.entity_type == "resource"
            || entity.entity_type == "icon-resource"
            || entity.entity_type == "special-land-tile"
        {
            if let Some(id) = entity
                .summary
                .get("resourceId")
                .and_then(|value| value.as_i64())
            {
                insert_icon_id(&mut known_icons, id as i32);
            }
        }
    }
    let mut missing = BTreeSet::new();
    let mut positive_state_values = 0usize;
    for map in &project.maps {
        for tile in &map.tiles {
            if *tile > 999 {
                positive_state_values += 1;
            }
            if *tile >= 0 {
                continue;
            }
            let candidates = tile_icon_candidates(*tile);
            if !candidates
                .iter()
                .any(|candidate| known_icons.contains(candidate))
            {
                if let Some(first) = candidates.first() {
                    missing.insert(*first);
                }
            }
        }
    }
    if !missing.is_empty() {
        warnings.push(format!(
            "{} negative/special tile value(s) do not currently resolve to decoded cicn icon art.",
            missing.len()
        ));
    }
    if positive_state_values > 0 {
        warnings.push(format!(
            "{positive_state_values} positive high map field value(s) carry Realmz state bands; edit them through AP/secret/path workflows or Raw/Advanced tile tools."
        ));
    }
}

fn insert_icon_id(known_icons: &mut BTreeSet<i16>, id: i32) {
    if let Ok(value) = i16::try_from(id) {
        known_icons.insert(value);
        if value > 0 {
            known_icons.insert(-value);
        }
    }
}

fn tile_icon_candidates(value: i16) -> Vec<i16> {
    if value >= 0 {
        return Vec::new();
    }
    let mut out = vec![value];
    let mut normalized = value;
    while normalized < -999 {
        normalized += 1000;
    }
    if normalized != value && normalized < 0 {
        out.push(normalized);
    }
    out
}

fn validate_map_records(
    project: &ProvidenceProject,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let maps = project
        .maps
        .iter()
        .map(|map| (map.level_type, map.index))
        .collect::<BTreeSet<_>>();
    let pictures = project
        .asset_catalog
        .pictures
        .iter()
        .map(|picture| picture.resource_id)
        .collect::<BTreeSet<_>>();
    for record in &project.map_records {
        if !record.raw_bytes.is_empty() && record.raw_bytes.len() != crate::realmz::MAP_RECORD_BYTES
        {
            errors.push(format!(
                "Map record {} has invalid {}-byte compatibility storage.",
                record.id,
                crate::realmz::MAP_RECORD_BYTES
            ));
        }
        if record.markers.len() != crate::realmz::MAP_RECORD_MARKERS {
            errors.push(format!(
                "Map record {} must define {} semantic marker slots.",
                record.id,
                crate::realmz::MAP_RECORD_MARKERS
            ));
        }
        if record.start_x < 0
            || record.start_x >= MAP_SIZE as i16
            || record.start_y < 0
            || record.start_y >= MAP_SIZE as i16
        {
            warnings.push(format!(
                "Map record {} starts outside the 90x90 map at {},{}.",
                record.id, record.start_x, record.start_y
            ));
        }
        let level_type = if record.is_dungeon {
            LevelType::Dungeon
        } else {
            LevelType::Land
        };
        if record.level < 0 || !maps.contains(&(level_type, record.level as usize)) {
            warnings.push(format!(
                "Map record {} points to missing {}:{}.",
                record.id,
                level_type.as_str(),
                record.level
            ));
        }
        if record.rect.left > record.rect.right || record.rect.top > record.rect.bottom {
            warnings.push(format!(
                "Map record {} has an inverted display rectangle.",
                record.id
            ));
        }
        if record.pict_id != 0
            && !pictures.is_empty()
            && !pictures.contains(&(record.pict_id as i32))
        {
            warnings.push(format!(
                "Map record {} references picture {}, which is not decoded in the scenario resource catalog.",
                record.id, record.pict_id
            ));
        }
    }
}

struct TargetReferenceSets<'a> {
    messages: &'a BTreeSet<i16>,
    battles: &'a BTreeSet<i16>,
    monsters: &'a BTreeSet<i16>,
    treasures: &'a BTreeSet<i16>,
    shops: &'a BTreeSet<i16>,
    simple_encounters: &'a BTreeSet<i16>,
    complex_encounters: &'a BTreeSet<i16>,
    macros: &'a BTreeSet<i16>,
    edcd_rows: &'a BTreeSet<i16>,
}

fn validate_trigger_actions(
    trigger: &TriggerRecord,
    refs: &TargetReferenceSets,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let mut occupied = BTreeSet::new();
    for action in &trigger.actions {
        if !occupied.insert(action.slot) {
            errors.push(format!(
                "{} has multiple actions in slot {}.",
                trigger.id, action.slot
            ));
        }
        if action.slot >= 8 {
            errors.push(format!(
                "{} has action slot {} outside 0..7.",
                trigger.id, action.slot
            ));
        }
        validate_action_target(
            &trigger.id,
            action.slot,
            action.raw_code,
            action.id,
            refs,
            warnings,
        );
    }
}

fn validate_encounter_actions(
    label: &str,
    record_id: usize,
    actions: &[EncounterActionRow],
    refs: &TargetReferenceSets,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let mut occupied = BTreeSet::new();
    for action in actions {
        if !occupied.insert(action.slot) {
            errors.push(format!(
                "{} {} has multiple action rows in slot {}.",
                label, record_id, action.slot
            ));
        }
        if action.slot >= 32 {
            errors.push(format!(
                "{} {} has action slot {} outside 0..31.",
                label, record_id, action.slot
            ));
        }
        if action.raw_code < i8::MIN as i16 || action.raw_code > i8::MAX as i16 {
            errors.push(format!(
                "{} {} action slot {} has CODE {} outside signed-byte range.",
                label, record_id, action.slot, action.raw_code
            ));
        }
        validate_action_target(
            &format!("{label} {record_id}"),
            action.slot,
            action.raw_code,
            action.id,
            refs,
            warnings,
        );
    }
}

fn validate_action_target(
    label: &str,
    slot: usize,
    raw_code: i16,
    id: i16,
    refs: &TargetReferenceSets,
    warnings: &mut Vec<String>,
) {
    if id <= 0 {
        return;
    }
    let code = normalize_action_code(raw_code);
    if action_code_consumes_edcd(code) {
        if !refs.edcd_rows.contains(&id) {
            warnings.push(format!(
                "{} action slot {} references missing parameter row {}.",
                label, slot, id
            ));
        }
        return;
    }
    let target = match code {
        1 | 71 => Some(("message", refs.messages)),
        2 | 48 | 56 | 107 => Some(("battle", refs.battles)),
        4 | 35 | 104 => Some(("simple encounter", refs.simple_encounters)),
        5 | 44 => Some(("complex encounter", refs.complex_encounters)),
        6 | 49 => Some(("shop", refs.shops)),
        // Opcode 8 is "Same as Other Action Point": Realmz copies door[id]
        // from the currently loaded map and does not resolve Data ED3.
        39 => Some(("Data ED3 macro", refs.macros)),
        10 => Some(("treasure", refs.treasures)),
        127 => Some(("monster", refs.monsters)),
        _ => None,
    };
    let Some((target_label, ids)) = target else {
        return;
    };
    if !ids.contains(&id) {
        warnings.push(format!(
            "{} action slot {} references {} {}, but Providence cannot prove that target exists.",
            label, slot, target_label, id
        ));
    }
}

fn action_code_consumes_edcd(code: i16) -> bool {
    matches!(
        code,
        -23 | 2
            | 3
            | 7
            | 12
            | 13
            | 15
            | 16
            | 17
            | 18
            | 19
            | 20
            | 21
            | 22
            | 23
            | 30
            | 31
            | 33
            | 37
            | 38
            | 40
            | 41
            | 42
            | 43
            | 45
            | 46
            | 48
            | 50
            | 51
            | 52
            | 53
            | 54
            | 55
            | 56
            | 57
            | 58
            | 59
            | 60
            | 61
            | 63
            | 64
            | 65
            | 67
            | 68
            | 69
            | 70
            | 72
            | 73
            | 74
            | 75
            | 76
            | 77
            | 78
            | 81
            | 85
            | 86
            | 87
            | 90
            | 92
            | 103
            | 106
            | 107
            | 108
            | 120
            | 121
            | 122
            | 123
            | 124
            | 125
            | 126
    )
}

fn classic_text_len(text: &str) -> usize {
    text.chars().count()
}

fn normalize_action_code(code: i16) -> i16 {
    if code < 0 && code != -14 && code != -23 {
        -code
    } else {
        code
    }
}

fn validate_optional_reference(
    label: &str,
    record_id: usize,
    field: &str,
    id: i16,
    known_ids: &BTreeSet<i16>,
    target_label: &str,
    warnings: &mut Vec<String>,
) {
    if id <= 0 {
        return;
    }
    if !known_ids.contains(&id) {
        warnings.push(format!(
            "{} {} {} references {} {}, but Providence cannot prove that target exists.",
            label, record_id, field, target_label, id
        ));
    }
}

fn validate_battle_macro_reference(
    battle_id: usize,
    id: i16,
    macro_ids: &BTreeSet<i16>,
    warnings: &mut Vec<String>,
) {
    if id == 0 {
        return;
    }
    let target_id = id.checked_abs().unwrap_or(id);
    if !macro_ids.contains(&target_id) {
        warnings.push(format!(
            "Battle {} battle macro references Data ED3 macro {}, but Providence cannot prove that target exists.",
            battle_id, target_id
        ));
    }
}

fn validate_monster_macro_reference(
    monster_id: usize,
    id: i16,
    macro_ids: &BTreeSet<i16>,
    warnings: &mut Vec<String>,
) {
    if id == 0 {
        return;
    }
    let target_id = id.checked_abs().unwrap_or(id);
    if !macro_ids.contains(&target_id) {
        warnings.push(format!(
            "Monster {} death macro references Extra Action Point {}, but that macro is not present.",
            monster_id, target_id
        ));
    }
}

fn validate_rules_overrides(
    project: &ProvidenceProject,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let mut spell_ids = BTreeSet::new();
    let known_sounds = known_resource_ids(project, "snd ");
    let known_icons = known_resource_ids(project, "cicn");
    let mut missing_spell_sounds = BTreeSet::new();
    let mut missing_spell_icons = BTreeSet::new();
    let mut missing_race_icons = BTreeSet::new();
    let mut missing_caste_icons = BTreeSet::new();
    for spell in &project.spell_overrides {
        if spell.id >= crate::realmz::SPELL_OVERRIDE_RECORDS {
            errors.push(format!(
                "Custom spell slot {} is outside the scenario custom spell range 5101..5715.",
                spell.id
            ));
        }
        if !spell_ids.insert(spell.id) {
            errors.push(format!("Spell override {} is duplicated.", spell.id));
        }
        if spell.target_type > 11 {
            warnings.push(format!(
                "Spell override {} uses target type {}; Divinity labels are known for 0..11.",
                spell.id, spell.target_type
            ));
        }
        for sound in [spell.sound1, spell.sound2] {
            if let Some(resource_id) = spell_sound_resource_id(sound) {
                if !known_sounds.contains(&resource_id) {
                    missing_spell_sounds.insert(resource_id);
                }
            }
        }
        for icon_id in spell_animation_frame_ids(spell.spell_look1, true)
            .into_iter()
            .chain(spell_animation_frame_ids(spell.spell_look2, false))
        {
            if !known_icons.contains(&icon_id) {
                missing_spell_icons.insert(icon_id);
            }
        }
    }
    if !missing_spell_sounds.is_empty() {
        warnings.push(format!(
            "{} spell sound resource(s) referenced by custom spells do not currently resolve.",
            missing_spell_sounds.len()
        ));
    }
    if !missing_spell_icons.is_empty() {
        warnings.push(format!(
            "{} spell animation frame resource(s) referenced by custom spells do not currently resolve.",
            missing_spell_icons.len()
        ));
    }

    let mut race_ids = BTreeSet::new();
    for race in &project.race_overrides {
        if race.id >= 30 {
            errors.push(format!(
                "Race override {} is outside the 0..29 race table.",
                race.id
            ));
        }
        if !race_ids.insert(race.id) {
            errors.push(format!("Race override {} is duplicated.", race.id));
        }
        for (label, actual, expected) in [
            ("spare", race.spare.as_ref().map(Vec::len), 8),
            ("spacer", race.spacer.as_ref().map(Vec::len), 31),
        ] {
            if let Some(actual) = actual.filter(|actual| *actual != expected) {
                errors.push(format!(
                    "Race override {} {label} must contain {expected} words; found {actual}.",
                    race.id
                ));
            }
        }
        if race.max_age < 0 {
            warnings.push(format!("Race override {} has a negative max age.", race.id));
        }
        for (band, range) in race.age_range.iter().enumerate() {
            if range.len() >= 2 && range[0] > range[1] {
                warnings.push(format!(
                    "Race override {} age band {} starts after it ends.",
                    race.id, band
                ));
            }
        }
        for icon_id in race_portrait_set_icon_ids(race.default_icon_set) {
            if !known_icons.contains(&icon_id) {
                missing_race_icons.insert(icon_id);
            }
        }
    }
    if !missing_race_icons.is_empty() {
        warnings.push(format!(
            "{} race portrait icon resource(s) referenced by race overrides do not currently resolve.",
            missing_race_icons.len()
        ));
    }

    let mut caste_ids = BTreeSet::new();
    for caste in &project.caste_overrides {
        if caste.id >= 30 {
            errors.push(format!(
                "Caste override {} is outside the 0..29 caste table.",
                caste.id
            ));
        }
        if !caste_ids.insert(caste.id) {
            errors.push(format!("Caste override {} is duplicated.", caste.id));
        }
        for (label, actual, expected) in [
            ("spare1", caste.spare1.as_ref().map(Vec::len), 2),
            ("spare2", caste.spare2.as_ref().map(Vec::len), 2),
            ("spacer", caste.spacer.as_ref().map(Vec::len), 63),
        ] {
            if let Some(actual) = actual.filter(|actual| *actual != expected) {
                errors.push(format!(
                    "Caste override {} {label} must contain {expected} words; found {actual}.",
                    caste.id
                ));
            }
        }
        for item_id in caste.start_items.iter().filter(|item_id| **item_id < 0) {
            warnings.push(format!(
                "Caste override {} has negative starting item id {}; verify this is intentional.",
                caste.id, item_id
            ));
        }
        if caste.default_icon > 0 && !known_icons.contains(&caste.default_icon) {
            missing_caste_icons.insert(caste.default_icon);
        }
    }
    if !missing_caste_icons.is_empty() {
        warnings.push(format!(
            "{} caste icon resource(s) referenced by caste overrides do not currently resolve.",
            missing_caste_icons.len()
        ));
    }
}

fn spell_sound_resource_id(value: u8) -> Option<i16> {
    (value > 0).then_some(600 + i16::from(value))
}

fn spell_animation_frame_ids(value: u8, blank_cast: bool) -> Vec<i16> {
    if value == 0 && blank_cast {
        return Vec::new();
    }
    let base = if value == 0 {
        12032
    } else {
        11992 + i16::from(value) * 8
    };
    (0..8).map(|index| base + index).collect()
}

fn race_portrait_set_icon_ids(default_icon_set: i16) -> Vec<i16> {
    let first = 251 + default_icon_set * 6;
    (0..6).map(|index| first + index).collect()
}

fn known_resource_ids(project: &ProvidenceProject, resource_type: &str) -> BTreeSet<i16> {
    let mut ids = BTreeSet::new();
    for asset in &project.assets {
        if matches!(
            asset.library_scope,
            Some(ManagedAssetLibraryScope::CustomLibrary)
        ) {
            continue;
        }
        if asset.resource_type == resource_type {
            ids.insert(asset.resource_id);
        }
    }
    if resource_type == "cicn" {
        for asset in &project.asset_catalog.icons {
            if asset.resource_type == "cicn" {
                if let Ok(id) = i16::try_from(asset.resource_id) {
                    ids.insert(id);
                }
            }
        }
    }
    for entity in &project.semantic_schema.entities {
        if entity.entity_type != "resource"
            && entity.entity_type != "icon-resource"
            && entity.entity_type != "special-land-tile"
        {
            continue;
        }
        let entity_type = entity
            .summary
            .get("type")
            .and_then(Value::as_str)
            .or_else(|| entity.summary.get("resourceType").and_then(Value::as_str));
        if entity_type.is_some_and(|value| value == resource_type)
            || entity.id.starts_with(&format!("resource:{resource_type}:"))
        {
            if let Some(id) = entity
                .summary
                .get("resourceId")
                .and_then(Value::as_i64)
                .and_then(|value| i16::try_from(value).ok())
            {
                ids.insert(id);
            } else if let Some((_, raw_id)) = entity.id.rsplit_once(':') {
                if let Ok(id) = raw_id.parse::<i16>() {
                    ids.insert(id);
                }
            }
        }
    }
    ids
}

fn validate_semantic_schema(
    project: &ProvidenceProject,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let schema = &project.semantic_schema;
    if schema.schema_version != SEMANTIC_SCHEMA_VERSION {
        warnings.push(format!(
            "Semantic schema version {} is stale; expected {}.",
            schema.schema_version, SEMANTIC_SCHEMA_VERSION
        ));
    }
    if schema.sources.is_empty() {
        warnings.push("Semantic schema has no source inventory.".to_string());
    }
    if schema.records.is_empty() {
        warnings.push("Semantic schema has no record inventory.".to_string());
    }
    if schema.entities.is_empty() {
        warnings.push("Semantic schema has no entity inventory.".to_string());
    }

    let mut known_ids: BTreeSet<String> = schema
        .entities
        .iter()
        .map(|entity| entity.id.clone())
        .chain(schema.records.iter().map(|record| record.id.clone()))
        .chain(schema.sources.iter().map(|source| source.id.clone()))
        .collect();
    known_ids.extend(live_semantic_ids(project));
    let links_by_target = links_by_target(&schema.links);
    let mut unresolved_link_warnings = 0usize;
    let mut unresolved_link_examples = Vec::new();
    for link in &schema.links {
        if !known_ids.contains(&link.from) {
            if unresolved_link_examples.len() < 6 {
                unresolved_link_examples.push(format!("{} starts at {}", link.id, link.from));
            }
            unresolved_link_warnings += 1;
        }
        if !known_ids.contains(&link.to) {
            if unresolved_link_examples.len() < 6 {
                unresolved_link_examples.push(format!("{} points to {}", link.id, link.to));
            }
            unresolved_link_warnings += 1;
        }
    }
    if unresolved_link_warnings > 0 {
        warnings.push(format!(
            "Semantic graph has {} unresolved imported link endpoint(s); detailed record-level diagnostics remain in the Linter/Semantic panels (examples: {}).",
            unresolved_link_warnings,
            unresolved_link_examples.join(", ")
        ));
    }
    validate_missing_sources(schema, warnings);

    for diagnostic in &schema.diagnostics {
        if semantic_diagnostic_resolved_by_live_project(diagnostic, &known_ids) {
            continue;
        }
        let message = format!(
            "Semantic {}: {}",
            diagnostic.diagnostic_type, diagnostic.message
        );
        match diagnostic.severity {
            DiagnosticSeverity::Error => errors.push(message),
            DiagnosticSeverity::Warning => warnings.push(message),
            DiagnosticSeverity::Info => {}
        }
    }
    let malformed_resources = schema
        .diagnostics
        .iter()
        .filter(|diagnostic| {
            diagnostic.diagnostic_type.contains("resource")
                && diagnostic.severity != DiagnosticSeverity::Info
        })
        .count();
    if malformed_resources > 0 {
        warnings.push(format!(
            "Resource fork inspection produced {} resource-specific diagnostic(s); review the Resources and Linter panels before export.",
            malformed_resources
        ));
    }

    let has_resource_inventory = schema
        .entities
        .iter()
        .any(|entity| entity.entity_type == "resource type" || entity.entity_type == "resource");
    let has_resource_snapshot = project
        .source
        .files
        .iter()
        .any(|file| matches!(file.role, SourceFileRole::ResourceFork));
    if has_resource_snapshot && !has_resource_inventory {
        warnings.push(
            "Resource fork files were imported, but no readable resource inventory was produced."
                .to_string(),
        );
    }
    validate_resource_references(schema, &known_ids, &links_by_target, warnings);
    for tileset in &project.asset_catalog.tilesets {
        if !tileset.available || tileset.image_path.is_none() {
            warnings.push(format!(
                "Tile atlas {} is unavailable; map rendering will use fallback colors.",
                tileset.id
            ));
        }
    }
    for source in &project.source.files {
        if is_generated_cache_name(&source.name) {
            warnings.push(format!(
                "{} looks like a generated runtime cache; Providence keeps it as evidence and does not author it on export.",
                source.name
            ));
        }
    }
    validate_runtime_cache_entities(schema, errors, warnings);
    let mut inspect_only_supported = 0usize;
    for record in &schema.records {
        if record.edit_state != SemanticEditState::Editable && is_semantic_edited(&record.summary) {
            errors.push(format!(
                "{} is marked edited, but its semantic edit state is {} and cannot be destructively exported.",
                record.id,
                edit_state_label(record.edit_state)
            ));
        } else if record.edit_state != SemanticEditState::Editable
            && source_is_exportable(&record.source, project)
            && record.edit_state == SemanticEditState::InspectOnly
        {
            inspect_only_supported += 1;
        }
    }
    if inspect_only_supported > 0 {
        warnings.push(format!(
            "{} record(s) in writer-supported files remain inspect-only until their record families are fixture-backed for destructive export.",
            inspect_only_supported
        ));
    }
    for entity in &schema.entities {
        if entity.edit_state != SemanticEditState::Editable && is_semantic_edited(&entity.summary) {
            errors.push(format!(
                "{} is marked edited, but its semantic edit state is {} and cannot be destructively exported.",
                entity.id,
                edit_state_label(entity.edit_state)
            ));
        }
    }
}

fn live_semantic_ids(project: &ProvidenceProject) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    ids.extend(
        project
            .messages
            .iter()
            .map(|record| format!("message:{}", record.id)),
    );
    ids.extend(
        project
            .battles
            .iter()
            .map(|record| format!("battle:{}", record.id)),
    );
    ids.extend(
        project
            .treasures
            .iter()
            .map(|record| format!("treasure:{}", record.id)),
    );
    ids.extend(
        project
            .shops
            .iter()
            .map(|record| format!("shop:{}", record.id)),
    );
    ids.extend(
        project
            .simple_encounters
            .iter()
            .map(|record| format!("encounter:simple:{}", record.id)),
    );
    ids.extend(
        project
            .complex_encounters
            .iter()
            .map(|record| format!("encounter:complex:{}", record.id)),
    );
    ids.extend(
        project
            .triggers
            .iter()
            .filter(|trigger| trigger.source == "Data ED3")
            .map(|trigger| format!("macro:{}", trigger.record_index)),
    );
    ids
}

fn semantic_diagnostic_resolved_by_live_project(
    diagnostic: &SemanticDiagnostic,
    known_ids: &BTreeSet<String>,
) -> bool {
    if diagnostic.diagnostic_type != "unresolved-reference" {
        return false;
    }
    diagnostic
        .data
        .get("target")
        .and_then(Value::as_str)
        .map(|target| known_ids.contains(target))
        .unwrap_or(false)
}

fn source_is_exportable(source_id: &str, project: &ProvidenceProject) -> bool {
    let Some(name) = source_id.strip_prefix("source:file:") else {
        return false;
    };
    project
        .source
        .files
        .iter()
        .find(|file| file.name == name)
        .map(|file| file.editable)
        .unwrap_or(false)
}

fn validate_missing_sources(schema: &SemanticSchema, warnings: &mut Vec<String>) {
    for source in &schema.sources {
        if source.exists {
            continue;
        }
        if matches!(
            source.origin,
            SemanticSourceOrigin::RuntimeCache | SemanticSourceOrigin::SharedReference
        ) {
            continue;
        }
        warnings.push(format!(
            "Semantic source {} is referenced but missing from the raw source snapshot.",
            source.name
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provenance() -> Provenance {
        Provenance {
            source_file: "Data DD".to_string(),
            record_index: 0,
            byte_offset: 0,
            byte_length: 28,
            confidence: Confidence::Confirmed,
        }
    }

    fn trigger_with_actions(actions: Vec<Action>) -> TriggerRecord {
        TriggerRecord {
            id: "Data DD:0:0".to_string(),
            source: "Data DD".to_string(),
            level_type: Some(LevelType::Land),
            level_index: Some(0),
            record_index: 0,
            active: true,
            doorid: 101,
            landid: 0,
            target_x: 1,
            target_y: 1,
            percent: 100,
            coordinate: Some(MapCoordinate { x: 1, y: 1 }),
            actions,
            provenance: provenance(),
        }
    }

    fn action(slot: usize, raw_code: i16, id: i16) -> Action {
        Action {
            slot,
            raw_code,
            code: normalize_action_code(raw_code),
            id,
            label: "test".to_string(),
            category: ActionCategory::Unknown,
            gosub: false,
        }
    }

    #[test]
    fn validates_trigger_action_target_references() {
        let messages = BTreeSet::from([1]);
        let empty = BTreeSet::new();
        let refs = TargetReferenceSets {
            messages: &messages,
            battles: &empty,
            monsters: &empty,
            treasures: &empty,
            shops: &empty,
            simple_encounters: &empty,
            complex_encounters: &empty,
            macros: &empty,
            edcd_rows: &empty,
        };
        let trigger = trigger_with_actions(vec![
            action(0, 1, 1),
            action(1, 1, 2),
            action(2, 1, -1),
            action(3, 62, 200),
            action(1, 10, 3),
            action(8, 6, 4),
        ]);
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        validate_trigger_actions(&trigger, &refs, &mut errors, &mut warnings);

        assert!(errors
            .iter()
            .any(|message| message.contains("multiple actions in slot 1")));
        assert!(errors
            .iter()
            .any(|message| message.contains("slot 8 outside 0..7")));
        assert!(warnings
            .iter()
            .any(|message| message.contains("references message 2")));
        assert!(warnings
            .iter()
            .any(|message| message.contains("references treasure 3")));
        assert!(warnings
            .iter()
            .any(|message| message.contains("references shop 4")));
        assert!(!warnings
            .iter()
            .any(|message| message.contains("references message 1")));
        assert!(!warnings
            .iter()
            .any(|message| message.contains("references message -1")));
        assert!(!warnings
            .iter()
            .any(|message| message.contains("references message 200")));
    }

    #[test]
    fn validates_edcd_backed_actions_as_parameter_rows() {
        let empty = BTreeSet::new();
        let edcd_rows = BTreeSet::from([2]);
        let refs = TargetReferenceSets {
            messages: &empty,
            battles: &empty,
            monsters: &empty,
            treasures: &empty,
            shops: &empty,
            simple_encounters: &empty,
            complex_encounters: &empty,
            macros: &empty,
            edcd_rows: &edcd_rows,
        };
        let trigger = trigger_with_actions(vec![action(0, 2, 2), action(1, 48, 3)]);
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        validate_trigger_actions(&trigger, &refs, &mut errors, &mut warnings);

        assert!(!warnings
            .iter()
            .any(|message| message.contains("references battle 2")));
        assert!(warnings.iter().any(|message| {
            message.contains("references missing parameter row 3") && message.contains("slot 1")
        }));
    }

    #[test]
    fn opcode_8_is_not_validated_as_data_ed3_macro() {
        let empty = BTreeSet::new();
        let refs = TargetReferenceSets {
            messages: &empty,
            battles: &empty,
            monsters: &empty,
            treasures: &empty,
            shops: &empty,
            simple_encounters: &empty,
            complex_encounters: &empty,
            macros: &empty,
            edcd_rows: &empty,
        };
        let trigger = trigger_with_actions(vec![action(0, 8, 42)]);
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        validate_trigger_actions(&trigger, &refs, &mut errors, &mut warnings);

        assert!(!warnings
            .iter()
            .any(|message| message.contains("Data ED3 macro")));
        assert!(!warnings
            .iter()
            .any(|message| message.contains("parameter row")));
    }

    #[test]
    fn validates_battle_macro_references_with_negative_roots() {
        let macros = BTreeSet::from([2]);
        let mut warnings = Vec::new();

        validate_battle_macro_reference(10, -2, &macros, &mut warnings);
        validate_battle_macro_reference(11, 2, &macros, &mut warnings);
        validate_battle_macro_reference(12, -3, &macros, &mut warnings);

        assert!(!warnings.iter().any(|message| message.contains("Battle 10")));
        assert!(!warnings.iter().any(|message| message.contains("Battle 11")));
        assert!(warnings.iter().any(|message| {
            message.contains("Battle 12") && message.contains("Data ED3 macro 3")
        }));
    }

    #[test]
    fn suppresses_stale_semantic_unresolved_reference_when_live_target_exists() {
        let diagnostic = SemanticDiagnostic {
            id: "diagnostic:unresolved:0".to_string(),
            diagnostic_type: "unresolved-reference".to_string(),
            severity: DiagnosticSeverity::Warning,
            confidence: Confidence::SourceBacked,
            source: Some("Data DD".to_string()),
            message: "Data DD:0:5 action slot 1 references missing message 40".to_string(),
            data: BTreeMap::from([("target".to_string(), serde_json::json!("message:40"))]),
        };
        let known_ids = BTreeSet::from(["message:40".to_string()]);

        assert!(semantic_diagnostic_resolved_by_live_project(
            &diagnostic,
            &known_ids
        ));
    }

    #[test]
    fn summarizes_shared_resource_fallbacks() {
        let schema = SemanticSchema {
            entities: vec![
                resource_entity("resource:cicn:384", true),
                resource_entity("resource:cicn:385", true),
                resource_entity("resource:PICT:302", true),
            ],
            links: vec![
                resource_link("link:resource:0", "trigger:0", "resource:cicn:384"),
                resource_link("link:resource:1", "trigger:1", "resource:cicn:384"),
                resource_link("link:resource:2", "trigger:2", "resource:cicn:385"),
                resource_link("link:resource:3", "trigger:3", "resource:PICT:302"),
            ],
            ..SemanticSchema::default()
        };
        let known_ids = schema
            .entities
            .iter()
            .map(|entity| entity.id.clone())
            .collect::<BTreeSet<_>>();
        let links_by_target = links_by_target(&schema.links);
        let mut warnings = Vec::new();

        validate_resource_references(&schema, &known_ids, &links_by_target, &mut warnings);

        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("3 referenced shared Realmz resource(s)"));
        assert!(warnings[0].contains("4 semantic reference(s)"));
        assert!(warnings[0].contains("resource:cicn:384"));
    }

    #[test]
    fn summarizes_unresolved_semantic_link_endpoints() {
        let project = ProvidenceProject {
            semantic_schema: SemanticSchema {
                links: vec![
                    SemanticLink {
                        id: "link:missing:0".to_string(),
                        from: "action-slot:0".to_string(),
                        to: "macro:30001".to_string(),
                        kind: "calls_macro".to_string(),
                        confidence: Confidence::SourceBacked,
                        evidence: Vec::new(),
                        metadata: BTreeMap::new(),
                    },
                    SemanticLink {
                        id: "link:missing:1".to_string(),
                        from: "source:file:Data MENU".to_string(),
                        to: "message:1".to_string(),
                        kind: "contains".to_string(),
                        confidence: Confidence::SourceBacked,
                        evidence: Vec::new(),
                        metadata: BTreeMap::new(),
                    },
                ],
                ..SemanticSchema::default()
            },
            ..empty_project()
        };
        let mut errors = Vec::new();
        let mut warnings = Vec::new();

        validate_semantic_schema(&project, &mut errors, &mut warnings);

        let summaries = warnings
            .iter()
            .filter(|warning| warning.contains("Semantic graph has"))
            .collect::<Vec<_>>();
        assert_eq!(summaries.len(), 1);
        assert!(summaries[0].contains("4 unresolved imported link endpoint"));
        assert!(summaries[0].contains("link:missing:0"));
        assert!(!warnings
            .iter()
            .any(|warning| warning.starts_with("Semantic link link:missing")));
    }

    #[test]
    fn classic_text_len_matches_export_fallback_width() {
        assert_eq!(classic_text_len("abc"), 3);
        assert_eq!(classic_text_len("é"), 1);
        assert_eq!(classic_text_len("Realmzé"), 7);
    }

    #[test]
    fn validates_random_rect_authoring_bounds_and_percent() {
        let mut project = empty_project();
        project.maps.push(MapEntity {
            id: "land:0".to_string(),
            level_type: LevelType::Land,
            source: "Data LD".to_string(),
            index: 0,
            name: "Land 0".to_string(),
            width: MAP_SIZE,
            height: MAP_SIZE,
            tiles: vec![0; MAP_SIZE * MAP_SIZE],
            render: MapRender {
                tileset_id: "landlook-2".to_string(),
                landlook: Some(2),
                mode: RenderMode::OutdoorLandlook,
            },
            provenance: test_provenance("Data LD", 0, 0, crate::realmz::FIELD_BYTES),
        });
        project.random_levels.push(RandomLevel {
            id: "land:0:randlevel".to_string(),
            source: "Data RD".to_string(),
            level_type: LevelType::Land,
            level_index: 0,
            landlook: 2,
            is_dark: false,
            use_los: false,
            rects: vec![RandomRect {
                rect_index: 0,
                top: 4,
                left: 6,
                bottom: 2,
                right: 91,
                percent: 10001,
                battle_range: [0, 0],
                random_doors: [99, 0, 0],
                random_door_percent: [10001, 0, 0],
                only: false,
                option: 0,
                sound: 0,
                text: 0,
            }],
            raw_values: vec![0; crate::realmz::RANDLEVEL_BYTES / 2],
            provenance: test_provenance("Data RD", 0, 0, crate::realmz::RANDLEVEL_BYTES),
        });

        let report = validate_project(&project);

        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("outside the 90x90 map")));
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("invalid bounds")));
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("above 10000")));
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("outside -100..100")));
        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("points at missing Action Point")));
    }

    #[test]
    fn accepts_random_level_compatibility_bytes_that_disagree_with_authored_settings() {
        let mut project = empty_project();
        project.maps.push(test_map(LevelType::Land, 0, 0));
        let mut level = test_random_level(LevelType::Land, 0, 2);
        level.raw_values = vec![0; crate::realmz::RANDLEVEL_BYTES / 2];
        level.raw_values[260] = 0;
        project.random_levels.push(level);

        let report = validate_project(&project);

        assert!(!report
            .errors
            .iter()
            .any(|error| error.contains("runtime flags do not match its decoded settings")));
    }

    #[test]
    fn validates_empty_project_requires_a_map() {
        let project = empty_project();
        let report = validate_project(&project);

        assert!(report
            .errors
            .iter()
            .any(|error| error.contains("Project has no maps")));
    }

    #[test]
    fn validates_battle_grid_references_blank_monster_slots() {
        let mut project = empty_project();
        project.maps.push(test_map(LevelType::Land, 0, 1));
        project.monsters.push(test_monster(2, 0));
        let mut grid = vec![0; 13 * 13];
        grid[0] = 2;
        project.battles.push(test_battle(1, grid));

        let report = validate_project(&project);

        assert!(report
            .warnings
            .iter()
            .any(|warning| warning.contains("references blank monster 2")));
    }

    #[test]
    fn validates_authored_land_map_satisfies_map_presence() {
        let mut project = empty_project();
        project.maps.push(test_map(LevelType::Land, 0, 1));
        project
            .random_levels
            .push(test_random_level(LevelType::Land, 0, 2));

        let report = validate_project(&project);

        assert!(!report
            .errors
            .iter()
            .any(|error| error.contains("Project has no maps")));
        assert!(!report
            .errors
            .iter()
            .any(|error| error.contains("Realmz maps must be 90 x 90")));
    }

    #[test]
    fn authored_validation_uses_the_compiler_manifest_instead_of_source_inventory() {
        let mut project = empty_project();
        project.maps.push(test_map(LevelType::Land, 0, 1));
        project.scenario.shell = Some(test_scenario_shell("Authored Validation"));
        project.source.files.push(test_source_file(
            "ANNEX POISON",
            SourceFileRole::PassThrough,
            false,
        ));

        let report = validate_project(&project);
        let expected = crate::exporter::expected_authored_scenario_manifest_files(
            &project,
            ScenarioTarget::WindowsRealmzFolder,
        )
        .expect("compile authored manifest");

        assert_eq!(report.exportable_files, expected);
        assert!(report.pass_through_files.is_empty());
        assert!(report
            .exportable_files
            .iter()
            .any(|name| name == "Scenario"));
        assert!(report
            .exportable_files
            .iter()
            .any(|name| name == "Scenario.rsrc"));
        assert!(report
            .exportable_files
            .iter()
            .any(|name| name == "Data Solids"));
        assert!(!report
            .exportable_files
            .iter()
            .any(|name| name == "ANNEX POISON"));
        assert!(!report
            .warnings
            .iter()
            .any(|warning| warning.contains("No Scenario file was imported")));
        assert!(!report
            .warnings
            .iter()
            .any(|warning| warning.contains("Data Solids is missing")));
    }

    #[test]
    fn imported_validation_keeps_source_inventory_as_its_compatibility_boundary() {
        let mut project = empty_project();
        project.source.origin = Some(ProjectOrigin::Imported);
        project.source.files = vec![
            test_source_file("Data SD2", SourceFileRole::SupportedBinary, true),
            test_source_file("Legacy Notes", SourceFileRole::PassThrough, false),
        ];

        let report = validate_project(&project);

        assert_eq!(report.exportable_files, ["Data SD2"]);
        assert_eq!(report.pass_through_files, ["Legacy Notes"]);
        assert!(!report
            .exportable_files
            .iter()
            .any(|name| name == "Scenario.rsrc"));
    }

    #[test]
    fn validates_map_indices_must_be_dense() {
        let mut project = empty_project();
        project.maps.push(test_map(LevelType::Land, 1, 1));

        let report = validate_project(&project);

        assert!(report.errors.iter().any(|error| {
            error.contains("land maps must have dense indices; expected 0, found 1")
        }));
    }

    #[test]
    fn authored_map_fields_roundtrip_through_realmz_writer() {
        let map = test_map(LevelType::Land, 0, 7);

        let output =
            crate::realmz::write_fields(&[map], LevelType::Land).expect("write authored map");
        let parsed = crate::realmz::parse_fields(&output, LevelType::Land, "Data LD");

        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "land:0");
        assert_eq!(parsed[0].tiles.len(), MAP_SIZE * MAP_SIZE);
        assert_eq!(parsed[0].tiles[0], 7);
        assert_eq!(parsed[0].tiles[MAP_SIZE * MAP_SIZE - 1], 7);
    }

    fn resource_entity(id: &str, shared_fallback: bool) -> SemanticEntity {
        SemanticEntity {
            id: id.to_string(),
            entity_type: "resource".to_string(),
            label: id.to_string(),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::Inferred,
            source: "resource-fallback".to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: BTreeMap::from([
                ("referenceOnly".to_string(), serde_json::json!(true)),
                (
                    "sharedFallback".to_string(),
                    serde_json::json!(shared_fallback),
                ),
                ("scenarioSupplied".to_string(), serde_json::json!(false)),
            ]),
        }
    }

    fn resource_link(id: &str, from: &str, to: &str) -> SemanticLink {
        SemanticLink {
            id: id.to_string(),
            from: from.to_string(),
            to: to.to_string(),
            kind: "uses_resource".to_string(),
            confidence: Confidence::SourceBacked,
            evidence: Vec::new(),
            metadata: BTreeMap::new(),
        }
    }

    fn empty_project() -> ProvidenceProject {
        ProvidenceProject {
            schema_version: PROJECT_SCHEMA_VERSION,
            app_version: "test".to_string(),
            scenario: ScenarioMeta {
                id: "test".to_string(),
                name: "test".to_string(),
                project_path: String::new(),
                imported_at: String::new(),
                shell: None,
                support_file: None,
                contact_info: None,
                restrictions: None,
                global_macro_hooks: None,
                security_backup: None,
            },
            source: SourceSnapshot {
                origin: Some(ProjectOrigin::Authored),
                source_path: String::new(),
                raw_sources_dir: String::new(),
                files: Vec::new(),
                immutable: false,
            },
            maps: Vec::new(),
            land_layout: None,
            map_records: Vec::new(),
            tile_attributes: Vec::new(),
            custom_landlooks: Vec::new(),
            triggers: Vec::new(),
            random_levels: Vec::new(),
            extracodes: Vec::new(),
            messages: Vec::new(),
            option_labels: Vec::new(),
            battles: Vec::new(),
            monsters: Vec::new(),
            monster_sets: Vec::new(),
            monster_descriptions: Vec::new(),
            monster_icon_overrides: Vec::new(),
            scenario_icon_resources: Vec::new(),
            scenario_items: Vec::new(),
            item_texts: Vec::new(),
            treasures: Vec::new(),
            shops: Vec::new(),
            simple_encounters: Vec::new(),
            complex_encounters: Vec::new(),
            thief_encounters: Vec::new(),
            timed_encounters: Vec::new(),
            quest_labels: Vec::new(),
            spell_overrides: Vec::new(),
            race_overrides: Vec::new(),
            caste_overrides: Vec::new(),
            rule_names: default_rule_names(),
            assets: Vec::new(),
            asset_catalog: AssetCatalog::default(),
            editor_metadata: EditorMetadata::default(),
            records: RecordCatalog::default(),
            diagnostics: Vec::new(),
            semantic_schema: SemanticSchema::default(),
            validation: ValidationReport::default(),
        }
    }

    fn test_scenario_shell(source_file: &str) -> ScenarioShell {
        ScenarioShell {
            source_file: source_file.to_string(),
            rec_level: 1,
            max_level: 999,
            land_level: 0,
            look_x: 0,
            look_y: 0,
            creator_user: String::new(),
            codeseg1: vec![0; 20],
            codeseg2: vec![0; 20],
            trailing_bytes: Vec::new(),
            raw_bytes: Vec::new(),
            authored: true,
            provenance: None,
        }
    }

    fn test_source_file(name: &str, role: SourceFileRole, editable: bool) -> SourceFile {
        SourceFile {
            name: name.to_string(),
            relative_path: name.to_string(),
            bytes: 1,
            sha256: "fixture".to_string(),
            role,
            editable,
        }
    }

    fn test_map(level_type: LevelType, index: usize, tile: i16) -> MapEntity {
        let source = match level_type {
            LevelType::Land => "Data LD",
            LevelType::Dungeon => "Data DL",
        };
        MapEntity {
            id: format!("{}:{}", level_type.as_str(), index),
            level_type,
            source: source.to_string(),
            index,
            name: format!("{} Level {}", level_type.as_str(), index),
            width: MAP_SIZE,
            height: MAP_SIZE,
            tiles: vec![tile; MAP_SIZE * MAP_SIZE],
            render: match level_type {
                LevelType::Land => MapRender {
                    tileset_id: "landlook-2".to_string(),
                    landlook: Some(2),
                    mode: RenderMode::OutdoorLandlook,
                },
                LevelType::Dungeon => MapRender {
                    tileset_id: "dungeon-top-down-302".to_string(),
                    landlook: Some(-1),
                    mode: RenderMode::DungeonTopDown,
                },
            },
            provenance: test_provenance(
                source,
                index,
                index * crate::realmz::FIELD_BYTES,
                crate::realmz::FIELD_BYTES,
            ),
        }
    }

    fn test_random_level(level_type: LevelType, index: usize, landlook: i8) -> RandomLevel {
        let source = match level_type {
            LevelType::Land => "Data RD",
            LevelType::Dungeon => "Data RDD",
        };
        RandomLevel {
            id: format!("{}:{}:randlevel", level_type.as_str(), index),
            source: source.to_string(),
            level_type,
            level_index: index,
            landlook,
            is_dark: false,
            use_los: false,
            rects: Vec::new(),
            raw_values: Vec::new(),
            provenance: test_provenance(
                source,
                index,
                index * crate::realmz::RANDLEVEL_BYTES,
                crate::realmz::RANDLEVEL_BYTES,
            ),
        }
    }

    fn test_battle(id: usize, grid: Vec<i16>) -> BattleRecord {
        BattleRecord {
            id,
            grid,
            dist: 1,
            message_before: 0,
            message_after: 0,
            battle_macro: 0,
            raw_bytes: vec![0; crate::realmz::BATTLE_BYTES],
            authored: true,
            provenance: test_provenance(
                "Data BD",
                id,
                id * crate::realmz::BATTLE_BYTES,
                crate::realmz::BATTLE_BYTES,
            ),
        }
    }

    fn test_monster(id: usize, hit_dice: u8) -> MonsterRecord {
        MonsterRecord {
            id,
            hit_dice,
            stamina_bonus: 0,
            agility: if hit_dice == 0 { 0 } else { 10 },
            name_id: 0,
            movement_max: if hit_dice == 0 { 0 } else { 10 },
            armor: 0,
            magic_resistance: 0,
            distance: 0,
            traitor: 0,
            size: 0,
            type_flags: vec![0; 8],
            attack_count: if hit_dice == 0 { 0 } else { 1 },
            magic_attack_count: 0,
            attacks: vec![vec![0; 4]; 5],
            damage_bonus: 0,
            cast_percent: 0,
            run_percent: 0,
            surrender_percent: 0,
            missile_percent: 0,
            can_summon: 0,
            saves: vec![0; 6],
            spell_immunities: vec![0; 6],
            money: vec![0; 3],
            spells: vec![0; 10],
            items: vec![0; 6],
            weapon: 0,
            icon_id: 0,
            spell_points: 0,
            exp: 0,
            stamina: 0,
            stamina_max: 0,
            underneath: vec![0; 4],
            target: 0,
            guarding: 0,
            not_on_menu: false,
            been_attacked: 0,
            movement: 0,
            magic_to_hit: 0,
            conditions: vec![0; 40],
            lr: 0,
            up: 0,
            attack_num: 0,
            bonus_attack: 0,
            death_macro: 0,
            max_spell_points: 0,
            display_name: if hit_dice == 0 {
                String::new()
            } else {
                format!("Monster {id}")
            },
            raw_bytes: vec![0; crate::realmz::MONSTER_BYTES],
            authored: true,
            provenance: test_provenance(
                "Data MD",
                id,
                id * crate::realmz::MONSTER_BYTES,
                crate::realmz::MONSTER_BYTES,
            ),
        }
    }

    fn test_provenance(
        source_file: &str,
        record_index: usize,
        byte_offset: usize,
        byte_length: usize,
    ) -> Provenance {
        Provenance {
            source_file: source_file.to_string(),
            record_index,
            byte_offset,
            byte_length,
            confidence: Confidence::SourceBacked,
        }
    }
}

fn validate_resource_references(
    schema: &SemanticSchema,
    known_ids: &BTreeSet<String>,
    links_by_target: &BTreeMap<String, Vec<&SemanticLink>>,
    warnings: &mut Vec<String>,
) {
    let mut missing_link_count = 0usize;
    for link in &schema.links {
        if link.to.starts_with("resource:") && !known_ids.contains(&link.to) {
            if missing_link_count < 30 {
                warnings.push(format!(
                    "{} references missing resource endpoint {}.",
                    link.from, link.to
                ));
            }
            missing_link_count += 1;
        }
    }
    if missing_link_count > 30 {
        warnings.push(format!(
            "{} additional missing resource endpoints were found.",
            missing_link_count - 30
        ));
    }

    let mut fallback_resources: Vec<(String, usize)> = Vec::new();
    let mut hard_missing_count = 0usize;
    for entity in schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "resource")
    {
        let reference_only = bool_summary(&entity.summary, "referenceOnly");
        let shared_fallback = bool_summary(&entity.summary, "sharedFallback");
        let scenario_supplied = entity
            .summary
            .get("scenarioSupplied")
            .and_then(Value::as_bool);
        if !reference_only && scenario_supplied != Some(false) {
            continue;
        }
        let consumers = links_by_target
            .get(&entity.id)
            .map(|links| {
                links
                    .iter()
                    .filter(|link| link.kind != "member_of_resource_type")
                    .count()
            })
            .unwrap_or(0);
        if shared_fallback {
            fallback_resources.push((entity.id.clone(), consumers));
        } else {
            hard_missing_count += 1;
            if hard_missing_count <= 24 {
                warnings.push(format!(
                    "{} is referenced by {} semantic link(s), but no scenario resource or shared fallback is confirmed.",
                    entity.id, consumers
                ));
            }
        }
    }
    if !fallback_resources.is_empty() {
        let fallback_reference_count: usize = fallback_resources
            .iter()
            .map(|(_, consumers)| *consumers)
            .sum();
        let examples = fallback_resources
            .iter()
            .take(5)
            .map(|(id, consumers)| format!("{id} ({consumers})"))
            .collect::<Vec<_>>()
            .join(", ");
        warnings.push(format!(
            "{} referenced shared Realmz resource(s) are not scenario-supplied and will rely on fallback provenance when available ({} semantic reference(s); examples: {}).",
            fallback_resources.len(),
            fallback_reference_count,
            examples
        ));
    }
    if hard_missing_count > 24 {
        warnings.push(format!(
            "{} additional resource reference(s) have no confirmed fallback.",
            hard_missing_count - 24
        ));
    }
}

fn validate_runtime_cache_entities(
    schema: &SemanticSchema,
    errors: &mut Vec<String>,
    warnings: &mut Vec<String>,
) {
    let caches: Vec<_> = schema
        .entities
        .iter()
        .filter(|entity| entity.entity_type == "runtime-cache")
        .collect();
    if !caches.is_empty() {
        warnings.push(format!(
            "{} generated runtime cache model(s) are present for relationship tracing only; export will not author CL/CD/CE/CE2/CS/CT/CTD3/Data MENU cache files.",
            caches.len()
        ));
    }
    for cache in caches {
        if is_semantic_edited(&cache.summary) {
            errors.push(format!(
                "{} is a generated runtime cache and cannot be edited or exported as authored scenario data.",
                cache.id
            ));
        }
    }
}

fn links_by_target(links: &[SemanticLink]) -> BTreeMap<String, Vec<&SemanticLink>> {
    let mut by_target: BTreeMap<String, Vec<&SemanticLink>> = BTreeMap::new();
    for link in links {
        by_target.entry(link.to.clone()).or_default().push(link);
    }
    by_target
}

fn is_generated_cache_name(name: &str) -> bool {
    matches!(
        name,
        "CL" | "CD" | "CE" | "CE2" | "CS" | "CT" | "CTD3" | "Data MENU"
    )
}

fn is_semantic_edited(summary: &BTreeMap<String, Value>) -> bool {
    summary.get("edited").and_then(Value::as_bool) == Some(true)
}

fn bool_summary(summary: &BTreeMap<String, Value>, key: &str) -> bool {
    summary.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn edit_state_label(state: SemanticEditState) -> &'static str {
    match state {
        SemanticEditState::Editable => "editable",
        SemanticEditState::InspectOnly => "inspect-only",
        SemanticEditState::Blocked => "blocked",
    }
}
