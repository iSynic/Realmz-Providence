use crate::byte_inspection::inspect_classic_owned_byte_diff;
use crate::byte_inspection::inspect_classic_resource_fork_diff;
use crate::catalog_libraries::inspect_application_library;
use crate::catalog_libraries::inspect_monster_scrapbook;
use crate::catalog_libraries::inspect_reference_catalog;
use crate::cicn_inspection::inspect_cicn_resources;
use crate::combat_inspection::inspect_battle_catalog;
use crate::combat_inspection::inspect_monster_catalog;
use crate::comparisons::compare_project_semantics;
use crate::comparisons::compare_project_snapshots;
use crate::economy_inspection::inspect_option_label_catalog;
use crate::economy_inspection::inspect_shop_catalog;
use crate::economy_inspection::inspect_treasure_catalog;
use crate::encounter_inspection::inspect_complex_catalog;
use crate::encounter_inspection::inspect_rogue_catalog;
use crate::encounter_inspection::inspect_simple_catalog;
use crate::encounter_inspection::inspect_timed_catalog;
use crate::extra_action_certification::certify_extra_action_create;
use crate::extra_action_certification::certify_extra_action_target;
use crate::extra_code_certification::certify_extra_code_battle_range;
use crate::extra_code_certification::certify_extra_code_branch;
use crate::extra_code_certification::certify_extra_code_value;
use crate::foundation::verify_foundation;
use crate::joined_dungeon::inspect_joined_dungeon;
use crate::monster_certification::certify_monster_death_macro;
use crate::output::usage_error;
use crate::pict_inspection::inspect_pict_resources;
use crate::projects::create_project;
use crate::projects::initialize_store;
use crate::projects::rebuild_store;
use crate::rebuilt_inspection::inspect_rebuilt_content;
use crate::rebuilt_inspection::inspect_rebuilt_package_file;
use crate::rebuilt_inspection::inspect_rebuilt_world;
use crate::rules_inspection::inspect_custom_names;
use crate::rules_inspection::inspect_data_caste;
use crate::rules_inspection::inspect_data_race;
use crate::rules_inspection::inspect_rule_catalog;
use crate::rules_inspection::inspect_scenario_items;
use crate::rules_inspection::inspect_standard_items;
use crate::rules_inspection::inspect_standard_spells;
use crate::scenario_inspection::certify_scenario_contact;
use crate::scenario_inspection::inspect_scenario_bootstrap;
use crate::scenario_inspection::inspect_scenario_contact;
use crate::sound_inspection::inspect_snd_resources;
use crate::timed_certification::certify_timed_door;
use crate::world_inspection::inspect_dungeon_slice;
use crate::world_inspection::inspect_land_layout;
use crate::world_inspection::inspect_mapstats_reference;
use crate::world_inspection::inspect_player_map_names;
use crate::world_inspection::inspect_player_maps;
use std::process::ExitCode;

type Arguments<'a> = &'a mut dyn Iterator<Item = String>;

#[cfg(test)]
mod tests;
type CommandHandler = fn(Arguments<'_>) -> ExitCode;

const COMMANDS: &[(&str, CommandHandler)] = &[
    ("build-identity", build_identity_command),
    ("verify-foundation", verify_foundation_command),
    ("project-new", project_new_command),
    ("store-init", store_init_command),
    ("store-rebuild", store_rebuild_command),
    (
        "compare-project-snapshots",
        compare_project_snapshots_command,
    ),
    (
        "compare-project-semantics",
        compare_project_semantics_command,
    ),
    ("inspect-owned-byte-diff", inspect_owned_byte_diff_command),
    (
        "inspect-resource-fork-diff",
        inspect_resource_fork_diff_command,
    ),
    (
        "inspect-application-library",
        inspect_application_library_command,
    ),
    (
        "inspect-reference-catalog",
        inspect_reference_catalog_command,
    ),
    (
        "inspect-rebuilt-package-file",
        inspect_rebuilt_package_file_command,
    ),
    (
        "inspect-scenario-bootstrap",
        inspect_scenario_bootstrap_command,
    ),
    ("inspect-scenario-contact", inspect_scenario_contact_command),
    ("certify-scenario-contact", certify_scenario_contact_command),
    ("inspect-data-race", inspect_data_race_command),
    ("inspect-data-caste", inspect_data_caste_command),
    ("inspect-custom-names", inspect_custom_names_command),
    ("inspect-standard-items", inspect_standard_items_command),
    ("inspect-standard-spells", inspect_standard_spells_command),
    ("inspect-rebuilt-content", inspect_rebuilt_content_command),
    ("inspect-rebuilt-world", inspect_rebuilt_world_command),
    ("inspect-scenario-items", inspect_scenario_items_command),
    ("inspect-rule-catalog", inspect_rule_catalog_command),
    ("inspect-battle-catalog", inspect_battle_catalog_command),
    ("inspect-treasure-catalog", inspect_treasure_catalog_command),
    ("inspect-shop-catalog", inspect_shop_catalog_command),
    (
        "inspect-option-label-catalog",
        inspect_option_label_catalog_command,
    ),
    (
        "inspect-mapstats-reference",
        inspect_mapstats_reference_command,
    ),
    ("inspect-land-layout", inspect_land_layout_command),
    ("inspect-player-maps", inspect_player_maps_command),
    ("inspect-player-map-names", inspect_player_map_names_command),
    ("inspect-cicn-resources", inspect_cicn_resources_command),
    ("inspect-pict-resources", inspect_pict_resources_command),
    ("inspect-snd-resources", inspect_snd_resources_command),
    ("inspect-dungeon-slice", inspect_dungeon_slice_command),
    ("inspect-joined-dungeon", inspect_joined_dungeon_command),
    ("certify-extra-code-value", certify_extra_code_value_command),
    (
        "certify-extra-action-target",
        certify_extra_action_target_command,
    ),
    (
        "certify-extra-action-create",
        certify_extra_action_create_command,
    ),
    ("certify-timed-door", certify_timed_door_command),
    (
        "certify-monster-death-macro",
        certify_monster_death_macro_command,
    ),
    (
        "certify-extra-code-battle-range",
        certify_extra_code_battle_range_command,
    ),
    (
        "certify-extra-code-branch",
        certify_extra_code_branch_command,
    ),
    ("inspect-monster-catalog", inspect_monster_catalog_command),
    (
        "inspect-monster-scrapbook",
        inspect_monster_scrapbook_command,
    ),
    ("inspect-complex-catalog", inspect_complex_catalog_command),
    ("inspect-rogue-catalog", inspect_rogue_catalog_command),
    ("inspect-timed-catalog", inspect_timed_catalog_command),
    ("inspect-simple-catalog", inspect_simple_catalog_command),
];

fn build_identity_command(_arguments: Arguments<'_>) -> ExitCode {
    println!(
        "{}",
        serde_json::to_string_pretty(&providence_core::build_identity::current("providence-cli"))
            .expect("build identity serializes")
    );
    ExitCode::SUCCESS
}

pub(crate) fn dispatch(command: &str, arguments: Arguments<'_>) -> Option<ExitCode> {
    COMMANDS
        .iter()
        .find(|(name, _)| *name == command)
        .map(|(_, handler)| handler(arguments))
}

fn verify_foundation_command(_arguments: Arguments<'_>) -> ExitCode {
    verify_foundation()
}

fn project_new_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(project_id), Some(directory)) => {
            match (arguments.next(), arguments.next(), arguments.next()) {
                (None, None, None) => create_project(&project_id, &directory),
                (Some(flag), Some(root), None) if flag == "--application-data-directory" => {
                    crate::projects::create_project_with_support(
                        &project_id,
                        &directory,
                        Some(std::path::Path::new(&root)),
                    )
                }
                _ => usage_error("project-new accepts --application-data-directory <directory>"),
            }
        }
        _ => usage_error("project-new requires <project-id> <project-directory>"),
    }
}

fn store_init_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(snapshot), Some(directory)) => initialize_store(&snapshot, &directory),
        _ => usage_error("store-init requires <snapshot.json> <project-directory>"),
    }
}

fn store_rebuild_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(directory) => rebuild_store(&directory),
        None => usage_error("store-rebuild requires <project-directory>"),
    }
}

fn compare_project_snapshots_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(first), Some(second)) => compare_project_snapshots(&first, &second),
        _ => usage_error(
            "compare-project-snapshots requires <first project.providence.json> <second project.providence.json>",
        ),
    }
}

fn compare_project_semantics_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(first), Some(second)) => compare_project_semantics(&first, &second),
        _ => usage_error(
            "compare-project-semantics requires <first project.providence.json> <second project.providence.json>",
        ),
    }
}

fn inspect_owned_byte_diff_command(arguments: Arguments<'_>) -> ExitCode {
    {
        match (arguments.next(), arguments.next(), arguments.next()) {
            (Some(family), Some(before), Some(after)) => {
                inspect_classic_owned_byte_diff(&family, &before, &after)
            }
            _ => usage_error(
                "inspect-owned-byte-diff requires <fixed-record-family> <before file> <after file>",
            ),
        }
    }
}

fn inspect_resource_fork_diff_command(arguments: Arguments<'_>) -> ExitCode {
    {
        match (
            arguments.next(),
            arguments.next(),
            arguments.next(),
            arguments.next(),
        ) {
            (Some(before), Some(after), Some(resource_type), Some(resource_id)) => {
                inspect_classic_resource_fork_diff(&before, &after, &resource_type, &resource_id)
            }
            _ => usage_error(
                "inspect-resource-fork-diff requires <before file> <after file> <four-byte resource type> <signed resource id>",
            ),
        }
    }
}

fn inspect_application_library_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(directory) => inspect_application_library(&directory),
        None => usage_error("inspect-application-library requires <library-directory>"),
    }
}

fn inspect_reference_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(directory) => inspect_reference_catalog(&directory),
        None => usage_error("inspect-reference-catalog requires <catalog-directory>"),
    }
}

fn inspect_rebuilt_package_file_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_rebuilt_package_file(&path),
        None => usage_error("inspect-rebuilt-package-file requires <package.realmz2 path>"),
    }
}

fn inspect_scenario_bootstrap_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(startup), Some(restrictions)) => inspect_scenario_bootstrap(&startup, &restrictions),
        _ => usage_error(
            "inspect-scenario-bootstrap requires <scenario startup path> <Data RI path>",
        ),
    }
}

fn inspect_scenario_contact_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_scenario_contact(&path),
        None => usage_error("inspect-scenario-contact requires <Data CI path>"),
    }
}

fn certify_scenario_contact_command(arguments: Arguments<'_>) -> ExitCode {
    {
        match (arguments.next(), arguments.next(), arguments.next()) {
            (Some(path), Some(field), Some(value)) => {
                certify_scenario_contact(&path, &field, &value)
            }
            _ => usage_error(
                "certify-scenario-contact requires <Data CI path> <title|version|date|author|email|web|fee|description> <value>",
            ),
        }
    }
}

fn inspect_data_race_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_data_race(&path),
        None => usage_error("inspect-data-race requires <Data Race path>"),
    }
}

fn inspect_data_caste_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_data_caste(&path),
        None => usage_error("inspect-data-caste requires <Data Caste path>"),
    }
}

fn inspect_custom_names_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_custom_names(&path),
        None => usage_error("inspect-custom-names requires <Custom Names resource path>"),
    }
}

fn inspect_standard_items_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(path), Some(text_path)) => inspect_standard_items(&path, &text_path),
        _ => usage_error("inspect-standard-items requires <Data ID path> <Data ID.rsrc path>"),
    }
}

fn inspect_standard_spells_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(path), Some(names_path)) => inspect_standard_spells(&path, &names_path),
        _ => usage_error(
            "inspect-standard-spells requires <Data S path> <Custom Names resource path>",
        ),
    }
}

fn inspect_rebuilt_content_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_rebuilt_content(&path),
        None => usage_error("inspect-rebuilt-content requires <project.providence.json path>"),
    }
}

fn inspect_rebuilt_world_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_rebuilt_world(&path),
        None => usage_error("inspect-rebuilt-world requires <project.providence.json path>"),
    }
}

fn inspect_scenario_items_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_scenario_items(&path),
        None => usage_error("inspect-scenario-items requires <Data NI path>"),
    }
}

fn inspect_rule_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    {
        match (arguments.next(), arguments.next(), arguments.next()) {
            (Some(race_path), Some(caste_path), Some(names_path)) => {
                inspect_rule_catalog(&race_path, &caste_path, &names_path)
            }
            _ => usage_error(
                "inspect-rule-catalog requires <Data Race path> <Data Caste path> <Custom Names path>",
            ),
        }
    }
}

fn inspect_battle_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    match (
        arguments.next(),
        arguments.next(),
        arguments.next(),
        arguments.next(),
    ) {
        (Some(battles), Some(monsters), Some(messages), Some(macros)) => {
            inspect_battle_catalog(&battles, &monsters, &messages, &macros)
        }
        _ => usage_error(
            "inspect-battle-catalog requires <Data BD path> <Data MD path> <Data SD2 path> <Data ED3 path>",
        ),
    }
}

fn inspect_treasure_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_treasure_catalog(&path),
        None => usage_error("inspect-treasure-catalog requires <Data TD path>"),
    }
}

fn inspect_shop_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_shop_catalog(&path),
        None => usage_error("inspect-shop-catalog requires <Data SD path>"),
    }
}

fn inspect_option_label_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_option_label_catalog(&path),
        None => usage_error("inspect-option-label-catalog requires <Data OD path>"),
    }
}

fn inspect_mapstats_reference_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(landlook), Some(path)) => inspect_mapstats_reference(&landlook, &path),
        _ => usage_error("inspect-mapstats-reference requires <landlook> <Map Stats path>"),
    }
}

fn inspect_land_layout_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_land_layout(&path),
        None => usage_error("inspect-land-layout requires <Layout path>"),
    }
}

fn inspect_player_maps_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_player_maps(&path),
        None => usage_error("inspect-player-maps requires <Data MD2 path>"),
    }
}

fn inspect_player_map_names_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_player_map_names(&path),
        None => usage_error("inspect-player-map-names requires <Scenario.rsrc path>"),
    }
}

fn inspect_cicn_resources_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => match arguments.next() {
            Some(resource_id) => match resource_id.parse::<i16>() {
                Ok(resource_id) => inspect_cicn_resources(&path, Some(resource_id)),
                Err(_) => usage_error("sample resource ID must be a signed 16-bit integer"),
            },
            None => inspect_cicn_resources(&path, None),
        },
        None => usage_error("inspect-cicn-resources requires <resource-fork path>"),
    }
}

fn inspect_pict_resources_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => match arguments.next() {
            Some(resource_id) => match resource_id.parse::<i16>() {
                Ok(resource_id) => inspect_pict_resources(&path, Some(resource_id)),
                Err(_) => usage_error("sample resource ID must be a signed 16-bit integer"),
            },
            None => inspect_pict_resources(&path, None),
        },
        None => usage_error("inspect-pict-resources requires <resource-fork path>"),
    }
}

fn inspect_snd_resources_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => match arguments.next() {
            Some(resource_id) => match resource_id.parse::<i16>() {
                Ok(resource_id) => inspect_snd_resources(&path, Some(resource_id)),
                Err(_) => usage_error("sample resource ID must be a signed 16-bit integer"),
            },
            None => inspect_snd_resources(&path, None),
        },
        None => usage_error("inspect-snd-resources requires <resource-fork path>"),
    }
}

fn inspect_dungeon_slice_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(directory) => inspect_dungeon_slice(&directory),
        None => usage_error("inspect-dungeon-slice requires <scenario directory>"),
    }
}

fn inspect_joined_dungeon_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(directory) => inspect_joined_dungeon(&directory, arguments.next().as_deref()),
        None => usage_error("inspect-joined-dungeon requires <scenario directory>"),
    }
}

fn certify_extra_code_value_command(arguments: Arguments<'_>) -> ExitCode {
    match (
        arguments.next(),
        arguments.next(),
        arguments.next(),
        arguments.next(),
    ) {
        (Some(path), Some(row), Some(index), Some(target)) => {
            certify_extra_code_value(&path, &row, &index, &target)
        }
        _ => usage_error(
            "certify-extra-code-value requires <Data EDCD path> <row> <index> <target-id>",
        ),
    }
}

fn certify_extra_action_target_command(arguments: Arguments<'_>) -> ExitCode {
    match (
        arguments.next(),
        arguments.next(),
        arguments.next(),
        arguments.next(),
    ) {
        (Some(path), Some(row), Some(slot), Some(target)) => {
            certify_extra_action_target(&path, &row, &slot, &target)
        }
        _ => usage_error(
            "certify-extra-action-target requires <Data ED3 path> <row> <slot> <target-id>",
        ),
    }
}

fn certify_extra_action_create_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(path), Some(target)) => certify_extra_action_create(&path, &target),
        _ => usage_error("certify-extra-action-create requires <Data ED3 path> <target-native-id>"),
    }
}

fn certify_timed_door_command(arguments: Arguments<'_>) -> ExitCode {
    {
        match (arguments.next(), arguments.next(), arguments.next()) {
            (Some(path), Some(row), Some(target)) => certify_timed_door(&path, &row, &target),
            _ => usage_error(
                "certify-timed-door requires <Data TD3 path> <row> <target-extra-action-point-id>",
            ),
        }
    }
}

fn certify_monster_death_macro_command(arguments: Arguments<'_>) -> ExitCode {
    {
        match (arguments.next(), arguments.next(), arguments.next()) {
            (Some(path), Some(row), Some(target)) => {
                certify_monster_death_macro(&path, &row, &target)
            }
            _ => usage_error(
                "certify-monster-death-macro requires <Data MD path> <row> <target-extra-action-point-id>",
            ),
        }
    }
}

fn certify_extra_code_battle_range_command(arguments: Arguments<'_>) -> ExitCode {
    match (
        arguments.next(),
        arguments.next(),
        arguments.next(),
        arguments.next(),
    ) {
        (Some(path), Some(row), Some(low), Some(high)) => {
            certify_extra_code_battle_range(&path, &row, &low, &high)
        }
        _ => usage_error(
            "certify-extra-code-battle-range requires <Data EDCD path> <row> <low-id> <high-id>",
        ),
    }
}

fn certify_extra_code_branch_command(arguments: Arguments<'_>) -> ExitCode {
    match (
        arguments.next(),
        arguments.next(),
        arguments.next(),
        arguments.next(),
        arguments.next(),
    ) {
        (Some(path), Some(row), Some(layout), Some(mode), Some(target)) => {
            certify_extra_code_branch(&path, &row, &layout, &mode, &target)
        }
        _ => usage_error(
            "certify-extra-code-branch requires <Data EDCD path> <row> <choice|force> <mode> <target-id>",
        ),
    }
}

fn inspect_monster_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    match (
        arguments.next(),
        arguments.next(),
        arguments.next(),
        arguments.next(),
        arguments.next(),
    ) {
        (Some(normal), Some(monster), Some(mega), Some(descriptions), Some(macros)) => {
            inspect_monster_catalog(&normal, &monster, &mega, &descriptions, &macros)
        }
        _ => usage_error(
            "inspect-monster-catalog requires <Data MD path> <Data MD1 path> <Data MD-1 path> <Data DES path> <Data ED3 path>",
        ),
    }
}

fn inspect_monster_scrapbook_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_monster_scrapbook(&path),
        None => usage_error("inspect-monster-scrapbook requires <Monster Scrap Book path>"),
    }
}

fn inspect_complex_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    {
        match (arguments.next(), arguments.next(), arguments.next()) {
            (Some(complex), Some(rogue), Some(extra_codes)) => {
                inspect_complex_catalog(&complex, &rogue, &extra_codes)
            }
            _ => usage_error(
                "inspect-complex-catalog requires <Data ED2 path> <Data TD2 path> <Data EDCD path>",
            ),
        }
    }
}

fn inspect_rogue_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    match arguments.next() {
        Some(path) => inspect_rogue_catalog(&path),
        None => usage_error("inspect-rogue-catalog requires <Data TD2 path>"),
    }
}

fn inspect_timed_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(timed), Some(macros)) => inspect_timed_catalog(&timed, &macros),
        _ => usage_error("inspect-timed-catalog requires <Data TD3 path> <Data ED3 path>"),
    }
}

fn inspect_simple_catalog_command(arguments: Arguments<'_>) -> ExitCode {
    match (arguments.next(), arguments.next()) {
        (Some(encounters), Some(messages)) => inspect_simple_catalog(&encounters, &messages),
        _ => usage_error("inspect-simple-catalog requires <Data ED path> <Data SD2 path>"),
    }
}
