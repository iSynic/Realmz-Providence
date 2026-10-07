use std::collections::{BTreeMap, BTreeSet};

use crate::model::{AssetDescriptor, BlobId, ClassicResourceKey, StableId};

pub const SCENARIO_MUSIC_FILES: [&str; 3] = ["Custom 1 Music", "Custom 2 Music", "Custom 3 Music"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScenarioMusicError(pub String);

impl std::fmt::Display for ScenarioMusicError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for ScenarioMusicError {}

pub fn scenario_music_asset(
    slot: u8,
    bytes: &[u8],
    blob: BlobId,
) -> Result<AssetDescriptor, ScenarioMusicError> {
    let native_name = slot
        .checked_sub(1)
        .and_then(|index| SCENARIO_MUSIC_FILES.get(index as usize))
        .ok_or_else(|| ScenarioMusicError("Scenario music slot must be 1, 2, or 3".into()))?;
    let title = standard_mod_title(bytes)?;
    Ok(AssetDescriptor {
        identity: StableId(format!("asset:scenario-music:{slot}")),
        label: if title.is_empty() {
            (*native_name).into()
        } else {
            title
        },
        kind: "music".into(),
        mime_type: Some("audio/x-mod".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "MOD ".into(),
            resource_id: slot.into(),
        }),
        scenario_music_slot: Some(slot),
        blob: blob.clone(),
        byte_length: bytes.len() as u64,
        classic_payload_blob: Some(blob),
        classic_payload_byte_length: Some(bytes.len() as u64),
        extension: Some("mod".into()),
        width: None,
        height: None,
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: (*native_name).into(),
    })
}

fn standard_mod_title(bytes: &[u8]) -> Result<String, ScenarioMusicError> {
    let fail = |message: &str| ScenarioMusicError(message.into());
    if bytes.len() < 1084 {
        return Err(fail("Standard 31-sample MOD header is truncated"));
    }
    let signature = &bytes[1080..1084];
    let channels = match signature {
        b"M.K." | b"M!K!" | b"M&K!" | b"N.T." | b"FLT4" => 4,
        b"OCTA" | b"CD81" | b"FLT8" => 8,
        [digit @ b'1'..=b'9', b'C', b'H', b'N'] => usize::from(*digit - b'0'),
        [tens @ b'0'..=b'9', units @ b'0'..=b'9', b'C', b'H'] => {
            usize::from(*tens - b'0') * 10 + usize::from(*units - b'0')
        }
        _ => {
            return Err(fail(
                "Unsupported scenario music format; a standard MOD module is required",
            ));
        }
    };
    if !(1..=32).contains(&channels) {
        return Err(fail("Standard MOD channel count must be between 1 and 32"));
    }
    let mut sample_bytes = 0usize;
    for row in bytes[20..950].chunks_exact(30) {
        sample_bytes += usize::from(u16::from_be_bytes([row[22], row[23]])) * 2;
        if row[25] > 64 {
            return Err(fail("MOD sample volume exceeds 64"));
        }
    }
    let orders = usize::from(bytes[950]);
    if !(1..=128).contains(&orders) {
        return Err(fail("MOD order list length must be between 1 and 128"));
    }
    let patterns = usize::from(*bytes[952..952 + orders].iter().max().unwrap()) + 1;
    let required = 1084 + patterns * 64 * channels * 4 + sample_bytes;
    if bytes.len() < required {
        return Err(ScenarioMusicError(format!(
            "MOD payload is truncated: requires {required} bytes, found {}",
            bytes.len()
        )));
    }
    let title_end = bytes[..20].iter().position(|byte| *byte == 0).unwrap_or(20);
    Ok(
        super::classic_text_resources::decode_mac_roman_name(&bytes[..title_end])
            .trim()
            .into(),
    )
}

pub fn compile_scenario_music_files(
    assets: &[AssetDescriptor],
    payloads: &BTreeMap<String, Vec<u8>>,
) -> Result<Vec<(String, BlobId, Vec<u8>)>, ScenarioMusicError> {
    let mut slots = BTreeSet::new();
    let mut files = Vec::new();
    for asset in assets.iter().filter(|asset| asset.kind == "music") {
        let slot = asset
            .scenario_music_slot
            .ok_or_else(|| ScenarioMusicError("Scenario music asset has no slot".into()))?;
        if !slots.insert(slot) {
            return Err(ScenarioMusicError(format!(
                "Duplicate scenario music slot {slot}"
            )));
        }
        let bytes = payloads.get(&asset.blob.0).ok_or_else(|| {
            ScenarioMusicError(format!(
                "Scenario music '{}' has no payload",
                asset.identity.0
            ))
        })?;
        let projected = scenario_music_asset(slot, bytes, asset.blob.clone())?;
        if asset.byte_length != projected.byte_length
            || asset.classic_resource != projected.classic_resource
        {
            return Err(ScenarioMusicError(format!(
                "Scenario music '{}' has inconsistent payload metadata",
                asset.identity.0
            )));
        }
        files.push((
            SCENARIO_MUSIC_FILES[usize::from(slot - 1)].to_string(),
            asset.blob.clone(),
            bytes.clone(),
        ));
    }
    files.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn module(channels: usize, signature: &[u8; 4]) -> Vec<u8> {
        let mut bytes = vec![0; 1084 + 64 * channels * 4 + 2];
        bytes[..4].copy_from_slice(b"Song");
        bytes[43] = 1;
        bytes[950] = 1;
        bytes[1080..1084].copy_from_slice(signature);
        bytes
    }

    #[test]
    fn standard_modules_preserve_all_bytes_and_exact_slot_files() {
        let mut assets = Vec::new();
        let mut payloads = BTreeMap::new();
        for (slot, channels, signature) in [(1, 6, b"6CHN"), (2, 4, b"M.K."), (3, 8, b"8CHN")] {
            let mut bytes = module(channels, signature);
            bytes.extend_from_slice(&[0xde, 0xad]);
            let blob = BlobId(format!("sha256:{}", slot.to_string().repeat(64)));
            let asset = scenario_music_asset(slot, &bytes, blob.clone()).unwrap();
            assert_eq!(asset.label, "Song");
            assert_eq!(asset.classic_payload_blob, Some(blob.clone()));
            assert_eq!(asset.channels, None);
            assets.push(asset);
            payloads.insert(blob.0, bytes);
        }
        assets.reverse();
        let files = compile_scenario_music_files(&assets, &payloads).unwrap();
        assert_eq!(files.len(), 3);
        for (index, (name, blob, bytes)) in files.iter().enumerate() {
            assert_eq!(name, SCENARIO_MUSIC_FILES[index]);
            assert_eq!(bytes, &payloads[&blob.0]);
        }
        assert_eq!(
            files,
            compile_scenario_music_files(&assets, &payloads).unwrap()
        );
        assets.push(assets[0].clone());
        assert!(compile_scenario_music_files(&assets, &payloads).is_err());
        assert!(compile_scenario_music_files(&assets[..1], &BTreeMap::new()).is_err());
    }

    #[test]
    fn malformed_or_unsupported_modules_are_not_silently_imported() {
        let original = module(4, b"M.K.");
        let blob = BlobId(format!("sha256:{}", "a".repeat(64)));
        assert!(scenario_music_asset(0, &original, blob.clone()).is_err());
        assert!(scenario_music_asset(4, &original, blob.clone()).is_err());
        assert!(scenario_music_asset(1, &original[..1083], blob.clone()).is_err());
        assert!(scenario_music_asset(1, &original[..original.len() - 1], blob.clone()).is_err());
        for (offset, value) in [(45, 65), (950, 0), (950, 129), (952, 127), (1080, b'?')] {
            let mut bytes = original.clone();
            bytes[offset] = value;
            assert!(scenario_music_asset(1, &bytes, blob.clone()).is_err());
        }
    }
}
