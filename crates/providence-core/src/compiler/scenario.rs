use super::{
    ClassicCompatibilitySources, ClassicSliceCompileError, ManifestSource, NativeManifest,
};
use crate::codecs::{
    NativeFileFamily, encode_scenario_contact_info, encode_scenario_security,
    encode_scenario_startup_as,
};
use crate::model::ProjectSnapshot;

pub(super) fn compile(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    let (Some(campaign), Some(location)) = (&snapshot.campaign, &snapshot.start_location) else {
        return Ok(());
    };
    let authoring = snapshot.startup_authoring.as_ref();
    let filename = authoring
        .map(|value| value.marker_filename.as_str())
        .unwrap_or_else(|| {
            sources
                .scenario_startup
                .map(|source| source.native_path)
                .unwrap_or(&campaign.name)
        });
    validate_marker_destination(snapshot, sources, filename)?;
    let (mut startup, restrictions) = encode_scenario_startup_as(
        filename,
        campaign,
        location,
        sources.scenario_startup.map(|source| source.bytes),
        sources.data_ri,
    )?;
    let family = security(snapshot, sources, &mut startup, manifest)?;
    manifest.insert_generated(filename, family, startup);
    if sources.data_ri.is_some() || !campaign_restrictions_are_neutral(&campaign.restrictions) {
        manifest.insert_generated(
            "Data RI",
            NativeFileFamily::ScenarioRestrictions,
            restrictions,
        );
    }
    if let Some(contact) = encode_scenario_contact_info(campaign, sources.data_ci)? {
        manifest.insert_generated("Data CI", NativeFileFamily::ScenarioContactInfo, contact);
    }
    Ok(())
}

fn security(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    startup: &mut [u8],
    manifest: &mut NativeManifest,
) -> Result<NativeFileFamily, ClassicSliceCompileError> {
    let authoring = snapshot.startup_authoring.as_ref();
    let family = if let Some(security) = authoring.and_then(|value| value.security.as_ref()) {
        let backup = encode_scenario_security(startup, sources.data_cs, security)
            .map_err(ClassicSliceCompileError::ScenarioSecurity)?;
        manifest.insert_generated("Data CS", NativeFileFamily::ScenarioSecurityBackup, backup);
        NativeFileFamily::ScenarioSecurityStartup
    } else {
        if let Some(bytes) = sources.data_cs {
            if let Some(source) = snapshot
                .classic_sources
                .iter()
                .find(|source| source.native_path == "Data CS")
            {
                manifest.insert_preserved("Data CS", source.blob.clone(), bytes.to_vec());
            } else {
                manifest.insert_generated(
                    "Data CS",
                    NativeFileFamily::ScenarioSecurityBackup,
                    bytes.to_vec(),
                );
            }
        }
        NativeFileFamily::ScenarioStartup
    };
    Ok(family)
}

fn validate_marker_destination(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    filename: &str,
) -> Result<(), ClassicSliceCompileError> {
    crate::codecs::validate_marker_filename(filename).map_err(|error| {
        ClassicSliceCompileError::ScenarioSecurity(crate::codecs::ScenarioSecurityCodecError(error))
    })?;
    if snapshot.classic_sources.iter().any(|source| {
        source.native_path.eq_ignore_ascii_case(filename)
            && sources
                .scenario_startup
                .map(|original| original.native_path)
                != Some(source.native_path.as_str())
    }) {
        return Err(ClassicSliceCompileError::ScenarioSecurity(
            crate::codecs::ScenarioSecurityCodecError(
                "Marker filename would overwrite another retained Classic file.".into(),
            ),
        ));
    }
    Ok(())
}

fn campaign_restrictions_are_neutral(restrictions: &crate::model::CampaignRestrictions) -> bool {
    restrictions.description.is_empty()
        && restrictions.max_party_size == 6
        && restrictions.max_level == 0
        && restrictions.banned_races.is_empty()
        && restrictions.banned_castes.is_empty()
}

#[cfg(test)]
mod tests;

pub(super) fn reimport_bootstrap(
    manifest: &NativeManifest,
) -> Option<crate::codecs::DecodedScenarioStartup> {
    let startup = manifest.files().find(|(_, entry)| {
        matches!(
            entry.source,
            ManifestSource::Generated {
                family: NativeFileFamily::ScenarioStartup
                    | NativeFileFamily::ScenarioSecurityStartup,
            }
        )
    });
    startup.and_then(|(scenario_name, startup)| {
        manifest.get("Data RI").and_then(|restrictions| {
            crate::codecs::decode_scenario_startup(
                scenario_name,
                &startup.bytes,
                &restrictions.bytes,
            )
            .ok()
        })
    })
}
