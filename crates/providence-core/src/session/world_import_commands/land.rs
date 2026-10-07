use crate::codecs::{
    ACTION_POINT_LEVEL_BYTES, ACTION_POINTS_PER_LEVEL, EXTRA_ACTION_POINT_RECORD_BYTES,
    LAND_LAYOUT_BYTES, LAND_LAYOUT_CELLS, SIMPLE_ENCOUNTER_RECORD_BYTES, encode_land_random_levels,
};
use crate::model::SimpleEncounter;
use crate::model::{
    ActionPoint, ClassicSourceBlob, ExtraActionPoint, ExtraCodeRow, LandLayout, LevelType,
    MapLevel, ScenarioApplicationContract, ScenarioMessage,
};
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

#[derive(Clone, Copy)]
pub(super) struct ClassicLandImportView<'a> {
    pub(super) sources: &'a [ClassicSourceBlob],
    pub(super) maps: &'a [MapLevel],
    pub(super) action_points: &'a [ActionPoint],
    pub(super) messages: &'a [ScenarioMessage],
    pub(super) simple_encounters: &'a [SimpleEncounter],
    pub(super) extra_codes: &'a [ExtraCodeRow],
    pub(super) extra_action_points: &'a [ExtraActionPoint],
    pub(super) global_macro_hooks: Option<&'a ScenarioApplicationContract>,
    pub(super) land_layout: Option<&'a LandLayout>,
}

pub(super) fn validate(input: ClassicLandImportView<'_>) -> Result<(), SessionError> {
    let paths = validate_sources(input.sources)?;
    // Family order preserves the first reported failure; callers mutate only after all checks pass.
    validate_layout_provenance(input.land_layout, &paths)?;
    validate_maps(input)?;
    validate_runtime(input, &paths)?;
    validate_action_points(input)?;
    validate_messages(input)?;
    validate_encounters(input)?;
    validate_extra_codes(input, &paths)?;
    validate_extra_action_points(input, &paths)?;
    validate_global_hooks(input, &paths)
}

fn validate_sources(sources: &[ClassicSourceBlob]) -> Result<BTreeSet<&str>, SessionError> {
    const REQUIRED: [&str; 4] = ["Data DD", "Data ED", "Data LD", "Data SD2"];
    let mut paths = BTreeSet::new();
    for source in sources {
        if !paths.insert(source.native_path.as_str()) {
            return Err(SessionError::InvalidClassicImport(format!(
                "duplicate source {}",
                source.native_path
            )));
        }
    }
    for required in REQUIRED {
        if !paths.contains(required) {
            return Err(SessionError::InvalidClassicImport(format!(
                "missing required source {required}"
            )));
        }
    }
    Ok(paths)
}

fn validate_layout_provenance(
    land_layout: Option<&LandLayout>,
    paths: &BTreeSet<&str>,
) -> Result<(), SessionError> {
    if paths.contains("Layout") != land_layout.is_some() {
        return Err(SessionError::InvalidClassicImport(
            "Layout source and decoded land Layout must either both be present or both be absent"
                .into(),
        ));
    }

    Ok(())
}

fn source_length(sources: &[ClassicSourceBlob], path: &str) -> usize {
    sources
        .iter()
        .find(|source| source.native_path == path)
        .map(|source| source.byte_length as usize)
        .unwrap_or_default()
}

fn validate_maps(input: ClassicLandImportView<'_>) -> Result<(), SessionError> {
    let ClassicLandImportView {
        sources,
        maps,
        land_layout,
        ..
    } = input;
    if source_length(sources, "Data LD") != maps.len() * crate::codecs::MAP_LEVEL_BYTES {
        return Err(SessionError::InvalidClassicImport(
            "Data LD length does not match the decoded land-map count".into(),
        ));
    }
    if let Some(layout) = land_layout
        && (source_length(sources, "Layout") < LAND_LAYOUT_BYTES
            || layout.cells.len() != LAND_LAYOUT_CELLS)
    {
        return Err(SessionError::InvalidClassicImport(
            "Layout geometry does not match the 8 by 16 Classic grid".into(),
        ));
    }
    for (index, map) in maps.iter().enumerate() {
        if map.level_type != LevelType::Land
            || map.native_index != index as u32
            || map.identity.0 != format!("land:{index}")
            || map.tiles.len() != crate::model::CLASSIC_MAP_SIZE * crate::model::CLASSIC_MAP_SIZE
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data LD row {index} does not have canonical land identity and geometry"
            )));
        }
    }
    Ok(())
}

fn validate_runtime(
    input: ClassicLandImportView<'_>,
    paths: &BTreeSet<&str>,
) -> Result<(), SessionError> {
    let ClassicLandImportView { sources, maps, .. } = input;
    if paths.contains("Data RD") {
        let source = sources
            .iter()
            .find(|source| source.native_path == "Data RD")
            .expect("checked Data RD path");
        if source.byte_length as usize != maps.len() * crate::codecs::RANDOM_LEVEL_RECORD_BYTES
            || encode_land_random_levels(maps, None)
                .map_err(|error| SessionError::InvalidClassicImport(error.to_string()))?
                .len()
                != source.byte_length as usize
        {
            return Err(SessionError::InvalidClassicImport(
                "Data RD geometry does not match the decoded land-map count".into(),
            ));
        }
        for map in maps {
            let Some(runtime) = map.runtime.as_ref() else {
                return Err(SessionError::InvalidClassicImport(format!(
                    "land map {} lacks its Data RD runtime record",
                    map.identity.0
                )));
            };
            if runtime.source != "Data RD"
                || runtime.source_blob.as_ref() != Some(&source.blob)
                || runtime.landlook.is_none()
                || runtime.tileset_id.0
                    != format!(
                        "classic.landlook.{}",
                        runtime.landlook.expect("checked landlook")
                    )
            {
                return Err(SessionError::InvalidClassicImport(format!(
                    "land map {} has invalid Data RD attribution or metadata",
                    map.identity.0
                )));
            }
        }
    } else if maps.iter().any(|map| map.runtime.is_some()) {
        return Err(SessionError::InvalidClassicImport(
            "land runtime metadata requires Data RD provenance".into(),
        ));
    }
    Ok(())
}

fn validate_action_points(input: ClassicLandImportView<'_>) -> Result<(), SessionError> {
    let ClassicLandImportView {
        sources,
        maps,
        action_points,
        ..
    } = input;
    if source_length(sources, "Data DD") != maps.len() * ACTION_POINT_LEVEL_BYTES
        || action_points.len() != maps.len() * ACTION_POINTS_PER_LEVEL
    {
        return Err(SessionError::InvalidClassicImport(
            "Data DD geometry does not match the decoded land-map count".into(),
        ));
    }
    for (index, action_point) in action_points.iter().enumerate() {
        let level_index = index / ACTION_POINTS_PER_LEVEL;
        let record_index = index % ACTION_POINTS_PER_LEVEL;
        if action_point.level_type != LevelType::Land
            || action_point.level_index != level_index as u32
            || action_point.record_index != record_index as u8
            || action_point.identity.0 != format!("action-point:land:{level_index}:{record_index}")
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data DD row {index} does not have canonical level and record identity"
            )));
        }
    }
    Ok(())
}

fn validate_messages(input: ClassicLandImportView<'_>) -> Result<(), SessionError> {
    let ClassicLandImportView {
        sources, messages, ..
    } = input;
    if source_length(sources, "Data SD2") / 256 != messages.len() {
        return Err(SessionError::InvalidClassicImport(
            "Data SD2 complete-row count does not match the decoded message count".into(),
        ));
    }
    for (index, message) in messages.iter().enumerate() {
        if message.native_id.0 != index as u32 || message.identity.0 != format!("message:{index}") {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data SD2 row {index} does not have canonical message identity"
            )));
        }
    }
    Ok(())
}

fn validate_encounters(input: ClassicLandImportView<'_>) -> Result<(), SessionError> {
    let ClassicLandImportView {
        sources,
        simple_encounters,
        ..
    } = input;
    if source_length(sources, "Data ED") / SIMPLE_ENCOUNTER_RECORD_BYTES != simple_encounters.len()
    {
        return Err(SessionError::InvalidClassicImport(
            "Data ED length does not match the decoded encounter count".into(),
        ));
    }
    for (index, encounter) in simple_encounters.iter().enumerate() {
        if encounter.native_id.0 != index as u32
            || encounter.identity.0 != format!("simple-encounter:{index}")
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data ED row {index} does not have canonical encounter identity"
            )));
        }
    }
    Ok(())
}

fn validate_extra_codes(
    input: ClassicLandImportView<'_>,
    paths: &BTreeSet<&str>,
) -> Result<(), SessionError> {
    let ClassicLandImportView {
        sources,
        extra_codes,
        ..
    } = input;
    if paths.contains("Data EDCD") {
        if source_length(sources, "Data EDCD") / 10 != extra_codes.len() {
            return Err(SessionError::InvalidClassicImport(
                "Data EDCD length does not match the decoded extra-code count".into(),
            ));
        }
        for (index, row) in extra_codes.iter().enumerate() {
            if row.native_id.0 != index as u32 {
                return Err(SessionError::InvalidClassicImport(format!(
                    "Data EDCD row {index} does not have canonical native identity"
                )));
            }
        }
    } else if !extra_codes.is_empty() {
        return Err(SessionError::InvalidClassicImport(
            "extra-code rows require Data EDCD provenance".into(),
        ));
    }
    Ok(())
}

fn validate_extra_action_points(
    input: ClassicLandImportView<'_>,
    paths: &BTreeSet<&str>,
) -> Result<(), SessionError> {
    let ClassicLandImportView {
        sources,
        extra_action_points,
        ..
    } = input;
    if paths.contains("Data ED3") {
        let source = sources
            .iter()
            .find(|source| source.native_path == "Data ED3")
            .expect("validated source path");
        let certified_extent = crate::codecs::certified_extra_action_point_source(
            &source.blob.0,
            source.byte_length as usize,
        );
        let expected_records = certified_extent
            .map(|extent| extent.authored_records)
            .unwrap_or(source.byte_length as usize / EXTRA_ACTION_POINT_RECORD_BYTES);
        let has_unclassified_remainder = certified_extent.is_none()
            && !(source.byte_length as usize).is_multiple_of(EXTRA_ACTION_POINT_RECORD_BYTES);
        if has_unclassified_remainder || extra_action_points.len() != expected_records {
            return Err(SessionError::InvalidClassicImport(
                "Data ED3 length does not match the decoded Extra Action Point count".into(),
            ));
        }
        for (index, row) in extra_action_points.iter().enumerate() {
            if row.native_id.0 != index as u32
                || row.identity.0 != format!("extra-action-point:{index}")
            {
                return Err(SessionError::InvalidClassicImport(format!(
                    "Data ED3 row {index} does not have canonical native identity"
                )));
            }
        }
    } else if !extra_action_points.is_empty() {
        return Err(SessionError::InvalidClassicImport(
            "Extra Action Point rows require Data ED3 provenance".into(),
        ));
    }
    Ok(())
}

fn validate_global_hooks(
    input: ClassicLandImportView<'_>,
    paths: &BTreeSet<&str>,
) -> Result<(), SessionError> {
    let ClassicLandImportView {
        sources,
        global_macro_hooks,
        ..
    } = input;
    if paths.contains("Global") {
        if source_length(sources, "Global") != crate::codecs::GLOBAL_MACRO_HOOK_BYTES {
            return Err(SessionError::InvalidClassicImport(
                "Global must contain exactly 30 signed-short hook slots".into(),
            ));
        }
        if global_macro_hooks.is_none() {
            return Err(SessionError::InvalidClassicImport(
                "Global provenance requires decoded global macro hooks".into(),
            ));
        }
    } else if global_macro_hooks
        .is_some_and(|contract| contract != &ScenarioApplicationContract::default())
    {
        return Err(SessionError::InvalidClassicImport(
            "decoded global macro hooks require Global provenance".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
