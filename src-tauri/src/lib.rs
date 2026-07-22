mod commands;
mod compatibility_annex;
pub mod dungeon;
pub mod error;
pub mod evidence;
pub mod exporter;
mod generated;
pub mod harness;
pub mod importer;
pub mod media_assets;
pub mod music_compatibility;
mod native_manifest;
pub mod project;
pub mod project_package;
pub mod realmz;
mod realmz_reference;
pub mod remake_exporter;
pub mod resource_fork;
pub mod resource_preview;
pub(crate) mod rule_compiler;
pub mod semantic;
pub mod validation;
pub mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::default_storage_paths,
            commands::create_project,
            commands::copy_project_template_payloads,
            commands::open_workspace,
            commands::save_workspace,
            commands::import_divinity_libraries,
            commands::import_realmz_reference_data,
            commands::load_library_asset,
            commands::load_library_asset_preview,
            commands::load_library_resource_data,
            commands::inspect_library_asset_preview,
            commands::import_scenario,
            commands::import_scenario_into_project,
            commands::open_project,
            commands::open_project_package,
            commands::build_project_semantic_schema,
            commands::build_saved_project_semantic_schema,
            media_assets::load_project_asset,
            media_assets::load_project_asset_preview,
            media_assets::load_reference_picture_asset,
            media_assets::import_project_media_asset,
            media_assets::import_workspace_media_asset,
            media_assets::copy_project_asset_to_workspace,
            media_assets::copy_workspace_asset_to_project,
            media_assets::copy_library_asset_to_project,
            media_assets::replace_project_media_asset,
            media_assets::update_project_asset,
            media_assets::delete_project_asset,
            commands::save_project,
            commands::export_project,
            commands::validate_project,
            commands::benchmark_project,
            harness::get_harness_config,
            harness::read_harness_batch,
            harness::read_harness_script,
            harness::read_harness_script_at,
            harness::write_harness_result,
            harness::write_harness_result_at,
            harness::harness_exit
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Realmz Providence");
}
