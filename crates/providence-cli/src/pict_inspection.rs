use crate::output::report_error;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::codecs::decode_classic_pict;
use providence_core::codecs::encode_runtime_rgba_png;
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
use providence_core::codecs::{DecodedPict, ResourceEntry};

pub(crate) fn inspect_pict_resources(path: &str, sample_resource_id: Option<i16>) -> ExitCode {
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
        .filter(|entry| entry.resource_type == *b"PICT")
        .collect::<Vec<_>>();
    let mut inspection = PictInspection::default();
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
struct PictInspection {
    formats: BTreeMap<String, usize>,
    stream_versions: BTreeMap<String, usize>,
    dimensions: BTreeMap<String, usize>,
    command_counts: BTreeMap<usize, usize>,
    failures: Vec<Value>,
    materialization_failures: Vec<Value>,
    decoded_hash: Sha256,
    runtime_png_hash: Sha256,
    decoded_count: usize,
    materialized_count: usize,
    runtime_png_bytes: usize,
}

impl PictInspection {
    fn observe(&mut self, entry: &ResourceEntry) {
        match decode_classic_pict(&entry.data) {
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
    fn record_decoded(&mut self, entry: &ResourceEntry, decoded: DecodedPict) {
        self.decoded_count += 1;
        *self
            .stream_versions
            .entry(decoded.stream_version.name().to_string())
            .or_default() += 1;
        for format in &decoded.formats {
            *self.formats.entry(format.name().to_string()).or_default() += 1;
        }
        *self
            .dimensions
            .entry(format!("{}x{}", decoded.width, decoded.height))
            .or_default() += 1;
        *self
            .command_counts
            .entry(decoded.bitmap_commands)
            .or_default() += 1;
        self.decoded_hash.update(entry.id.to_be_bytes());
        self.decoded_hash.update(decoded.width.to_be_bytes());
        self.decoded_hash.update(decoded.height.to_be_bytes());
        self.decoded_hash
            .update((decoded.bitmap_commands as u64).to_be_bytes());
        for format in &decoded.formats {
            self.decoded_hash.update(format.name().as_bytes());
            self.decoded_hash.update([0]);
        }
        self.decoded_hash.update(&decoded.rgba);
        self.materialize(entry, &decoded);
    }
    fn materialize(&mut self, entry: &ResourceEntry, decoded: &DecodedPict) {
        match encode_runtime_rgba_png(&decoded.rgba, decoded.width, decoded.height) {
            Ok(png) => {
                self.materialized_count += 1;
                self.runtime_png_bytes += png.len();
                self.runtime_png_hash.update(entry.id.to_be_bytes());
                self.runtime_png_hash.update(decoded.width.to_be_bytes());
                self.runtime_png_hash.update(decoded.height.to_be_bytes());
                self.runtime_png_hash.update(png);
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
        let all_pngs_materialized = self.materialization_failures.is_empty()
            && self.materialized_count == self.decoded_count;
        let sample_png = sample_resource_id.map(|id| sample(resources, id));
        let sample_png_valid = sample_png
            .as_ref()
            .is_none_or(|sample| sample.get("base64").is_some());
        Inspection {
            accepted: all_payloads_decoded && all_pngs_materialized && sample_png_valid,
            report: json!({
                "path": path,
                "sourceBytes": bytes.len(),
                "sourceSha256": format!("{:x}", Sha256::digest(bytes)),
                "resources": resources.len(),
                "decoded": self.decoded_count,
                "minimumResourceId": resource_ids.first(),
                "maximumResourceId": resource_ids.last(),
                "formats": self.formats,
                "streamVersions": self.stream_versions,
                "dimensions": self.dimensions,
                "bitmapCommandCounts": self.command_counts,
                "decodedRgbaSha256": format!("{:x}", self.decoded_hash.finalize()),
                "failures": self.failures,
                "runtimePngs": self.materialized_count,
                "runtimePngBytes": self.runtime_png_bytes,
                "runtimePngSha256": format!("{:x}", self.runtime_png_hash.finalize()),
                "materializationFailures": self.materialization_failures,
                "duplicateResourceIds": duplicate_resource_ids,
                "catalogIdentityUnique": catalog_identity_unique,
                "allPayloadsDecoded": all_payloads_decoded,
                "allPngsMaterialized": all_pngs_materialized,
                "samplePng": sample_png,
                "samplePngValid": sample_png_valid,
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
        [entry] => match decode_classic_pict(&entry.data) {
            Ok(decoded) => {
                match encode_runtime_rgba_png(&decoded.rgba, decoded.width, decoded.height) {
                    Ok(png) => json!({
                        "resourceId": resource_id,
                        "streamVersion": decoded.stream_version.name(),
                        "width": decoded.width,
                        "height": decoded.height,
                        "bitmapCommands": decoded.bitmap_commands,
                        "formats": decoded.formats.iter().map(|format| format.name()).collect::<Vec<_>>(),
                        "mimeType": "image/png",
                        "bytes": png.len(),
                        "sha256": format!("{:x}", Sha256::digest(&png)),
                        "base64": BASE64.encode(png),
                    }),
                    Err(error) => json!({
                        "resourceId": resource_id,
                        "error": error.to_string(),
                    }),
                }
            }
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
