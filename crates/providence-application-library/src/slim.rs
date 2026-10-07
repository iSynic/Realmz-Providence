mod archive;
mod batch;
mod battle_atlas;
mod catalog_ownership;
mod encoding;
mod native_sources;
mod overlays;
mod package;
mod package_finalization;
mod report;
mod rule_ownership;
mod scenario;
mod scenario_media;

pub use package_finalization::{
    ApplicationPackageIdentity, FinalizedScenarioPackage, PackageFinalizationContext,
    finalize_package_archive, finalize_package_archive_with_selected_rules,
};
use serde_json::Value;

#[cfg(test)]
#[path = "slim_tests.rs"]
mod application_library_tests;

pub fn run(args: &[String]) -> Result<(), String> {
    let report = finalize(args)?;
    println!(
        "{}",
        serde_json::to_string(&report).map_err(|error| error.to_string())?
    );
    Ok(())
}

pub fn finalize(args: &[String]) -> Result<Value, String> {
    batch::finalize(args)
}
