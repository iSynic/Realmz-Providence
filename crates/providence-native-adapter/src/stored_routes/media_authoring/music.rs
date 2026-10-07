use super::*;
use providence_core::codecs::{SCENARIO_MUSIC_FILES, scenario_music_asset};

pub(super) fn prepare(bytes: &[u8], label: &str, number: i32) -> Result<imports::Material, String> {
    let slot = slot(number)?;
    let source = BlobId(format!("sha256:{:x}", Sha256::digest(bytes)));
    let mut asset = scenario_music_asset(slot, bytes, source.clone()).map_err(|e| e.to_string())?;
    asset.label = label.into();
    Ok(imports::Material {
        asset,
        runtime: bytes.to_vec(),
        native: bytes.to_vec(),
        source,
    })
}

pub(super) fn slot(number: i32) -> Result<u8, String> {
    u8::try_from(number)
        .ok()
        .filter(|slot| (1..=3).contains(slot))
        .ok_or("Choose scenario music slot 1, 2, or 3.".into())
}

pub(super) fn replacement(
    bytes: &[u8],
    label: &str,
    number: i32,
    retained: Option<&AssetDescriptor>,
) -> Result<imports::Material, String> {
    let mut material = prepare(bytes, label, number)?;
    if let Some(retained) = retained {
        if retained.scenario_music_slot != material.asset.scenario_music_slot {
            return Err("Replacement keeps the selected music slot.".into());
        }
        material.asset.identity = retained.identity.clone();
        material.asset.source = retained.source.clone();
    }
    Ok(material)
}

pub(super) fn rebase(
    asset: &AssetDescriptor,
    number: i32,
    label: &str,
) -> Result<PersonalMedia, String> {
    let slot = slot(number)?;
    let mut primary = asset.clone();
    primary.identity = StableId(format!("asset:scenario-music:{slot}"));
    primary.label = label.into();
    primary.scenario_music_slot = Some(slot);
    primary.classic_resource = Some(providence_core::model::ClassicResourceKey {
        resource_type: "MOD ".into(),
        resource_id: number,
    });
    primary.source = SCENARIO_MUSIC_FILES[usize::from(slot - 1)].into();
    Ok(PersonalMedia {
        primary,
        companion: None,
    })
}

// An unusable imported module still occupies its native filename in source truth.
pub(super) fn check_retained(
    session: &EditorSession,
    number: i32,
    replacement: bool,
) -> Result<(), String> {
    let filename = SCENARIO_MUSIC_FILES[usize::from(slot(number)? - 1)];
    let count = session
        .snapshot()
        .classic_sources
        .iter()
        .filter(|source| source.native_path.eq_ignore_ascii_case(filename))
        .count();
    if count > usize::from(replacement) {
        return Err(format!(
            "{filename} is retained or ambiguous in the imported scenario. Choose another slot or repair its source."
        ));
    }
    Ok(())
}

pub(super) fn preview(asset: &AssetDescriptor, bytes: &[u8]) -> Result<Value, String> {
    let checked = scenario_music_asset(
        asset
            .scenario_music_slot
            .ok_or("Music has no scenario slot.")?,
        bytes,
        asset.blob.clone(),
    )
    .map_err(|e| e.to_string())?;
    Ok(
        json!({"identity":asset.identity,"mimeType":"audio/x-mod","title":checked.label,
        "sourceBytes":bytes.len(),"scenarioMusicSlot":asset.scenario_music_slot,"exactSource":true}),
    )
}
