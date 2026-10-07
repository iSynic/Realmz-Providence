use super::{capture_scenario_sources, inputs::ScenarioSources};
use crate::scenario_preflight::resolve_classic_native_file;
use providence_core::{
    codecs::{DecodedScenarioStartup, decode_scenario_contact_info, decode_scenario_startup},
    model::CampaignMetadata,
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand},
};
use providence_storage::ProjectStore;
use serde_json::json;
use std::fs;

pub(super) fn import(
    scratch: &mut EditorSession,
    store: &ProjectStore,
    inputs: &ScenarioSources,
    steps: &mut Vec<String>,
) -> Result<(u64, Vec<String>), String> {
    let mut bootstrap = read_startup(inputs)?;
    if apply_contact(inputs, &mut bootstrap.campaign)? {
        steps.push("scenario-contact".into());
    }
    let (mut sources, mut source_bytes, mut unowned_files) =
        capture_scenario_sources(store, &inputs.scenario_directory, &inputs.scenario_name)?;
    capture_selected_startup(
        store,
        inputs,
        &mut sources,
        &mut source_bytes,
        &mut unowned_files,
    )?;
    let annex_bytes = serde_json::to_vec(&json!({
        "format": "providence-classic-source-annex-v1",
        "sourceInventoryVersion": 2,
        "files": sources,
    }))
    .map_err(|error| format!("could not encode compatibility annex: {error}"))?;
    let annex_blob = store
        .put_blob(&annex_bytes)
        .map_err(|error| error.to_string())?;
    scratch
        .execute(ExpectedRevisionCommand {
            expected_revision: scratch.revision(),
            command: EditorCommand::ImportClassicScenarioBootstrap {
                annex_blob,
                sources,
                startup_native_path: inputs
                    .startup_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or("Startup filename is not portable")?
                    .to_owned(),
                campaign: Box::new(bootstrap.campaign),
                start_location: bootstrap.start_location,
            },
        })
        .map_err(|error| error.to_string())?;
    steps.push("scenario-bootstrap".into());
    Ok((source_bytes, unowned_files))
}

fn read_startup(sources: &ScenarioSources) -> Result<DecodedScenarioStartup, String> {
    let startup_bytes = fs::read(&sources.startup_path).map_err(|error| {
        format!(
            "could not read scenario startup {}: {error}",
            sources.startup_path.display()
        )
    })?;
    let restrictions_path = resolve_classic_native_file(&sources.scenario_directory, "Data RI");
    let restrictions_bytes = if let Some(restrictions_path) = restrictions_path {
        fs::read(&restrictions_path)
            .map_err(|error| format!("could not read {}: {error}", restrictions_path.display()))?
    } else {
        vec![0; providence_core::codecs::SCENARIO_RESTRICTIONS_BYTES]
    };
    let bootstrap =
        decode_scenario_startup(&sources.scenario_name, &startup_bytes, &restrictions_bytes)
            .map_err(|error| format!("scenario startup is invalid: {error}"))?;

    Ok(bootstrap)
}

fn apply_contact(
    sources: &ScenarioSources,
    campaign: &mut CampaignMetadata,
) -> Result<bool, String> {
    let contact_path = resolve_classic_native_file(&sources.scenario_directory, "Data CI");
    if let Some(contact_path) = contact_path {
        let contact_bytes = fs::read(&contact_path)
            .map_err(|error| format!("could not read {}: {error}", contact_path.display()))?;
        let contact = decode_scenario_contact_info(&contact_bytes)
            .map_err(|error| format!("scenario contact info is invalid: {error}"))?;
        contact.apply_to_campaign(campaign);
        return Ok(true);
    }

    Ok(false)
}

fn capture_selected_startup(
    store: &ProjectStore,
    inputs: &ScenarioSources,
    sources: &mut Vec<providence_core::model::ClassicSourceBlob>,
    source_bytes: &mut u64,
    unowned_files: &mut Vec<String>,
) -> Result<(), String> {
    if inputs
        .startup_path
        .file_name()
        .and_then(|name| name.to_str())
        != Some(inputs.scenario_name.as_str())
    {
        let startup_bytes = fs::read(&inputs.startup_path).map_err(|error| {
            format!(
                "could not read scenario startup {}: {error}",
                inputs.startup_path.display()
            )
        })?;
        let native_path = inputs
            .startup_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "scenario startup filename is not portable".to_string())?
            .to_string();
        let blob = store
            .put_blob(&startup_bytes)
            .map_err(|error| error.to_string())?;
        *source_bytes = source_bytes.saturating_add(startup_bytes.len() as u64);
        sources.push(providence_core::model::ClassicSourceBlob {
            native_path: native_path.clone(),
            blob,
            byte_length: startup_bytes.len() as u64,
        });
        sources.sort_by(|left, right| left.native_path.cmp(&right.native_path));
        unowned_files.retain(|name| name != &native_path);
    }
    Ok(())
}
