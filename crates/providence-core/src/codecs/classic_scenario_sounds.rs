use std::collections::{BTreeMap, BTreeSet};

use crate::model::{AssetDescriptor, StableId};

use super::{
    CLASSIC_SCENARIO_RESOURCE_SOURCE, ResourceEntry, ResourceForkError, empty_resource_fork,
    merge_resource_entries_preserving_unowned_duplicates,
    parse_resource_entries_preserving_duplicates,
};

#[cfg(test)]
use super::parse_resource_entries;

pub const SCENARIO_SOUND_MIN_ID: i16 = 200;
pub const SCENARIO_SOUND_MAX_ID: i16 = 500;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScenarioSoundCodecError {
    EmptySamples,
    InvalidSampleRate(u32),
    InvalidChannelCount(u16),
    MisalignedSamples {
        bytes: usize,
        channels: u16,
    },
    InvalidResourceIdentity(StableId),
    DuplicateResourceId(i16),
    MissingClassicPayload(StableId),
    ClassicPayloadLengthMismatch {
        identity: StableId,
        expected: u64,
        actual: u64,
    },
    ResourceFork(ResourceForkError),
}

impl std::fmt::Display for ScenarioSoundCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptySamples => write!(formatter, "scenario sound contains no PCM samples"),
            Self::InvalidSampleRate(rate) => write!(
                formatter,
                "scenario sound sample rate {rate} is outside the Classic 1-65535 Hz range"
            ),
            Self::InvalidChannelCount(channels) => write!(
                formatter,
                "scenario sound channel count {channels} is outside the supported 1-8 range"
            ),
            Self::MisalignedSamples { bytes, channels } => write!(
                formatter,
                "scenario sound has {bytes} interleaved sample bytes, not a multiple of {channels} channels"
            ),
            Self::InvalidResourceIdentity(identity) => write!(
                formatter,
                "asset '{}' is not a scenario snd resource in the certified 200-500 range",
                identity.0
            ),
            Self::DuplicateResourceId(resource_id) => {
                write!(
                    formatter,
                    "duplicate scenario snd resource ID {resource_id}"
                )
            }
            Self::MissingClassicPayload(identity) => write!(
                formatter,
                "scenario sound '{}' has no compiled Classic snd payload",
                identity.0
            ),
            Self::ClassicPayloadLengthMismatch {
                identity,
                expected,
                actual,
            } => write!(
                formatter,
                "scenario sound '{}' declares {expected} Classic bytes but its payload contains {actual}",
                identity.0
            ),
            Self::ResourceFork(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for ScenarioSoundCodecError {}

impl From<ResourceForkError> for ScenarioSoundCodecError {
    fn from(error: ResourceForkError) -> Self {
        Self::ResourceFork(error)
    }
}

pub fn encode_scenario_sound_snd(
    pcm8: &[u8],
    sample_rate: u32,
    channels: u16,
) -> Result<Vec<u8>, ScenarioSoundCodecError> {
    if !(1..=65_535).contains(&sample_rate) {
        return Err(ScenarioSoundCodecError::InvalidSampleRate(sample_rate));
    }
    let samples = downmix_scenario_sound_pcm8(pcm8, channels)?;

    let mut snd = Vec::with_capacity(42 + samples.len());
    push_u16(&mut snd, 1);
    push_u16(&mut snd, 1);
    push_u16(&mut snd, 5);
    push_u32(&mut snd, 0x0000_0080);
    push_u16(&mut snd, 1);
    push_u16(&mut snd, 0x8051);
    push_u16(&mut snd, 0);
    push_u32(&mut snd, 20);
    push_u32(&mut snd, 0);
    push_u32(&mut snd, samples.len());
    push_u32(&mut snd, (sample_rate as usize) << 16);
    push_u32(&mut snd, 0);
    push_u32(&mut snd, samples.len());
    snd.push(0);
    snd.push(60);
    snd.extend_from_slice(&samples);
    Ok(snd)
}

pub fn downmix_scenario_sound_pcm8(
    pcm8: &[u8],
    channels: u16,
) -> Result<Vec<u8>, ScenarioSoundCodecError> {
    if pcm8.is_empty() {
        return Err(ScenarioSoundCodecError::EmptySamples);
    }
    if !(1..=8).contains(&channels) {
        return Err(ScenarioSoundCodecError::InvalidChannelCount(channels));
    }
    if !pcm8.len().is_multiple_of(usize::from(channels)) {
        return Err(ScenarioSoundCodecError::MisalignedSamples {
            bytes: pcm8.len(),
            channels,
        });
    }
    Ok(if channels == 1 {
        pcm8.to_vec()
    } else {
        pcm8.chunks_exact(usize::from(channels))
            .map(|frame| {
                let sum = frame
                    .iter()
                    .map(|sample| usize::from(*sample))
                    .sum::<usize>();
                (sum / frame.len()) as u8
            })
            .collect::<Vec<_>>()
    })
}

pub fn compile_scenario_sound_resource_fork(
    assets: &[AssetDescriptor],
    payloads: &BTreeMap<String, Vec<u8>>,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ScenarioSoundCodecError> {
    let original = compatibility_source
        .map(ToOwned::to_owned)
        .unwrap_or_else(empty_resource_fork);
    let original_entries = parse_resource_entries_preserving_duplicates(&original)?;
    let mut updates = Vec::new();
    let mut owned_ids = BTreeSet::new();
    for asset in assets.iter().filter(|asset| asset.kind == "sound") {
        let Some(resource) = &asset.classic_resource else {
            return Err(ScenarioSoundCodecError::InvalidResourceIdentity(
                asset.identity.clone(),
            ));
        };
        let Ok(resource_id) = i16::try_from(resource.resource_id) else {
            return Err(ScenarioSoundCodecError::InvalidResourceIdentity(
                asset.identity.clone(),
            ));
        };
        if resource.resource_type != "snd " {
            return Err(ScenarioSoundCodecError::InvalidResourceIdentity(
                asset.identity.clone(),
            ));
        }
        if !owned_ids.insert(resource_id) {
            return Err(ScenarioSoundCodecError::DuplicateResourceId(resource_id));
        }
        let blob = asset.classic_payload_blob.as_ref().ok_or_else(|| {
            ScenarioSoundCodecError::MissingClassicPayload(asset.identity.clone())
        })?;
        let payload = payloads.get(&blob.0).ok_or_else(|| {
            ScenarioSoundCodecError::MissingClassicPayload(asset.identity.clone())
        })?;
        if let Some(expected) = asset.classic_payload_byte_length
            && expected != payload.len() as u64
        {
            return Err(ScenarioSoundCodecError::ClassicPayloadLengthMismatch {
                identity: asset.identity.clone(),
                expected,
                actual: payload.len() as u64,
            });
        }
        if original_entries.iter().any(|entry| {
            entry.resource_type == *b"snd " && entry.id == resource_id && entry.data == *payload
        }) {
            continue;
        }
        updates.push(ResourceEntry {
            resource_type: *b"snd ",
            id: resource_id,
            name: if asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE {
                original_entries
                    .iter()
                    .find(|entry| entry.resource_type == *b"snd " && entry.id == resource_id)
                    .map_or_else(|| asset.label.clone(), |entry| entry.name.clone())
            } else {
                asset.label.clone()
            },
            attributes: original_entries
                .iter()
                .find(|entry| entry.resource_type == *b"snd " && entry.id == resource_id)
                .map_or(0, |entry| entry.attributes),
            data: payload.clone(),
        });
    }
    merge_resource_entries_preserving_unowned_duplicates(&original, updates).map_err(Into::into)
}

fn push_u16(output: &mut Vec<u8>, value: usize) {
    output.extend_from_slice(&(value as u16).to_be_bytes());
}

fn push_u32(output: &mut Vec<u8>, value: usize) {
    output.extend_from_slice(&(value as u32).to_be_bytes());
}

#[cfg(test)]
mod tests {
    use crate::model::{BlobId, ClassicResourceKey};

    use super::*;

    fn sound(blob: &str, bytes: usize) -> AssetDescriptor {
        AssetDescriptor {
            identity: StableId("sound:200".into()),
            label: "Thornwatch Portcullis and Western Bell".into(),
            kind: "sound".into(),
            mime_type: Some("audio/wav".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "snd ".into(),
                resource_id: 200,
            }),
            scenario_music_slot: None,
            blob: BlobId(format!("sha256:{}", "a".repeat(64))),
            byte_length: 8,
            classic_payload_blob: Some(BlobId(blob.into())),
            classic_payload_byte_length: Some(bytes as u64),
            extension: Some("wav".into()),
            width: None,
            height: None,
            duration_ms: Some(12),
            sample_rate: Some(11_025),
            channels: Some(1),
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: "controlled WAV fixture".into(),
        }
    }

    #[test]
    fn snd_encoder_is_deterministic_and_downmixes_to_classic_mono() {
        let stereo = [0, 100, 50, 150, 100, 200];
        let first = encode_scenario_sound_snd(&stereo, 11_025, 2).unwrap();
        let second = encode_scenario_sound_snd(&stereo, 11_025, 2).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.len(), 45);
        assert_eq!(
            &first[..20],
            &[
                0, 1, 0, 1, 0, 5, 0, 0, 0, 128, 0, 1, 128, 81, 0, 0, 0, 0, 0, 20
            ]
        );
        assert_eq!(&first[42..], &[50, 100, 150]);
        assert_eq!(&first[28..32], &(11_025u32 << 16).to_be_bytes());
    }

    #[test]
    fn no_edit_sound_merge_preserves_the_container_byte_for_byte() {
        let payload = encode_scenario_sound_snd(&[128; 16], 11_025, 1).unwrap();
        let source = super::super::write_resource_fork(&[
            ResourceEntry {
                resource_type: *b"snd ",
                id: 200,
                name: "Existing".into(),
                attributes: 0,
                data: payload.clone(),
            },
            ResourceEntry {
                resource_type: *b"PICT",
                id: 30_000,
                name: "Preserve me".into(),
                attributes: 7,
                data: vec![9, 8, 7],
            },
        ])
        .unwrap();
        let blob = format!("sha256:{}", "b".repeat(64));
        let output = compile_scenario_sound_resource_fork(
            &[sound(&blob, payload.len())],
            &BTreeMap::from([(blob, payload)]),
            Some(&source),
        )
        .unwrap();
        assert_eq!(output, source);
    }

    #[test]
    fn edited_sound_preserves_every_unrelated_resource() {
        let source = super::super::write_resource_fork(&[
            ResourceEntry {
                resource_type: *b"snd ",
                id: 200,
                name: "Old".into(),
                attributes: 0,
                data: vec![1, 2],
            },
            ResourceEntry {
                resource_type: *b"PICT",
                id: 30_000,
                name: "Preserve me".into(),
                attributes: 7,
                data: vec![9, 8, 7],
            },
        ])
        .unwrap();
        let payload = encode_scenario_sound_snd(&[128; 8], 8_000, 1).unwrap();
        let blob = format!("sha256:{}", "c".repeat(64));
        let mut authored = sound(&blob, payload.len());
        authored.label = "Croak 1 — vNext Certified Reverse".into();
        let output = compile_scenario_sound_resource_fork(
            &[authored],
            &BTreeMap::from([(blob, payload.clone())]),
            Some(&source),
        )
        .unwrap();
        let entries = parse_resource_entries(&output).unwrap();
        let edited = entries
            .iter()
            .find(|entry| entry.resource_type == *b"snd ")
            .unwrap();
        assert_eq!(edited.name, "Croak 1 — vNext Certified Reverse");
        assert_eq!(edited.data, payload);
        let preserved = entries
            .iter()
            .find(|entry| entry.resource_type == *b"PICT")
            .unwrap();
        assert_eq!(preserved.name, "Preserve me");
        assert_eq!(preserved.attributes, 7);
        assert_eq!(preserved.data, vec![9, 8, 7]);
    }

    #[test]
    fn duplicate_sound_ids_are_rejected_before_resource_assembly() {
        let blob = format!("sha256:{}", "d".repeat(64));
        let payload = encode_scenario_sound_snd(&[128; 8], 8_000, 1).unwrap();
        let mut duplicate = sound(&blob, payload.len());
        duplicate.identity = StableId("sound:duplicate".into());
        let error = compile_scenario_sound_resource_fork(
            &[sound(&blob, payload.len()), duplicate],
            &BTreeMap::from([(blob, payload)]),
            None,
        )
        .unwrap_err();
        assert_eq!(error, ScenarioSoundCodecError::DuplicateResourceId(200));
    }
}
