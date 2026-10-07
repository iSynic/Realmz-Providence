#![forbid(unsafe_code)]

//! Platform-independent Providence model, compatibility, and compilation contracts.
//!
//! This crate accepts and returns values and byte buffers. Platform adapters own paths,
//! windows, dialogs, databases, archives, process launch, and durable I/O.

pub mod action_authoring;
pub mod action_settings_effects;
pub mod action_settings_repair;
mod application_references;
pub mod battle_catalog;
pub mod build_identity;
mod classic_action_settings;
mod classic_random;
pub mod codecs;
pub mod compatibility;
pub mod compiler;
pub mod custom_landlook;
pub mod discovery;
pub mod dungeon_features;
pub mod global_macro_authoring;
pub mod import_repair;
mod item_artwork;
mod item_behavior_references;
pub mod item_reference_catalog;
mod item_sound;
pub mod land_cell_behavior;
pub mod land_layout_edit;
pub mod land_paint_intent;
pub mod land_tile_catalog;
pub mod level_settings;
pub mod map_artwork;
pub mod map_editor_preview;
pub mod map_lifecycle;
pub mod map_paint;
pub mod map_selection;
pub mod map_stamp;
pub mod map_view_overlays;
pub mod model;
pub mod monster_appearance;
pub mod monster_inventory;
pub mod monster_library;
pub mod monster_population;
pub mod monster_reference_catalog;
pub mod monster_reference_preview;
pub mod monster_uses;
pub mod paint_resources;
pub mod personal_library;
pub mod player_map_references;
pub mod random_region_authoring;
pub mod rebuilt;
pub mod reference_library;
pub mod references;
pub mod registration;
mod resource_resolution;
pub mod rule_presentation;
pub mod rule_reference_catalog;
mod rule_references;
pub mod session;
pub mod smart_terrain;
pub mod snapshot;
pub mod special_land_artwork;
pub mod spell_reference_catalog;
pub mod terrain_joining;
pub mod terrain_mapping;
pub mod text_authoring;
pub mod text_styles;
pub mod tile_behavior;
pub mod validation;

#[cfg(test)]
mod boundary_tests {
    #[test]
    fn core_manifest_has_no_platform_or_storage_framework_dependency() {
        let manifest = include_str!("../Cargo.toml").to_ascii_lowercase();
        for forbidden in [
            "godot",
            "tauri",
            "web-sys",
            "wasm-bindgen",
            "rusqlite",
            "sqlx",
            "zip",
        ] {
            assert!(
                !manifest.contains(forbidden),
                "providence-core must not depend on {forbidden}"
            );
        }
    }
}
