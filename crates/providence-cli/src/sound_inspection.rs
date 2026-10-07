use crate::output::report_error;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::codecs::decode_classic_snd;
use providence_core::codecs::encode_runtime_pcm_wav;
use providence_core::codecs::parse_resource_entries_preserving_duplicates;
use serde_json::{Value, json};
use sha2::Digest;
use sha2::Sha256;
use std::collections::BTreeMap;
use std::collections::BTreeSet;
use std::fs;
use std::process::ExitCode;

use crate::output::{Inspection, finish_inspection};
#[cfg(test)]
mod tests;
use providence_core::codecs::{DecodedSnd, ResourceEntry};

pub(crate) fn inspect_snd_resources(path: &str, sample_resource_id: Option<i16>) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read resource fork: {error}")),
    };
    let entries = match parse_resource_entries_preserving_duplicates(&bytes) {
        Ok(entries) => entries,
        Err(error) => return report_error(error.to_string()),
    };
    let resources = entries
        .iter()
        .filter(|entry| entry.resource_type == *b"snd ")
        .collect::<Vec<_>>();
    let mut inspection = SoundInspection::default();
    for entry in &resources {
        inspection.observe(entry);
    }
    finish_inspection(Ok(inspection.report(
        path,
        &bytes,
        &resources,
        sample_resource_id,
    )))
}

#[derive(Default)]
struct SoundInspection {
    formats: BTreeMap<String, usize>,
    commands: BTreeMap<String, usize>,
    header_locations: BTreeMap<String, usize>,
    header_kinds: BTreeMap<String, usize>,
    compressions: BTreeMap<String, usize>,
    sample_rates: BTreeMap<u32, usize>,
    audio_shapes: BTreeMap<String, usize>,
    failures: Vec<Value>,
    materialization_failures: Vec<Value>,
    decoded_hash: Sha256,
    runtime_wav_hash: Sha256,
    decoded_count: usize,
    decoded_pcm_bytes: usize,
    runtime_wav_count: usize,
    runtime_wav_bytes: usize,
    total_frames: u64,
    total_duration_ms: u64,
}

impl SoundInspection {
    fn observe(&mut self, entry: &ResourceEntry) {
        match decode_classic_snd(&entry.data) {
            Ok(decoded) => {
                self.record_decoded(entry, decoded);
            }
            Err(error) => self.failures.push(json!({
                "resourceId": entry.id,
                "name": entry.name,
                "bytes": entry.data.len(),
                "error": error.to_string(),
            })),
        }
    }
    fn record_decoded(&mut self, entry: &ResourceEntry, decoded: DecodedSnd) {
        self.decoded_count += 1;
        self.decoded_pcm_bytes += decoded.runtime_pcm.len();
        self.total_frames += u64::from(decoded.frames);
        self.total_duration_ms += decoded.duration_ms();
        *self
            .formats
            .entry(decoded.resource_format.name().to_string())
            .or_default() += 1;
        *self
            .commands
            .entry(format!("0x{:04x}", decoded.command))
            .or_default() += 1;
        *self
            .header_locations
            .entry(decoded.header_location.name().to_string())
            .or_default() += 1;
        *self
            .header_kinds
            .entry(decoded.header_kind.name().to_string())
            .or_default() += 1;
        *self
            .compressions
            .entry(decoded.compression.name().to_string())
            .or_default() += 1;
        *self.sample_rates.entry(decoded.sample_rate).or_default() += 1;
        *self
            .audio_shapes
            .entry(format!(
                "{}ch/{}-bit",
                decoded.channels, decoded.bits_per_sample
            ))
            .or_default() += 1;
        self.decoded_hash.update(entry.id.to_be_bytes());
        self.decoded_hash
            .update(decoded.resource_format.name().as_bytes());
        self.decoded_hash.update(decoded.command.to_be_bytes());
        self.decoded_hash
            .update(decoded.compression.name().as_bytes());
        self.decoded_hash
            .update(decoded.sample_rate_fixed.to_be_bytes());
        self.decoded_hash.update(decoded.channels.to_be_bytes());
        self.decoded_hash
            .update(decoded.bits_per_sample.to_be_bytes());
        self.decoded_hash.update(decoded.frames.to_be_bytes());
        self.decoded_hash.update(decoded.loop_start.to_be_bytes());
        self.decoded_hash.update(decoded.loop_end.to_be_bytes());
        self.decoded_hash.update([decoded.base_frequency]);
        self.decoded_hash.update(&decoded.runtime_pcm);
        self.materialize(entry, &decoded);
    }
    fn materialize(&mut self, entry: &ResourceEntry, decoded: &DecodedSnd) {
        match encode_runtime_pcm_wav(
            &decoded.runtime_pcm,
            decoded.sample_rate,
            decoded.channels,
            decoded.bits_per_sample,
        ) {
            Ok(wav) => {
                self.runtime_wav_count += 1;
                self.runtime_wav_bytes += wav.len();
                self.runtime_wav_hash.update(entry.id.to_be_bytes());
                self.runtime_wav_hash
                    .update(decoded.sample_rate.to_be_bytes());
                self.runtime_wav_hash.update(decoded.channels.to_be_bytes());
                self.runtime_wav_hash
                    .update(decoded.bits_per_sample.to_be_bytes());
                self.runtime_wav_hash.update(wav);
            }
            Err(error) => self.materialization_failures.push(json!({
                "resourceId": entry.id,
                "name": entry.name,
                "error": error.to_string(),
            })),
        }
    }
    fn report(
        self,
        path: &str,
        bytes: &[u8],
        resources: &[&ResourceEntry],
        sample_resource_id: Option<i16>,
    ) -> Inspection {
        let resource_ids = resources
            .iter()
            .map(|entry| entry.id)
            .collect::<BTreeSet<_>>();
        let duplicate_resource_ids = duplicate_resource_ids(resources);
        let catalog_identity_unique = duplicate_resource_ids.is_empty();

        let all_payloads_decoded = self.failures.is_empty();
        let all_wavs_materialized = self.materialization_failures.is_empty()
            && self.runtime_wav_count == self.decoded_count;
        let sample_wav = sample_resource_id.map(|id| sample(resources, id));
        let sample_wav_valid = sample_wav
            .as_ref()
            .is_none_or(|sample| sample.get("base64").is_some());
        Inspection {
            accepted: all_payloads_decoded && all_wavs_materialized && sample_wav_valid,
            report: json!({
                "path": path,
                "sourceBytes": bytes.len(),
                "sourceSha256": format!("{:x}", Sha256::digest(bytes)),
                "resources": resources.len(),
                "decoded": self.decoded_count,
                "minimumResourceId": resource_ids.first(),
                "maximumResourceId": resource_ids.last(),
                "formats": self.formats,
                "commands": self.commands,
                "headerLocations": self.header_locations,
                "headerKinds": self.header_kinds,
                "compressions": self.compressions,
                "sampleRates": self.sample_rates,
                "audioShapes": self.audio_shapes,
                "totalFrames": self.total_frames,
                "totalDurationMs": self.total_duration_ms,
                "decodedPcmBytes": self.decoded_pcm_bytes,
                "decodedPcmSha256": format!("{:x}", self.decoded_hash.finalize()),
                "failures": self.failures,
                "runtimeWavs": self.runtime_wav_count,
                "runtimeWavBytes": self.runtime_wav_bytes,
                "runtimeWavSha256": format!("{:x}", self.runtime_wav_hash.finalize()),
                "materializationFailures": self.materialization_failures,
                "duplicateResourceIds": duplicate_resource_ids,
                "catalogIdentityUnique": catalog_identity_unique,
                "allPayloadsDecoded": all_payloads_decoded,
                "allWavsMaterialized": all_wavs_materialized,
                "sampleWav": sample_wav,
                "sampleWavValid": sample_wav_valid,
                "readOnlyProbe": true,
            }),
        }
    }
}

fn duplicate_resource_ids(resources: &[&ResourceEntry]) -> Vec<Value> {
    let mut identity_counts = BTreeMap::<i16, usize>::new();
    for entry in resources {
        *identity_counts.entry(entry.id).or_default() += 1;
    }
    identity_counts
        .into_iter()
        .filter_map(|(id, count)| (count > 1).then_some(json!({ "id": id, "count": count })))
        .collect::<Vec<_>>()
}

fn sample(resources: &[&ResourceEntry], resource_id: i16) -> Value {
    let matches = resources
        .iter()
        .filter(|entry| entry.id == resource_id)
        .collect::<Vec<_>>();
    match matches.as_slice() {
        [] => json!({
            "resourceId": resource_id,
            "error": "resource is unavailable",
        }),
        [entry] => match decode_classic_snd(&entry.data) {
            Ok(decoded) => match encode_runtime_pcm_wav(
                &decoded.runtime_pcm,
                decoded.sample_rate,
                decoded.channels,
                decoded.bits_per_sample,
            ) {
                Ok(wav) => json!({
                    "resourceId": resource_id,
                    "format": decoded.resource_format.name(),
                    "command": format!("0x{:04x}", decoded.command),
                    "headerLocation": decoded.header_location.name(),
                    "headerOffset": decoded.header_offset,
                    "headerKind": decoded.header_kind.name(),
                    "compression": decoded.compression.name(),
                    "sampleRateFixed": decoded.sample_rate_fixed,
                    "sampleRate": decoded.sample_rate,
                    "channels": decoded.channels,
                    "bitsPerSample": decoded.bits_per_sample,
                    "frames": decoded.frames,
                    "durationMs": decoded.duration_ms(),
                    "pcmBytes": decoded.runtime_pcm.len(),
                    "mimeType": "audio/wav",
                    "bytes": wav.len(),
                    "sha256": format!("{:x}", Sha256::digest(&wav)),
                    "base64": BASE64.encode(wav),
                }),
                Err(error) => json!({
                    "resourceId": resource_id,
                    "error": error.to_string(),
                }),
            },
            Err(error) => json!({
                "resourceId": resource_id,
                "error": error.to_string(),
            }),
        },
        _ => json!({
            "resourceId": resource_id,
            "error": "resource identity is ambiguous",
        }),
    }
}
