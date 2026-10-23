#![forbid(unsafe_code)]

mod application_media_import;
mod application_terrain;
mod artwork_conflict;
mod asset_export;
mod asset_import;
mod built_native_files;
mod catalogs;
mod classic_compilation;
mod classic_dungeon_import;
mod classic_export_plan;
mod classic_export_trim;
mod classic_import_files;
mod classic_land_import;
mod classic_media_import;
mod classic_publication;
mod classic_rule_preview;
mod classic_rule_selection;
mod classic_source_retention;
mod classic_stuffit;
mod classic_timed_warnings;
mod combat_import;
mod custom_landlook;
mod demo;
mod diagnostic_cache;
mod diagnostic_policy;
mod discovery_flow;
mod document_catalogs;
mod dungeon_feature_commands;
mod economy_import;
mod encounter_import;
mod extra_code_commands;
mod icon_media;
mod identity;
mod image_files;
mod import_inputs;
mod import_repair;
mod item_catalog;
mod item_drafts;
mod item_references;
mod item_spell_compilation;
mod land_cell_behavior;
mod land_paint_intent;
mod land_tile_catalog;
mod level_settings;
mod library_arguments;
mod library_integrity;
mod magic_brush;
mod map_artwork;
mod map_creation;
mod map_overlays;
mod map_paint_commands;
mod map_region;
mod map_region_preview;
mod map_rendering;
mod map_selection_commands;
mod map_thumbnail;
mod mapstats_import;
mod media_problems;
mod media_thumbnails;
mod monster_appearance_defaults;
mod monster_appearance_import;
mod monster_appearance_views;
#[cfg(test)]
mod monster_catalog_tests;
mod monster_inventory;
mod monster_library_copy;
mod monster_library_defaults;
mod monster_library_drafts;
mod monster_library_operations;
mod monster_library_population;
mod monster_library_routes;
mod monster_library_selection;
mod monster_library_transfers;
mod monster_operation_receipts;
mod monster_population_projection;
#[cfg(test)]
mod monster_population_tests;
mod monster_reference_catalog;
mod monster_reward_projection;
mod paint_resource_catalog;
mod paint_resources;
mod personal_image;
mod personal_library;
mod picture_media;
mod player_map_import;
mod player_map_preview;
mod player_map_resources;
mod random_regions;
mod reachability_problems;
mod readiness;
mod rebuilt_export_plan;
mod rebuilt_packages;
mod rebuilt_publication;
mod rebuilt_source_publication;
mod record_catalog;
mod reference_catalog;
mod reference_strings;
mod request_dispatch;
mod request_params;
use request_dispatch::dispatch;
mod rule_catalog;
mod rule_drafts;
mod rule_import;
mod rule_reference_labels;
mod rule_view_source;
mod scenario_conversion;
mod scenario_import;
mod scenario_metadata;
mod scenario_music;
mod scenario_preflight;
mod scenario_security;
mod session_routes;
mod session_summary;
mod shared_host;
mod smart_terrain;
mod sound_media;
mod special_land_artwork;
mod special_land_media;
mod special_land_solidity;
mod spell_catalog;
mod spell_drafts;
mod spell_import;
mod startup;
mod stock_items;
mod stock_rules;
mod stock_spells;
mod stored_routes;
mod terrain_atlas;
mod terrain_generation;
mod terrain_mapping;
mod text_export;
mod text_interchange;
mod text_resource_authoring;
#[cfg(test)]
mod text_resource_authoring_tests;
mod text_resource_resolution;
mod text_resources;
#[cfg(test)]
mod text_resources_tests;
mod text_style_drafts;
#[cfg(test)]
mod text_style_drafts_tests;
mod tile_behavior;
mod transport;
mod validation_jobs;
mod validation_listing;
mod wav_input;
mod world_route_projections;

#[cfg(test)]
use crate::catalogs::OpenMonsterLibrary;
use crate::catalogs::{CatalogViews, OpenLibraries};
use crate::request_params::required_u64;
use crate::transport::serve_io_with_libraries;
#[cfg(test)]
use crate::{
    catalogs::OpenApplicationMedia, library_arguments::open_library_arguments,
    startup::read_snapshot,
};
#[cfg(test)]
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision};
use providence_storage::ProjectStore;
#[cfg(test)]
use providence_storage::ReferenceLibraryStore;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{env, io, process::ExitCode};
#[cfg(test)]
use stored_routes::dispatch as dispatch_result_with_catalogs;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    id: u64,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Response {
    id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    outcome_unknown: Option<bool>,
}

fn main() -> ExitCode {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if let Some(identity) = identity::cli(&arguments) {
        println!("{identity}");
        return ExitCode::SUCCESS;
    }
    if matches!(
        arguments.first().map(String::as_str),
        Some(
            "serve-shared-project"
                | "serve-native-project"
                | "serve-observer-project"
                | "serve-native-control-project"
                | "host-project"
        )
    ) {
        return match shared_host::run(&arguments) {
            Ok(()) => ExitCode::SUCCESS,
            Err(error) => {
                eprintln!("{error}");
                ExitCode::FAILURE
            }
        };
    }
    if arguments.first().map(String::as_str) == Some("import-rebuilt-scenario") {
        return scenario_conversion::run(&arguments[1..]);
    }
    let startup = match startup::start(&mut arguments.into_iter()) {
        Ok(startup) => startup,
        Err(error) => {
            eprintln!("{}", error.message);
            return error.exit_code;
        }
    };
    match serve(
        startup.session,
        startup.store,
        startup.libraries,
        startup.timing,
    ) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("adapter failed: {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
fn open_application_library_argument(
    arguments: &mut impl Iterator<Item = String>,
) -> Result<Option<OpenApplicationMedia>, String> {
    let libraries = open_library_arguments(arguments)?;
    if libraries.monster_library.is_some() || libraries.reference_catalog.is_some() {
        return Err(
            "unexpected non-application library option in application-media-only test".into(),
        );
    }
    Ok(libraries.application_media)
}

fn serve(
    mut session: EditorSession,
    store: Option<ProjectStore>,
    mut libraries: OpenLibraries,
    timing: startup::StartupTiming,
) -> Result<(), String> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut stdout = io::BufWriter::with_capacity(64 * 1024, stdout.lock());
    serve_io_with_libraries(
        &mut session,
        store.as_ref(),
        CatalogViews {
            stock_items: libraries.stock_items.as_ref(),
            stock_spells: libraries.stock_spells.as_ref(),
            stock_rules: libraries.stock_rules.as_ref(),
            application_terrain: libraries.application_terrain.as_ref(),
            personal_library: libraries.personal_library.as_ref(),
            application_media: libraries
                .application_media
                .as_ref()
                .map(|media| &media.catalog),
            application_media_store: libraries
                .application_media
                .as_ref()
                .map(|media| &media.store),
            reference_catalog: libraries
                .reference_catalog
                .as_ref()
                .map(|catalog| &catalog.catalog),
            reference_catalog_store: libraries
                .reference_catalog
                .as_ref()
                .map(|catalog| &catalog.store),
        },
        libraries.monster_library.as_mut(),
        Some(&timing),
        stdin.lock(),
        &mut stdout,
    )
}

#[cfg(test)]
fn dispatch_result_with_store(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    dispatch_result_with_application(session, store, None, method, params)
}

#[cfg(test)]
fn dispatch_result_with_application(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    dispatch_result_with_application_store(
        session,
        store,
        application_media,
        None,
        None,
        method,
        params,
    )
}

#[cfg(test)]
fn dispatch_result_with_application_store(
    session: &mut EditorSession,
    store: Option<&ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    application_media_store: Option<&ReferenceLibraryStore>,
    monster_library: Option<&mut OpenMonsterLibrary>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    dispatch_result_with_catalogs(
        session,
        store,
        CatalogViews {
            application_media,
            application_media_store,
            ..CatalogViews::default()
        },
        monster_library,
        method,
        params,
    )
}

#[cfg(test)]
fn dispatch_result(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    session_routes::dispatch(session, method, params)
}

fn execute(
    session: &mut EditorSession,
    params: &Value,
    command: EditorCommand,
) -> Result<Value, String> {
    let expected_revision = Revision(required_u64(params, "expectedRevision")?);
    let request = ExpectedRevisionCommand {
        expected_revision,
        command,
    };
    let projection = if let Some(raw) = params.get("_historyAttribution") {
        let attribution = serde_json::from_value(raw.clone())
            .map_err(|e| format!("invalid history attribution: {e}"))?;
        session.execute_attributed(request, attribution)
    } else {
        session.execute(request)
    }
    .map_err(|error| error.to_string())?;
    serde_json::to_value(projection).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests;
