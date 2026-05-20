mod commands;
pub mod error;
pub mod exporter;
pub mod importer;
pub mod project;
pub mod realmz;
pub mod semantic;
pub mod validation;
pub mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::open_workspace,
            commands::save_workspace,
            commands::import_divinity_libraries,
            commands::import_realmz_reference_data,
            commands::load_library_asset,
            commands::import_scenario,
            commands::import_scenario_into_project,
            commands::open_project,
            commands::load_project_asset,
            commands::save_project,
            commands::export_project,
            commands::validate_project,
            commands::benchmark_project
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Realmz Providence");
}
