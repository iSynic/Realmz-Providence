use std::collections::{BTreeMap, BTreeSet};

#[cfg(test)]
use crate::model::ClassicSourceBlob;
use crate::model::{ProjectSnapshot, StableId};

use super::{RebuiltV3AssetRecord, native_records::source_codec_descriptors};

/// Opaque Classic source payloads and their diagnostic receipt for package publication.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuiltV3NativeSourceAssets {
    pub descriptors: Vec<RebuiltV3AssetRecord>,
    pub payloads: Vec<(String, Vec<u8>)>,
}

/// Builds inert source assets, sharing exact selected media payloads without reading project storage.
pub fn project_rebuilt_v3_native_source_assets(
    snapshot: &ProjectSnapshot,
    source_bytes: &BTreeMap<String, Vec<u8>>,
    existing_assets: &[RebuiltV3AssetRecord],
) -> Result<RebuiltV3NativeSourceAssets, String> {
    let sources = &snapshot.classic_sources;
    if sources.is_empty() && !source_bytes.is_empty() {
        return Err("captured Classic source bytes have no declared source paths".into());
    }
    if sources.is_empty() {
        return Ok(RebuiltV3NativeSourceAssets {
            descriptors: Vec::new(),
            payloads: Vec::new(),
        });
    }
    let mut paths = BTreeSet::new();
    let mut payloads_by_hash = BTreeMap::<String, (String, Vec<u8>)>::new();
    let mut descriptors_by_hash = BTreeMap::<String, RebuiltV3AssetRecord>::new();
    let mut receipt_sources = Vec::with_capacity(sources.len());

    for source in sources {
        validate_unique_path(&mut paths, &source.native_path)?;
        let (bytes, sha256) = verified_source_bytes(source, source_bytes)?;
        let asset_path = shared_source_path(existing_assets, &sha256, source.byte_length)?;
        payloads_by_hash
            .entry(sha256.clone())
            .or_insert_with(|| (asset_path.clone(), bytes.clone()));
        descriptors_by_hash
            .entry(sha256.clone())
            .or_insert_with(|| {
                opaque_source_descriptor(
                    format!("classic-source-{sha256}"),
                    "Retained Classic source bytes".into(),
                    "classic-source".into(),
                    "application/octet-stream".into(),
                    sha256.clone(),
                    source.byte_length,
                    asset_path.clone(),
                )
            });
        receipt_sources.push(serde_json::json!({
            "nativePath": source.native_path.as_str(),
            "blob": source.blob.0.as_str(),
            "byteLength": source.byte_length,
            "sha256": sha256,
            "assetPath": asset_path,
            "framing": source_framing_diagnostics(snapshot, &source.native_path, source.byte_length),
        }));
    }

    if source_bytes.len() != paths.len() {
        return Err("captured Classic source bytes do not match the declared source paths".into());
    }

    finish_source_assets(payloads_by_hash, descriptors_by_hash, receipt_sources)
}

fn shared_source_path(
    existing: &[RebuiltV3AssetRecord],
    sha256: &str,
    bytes: u64,
) -> Result<String, String> {
    if existing
        .iter()
        .any(|asset| asset.sha256 == sha256 && asset.bytes != bytes)
    {
        return Err(format!(
            "shared Classic payload {sha256} has contradictory lengths"
        ));
    }
    Ok(existing
        .iter()
        .filter(|asset| asset.sha256 == sha256 && asset.bytes == bytes)
        .map(|asset| asset.path.as_str())
        .min()
        .map(str::to_owned)
        .unwrap_or_else(|| format!("assets/media/{sha256}.bin")))
}

fn opaque_source_descriptor(
    identity: String,
    label: String,
    kind: String,
    mime_type: String,
    sha256: String,
    bytes: u64,
    path: String,
) -> RebuiltV3AssetRecord {
    RebuiltV3AssetRecord {
        id: StableId(identity),
        label,
        kind,
        mime_type: Some(mime_type),
        resource_type: None,
        resource_id: None,
        scenario_music_slot: None,
        bytes,
        sha256,
        path,
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
    }
}

fn validate_native_source_path(path: &str) -> Result<(), String> {
    if path.trim().is_empty()
        || path.starts_with('/')
        || path.contains('\\')
        || path.contains(':')
        || path.bytes().any(|byte| byte.is_ascii_control())
        || path
            .split('/')
            .any(|component| component.is_empty() || component == "." || component == "..")
    {
        return Err(format!(
            "Classic source path {path:?} is not a safe relative path"
        ));
    }
    Ok(())
}

fn source_framing_diagnostics(
    snapshot: &ProjectSnapshot,
    native_path: &str,
    byte_length: u64,
) -> serde_json::Value {
    let codecs = source_codec_descriptors(snapshot, native_path)
        .into_iter()
        .map(|descriptor| {
            let framing = if descriptor.record_bytes == 0 {
                serde_json::json!({ "status": "invalid-zero-record-stride" })
            } else {
                let stride = descriptor.record_bytes as u64;
                serde_json::json!({
                    "status": "fixed-record",
                    "recordBytes": descriptor.record_bytes,
                    "completeRecordCount": byte_length / stride,
                    "trailingBytes": byte_length % stride,
                })
            };
            serde_json::json!({
                "family": descriptor.family,
                "framing": framing,
            })
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "status": if codecs.is_empty() { "opaque" } else { "registered-fixed-record" },
        "byteLength": byte_length,
        "codecs": codecs,
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(bytes))
}

fn verified_source_bytes<'a>(
    source: &crate::model::ClassicSourceBlob,
    source_bytes: &'a BTreeMap<String, Vec<u8>>,
) -> Result<(&'a Vec<u8>, String), String> {
    let bytes = source_bytes.get(&source.native_path).ok_or_else(|| {
        format!(
            "Classic source {} has no captured bytes",
            source.native_path
        )
    })?;
    if bytes.len() as u64 != source.byte_length {
        return Err(format!(
            "Classic source {} declares {} bytes but its captured blob contains {}",
            source.native_path,
            source.byte_length,
            bytes.len()
        ));
    }
    let sha256 = sha256_hex(bytes);
    let declared_hash = source.blob.0.strip_prefix("sha256:").ok_or_else(|| {
        format!(
            "Classic source {} has an invalid retained blob identity",
            source.native_path
        )
    })?;
    if declared_hash.len() != 64
        || !declared_hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        || !declared_hash.eq_ignore_ascii_case(&sha256)
    {
        return Err(format!(
            "Classic source {} retained blob identity does not match its bytes",
            source.native_path
        ));
    }

    Ok((bytes, sha256))
}

fn finish_source_assets(
    payloads_by_hash: BTreeMap<String, (String, Vec<u8>)>,
    mut descriptors_by_hash: BTreeMap<String, RebuiltV3AssetRecord>,
    receipt_sources: Vec<serde_json::Value>,
) -> Result<RebuiltV3NativeSourceAssets, String> {
    let receipt = serde_json::json!({
        "kind": "realmz2.classic-source-retention",
        "schemaVersion": 1,
        "sources": receipt_sources,
    });
    let receipt_bytes = serde_json::to_vec(&receipt)
        .map_err(|error| format!("Classic source receipt serialization failed: {error}"))?;
    let receipt_sha256 = sha256_hex(&receipt_bytes);
    let receipt_path = format!("assets/media/{receipt_sha256}.json");
    let receipt_length = receipt_bytes.len() as u64;
    descriptors_by_hash.insert(
        format!("receipt:{receipt_sha256}"),
        opaque_source_descriptor(
            format!("classic-source-index-{receipt_sha256}"),
            "Retained Classic source index".into(),
            "classic-source-index".into(),
            "application/json".into(),
            receipt_sha256,
            receipt_length,
            receipt_path.clone(),
        ),
    );
    let mut payloads = payloads_by_hash.into_values().collect::<Vec<_>>();
    payloads.push((receipt_path, receipt_bytes));
    Ok(RebuiltV3NativeSourceAssets {
        descriptors: descriptors_by_hash.into_values().collect(),
        payloads,
    })
}

fn validate_unique_path<'a>(paths: &mut BTreeSet<&'a str>, path: &'a str) -> Result<(), String> {
    validate_native_source_path(path)?;
    if !paths.insert(path) {
        return Err(format!(
            "Classic source path {} appears more than once",
            path
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn retained_source(path: &str, bytes: &[u8]) -> ClassicSourceBlob {
        ClassicSourceBlob {
            native_path: path.into(),
            blob: crate::model::BlobId(format!("sha256:{}", sha256_hex(bytes))),
            byte_length: bytes.len() as u64,
        }
    }

    fn project_sources(
        sources: Vec<ClassicSourceBlob>,
        source_bytes: &BTreeMap<String, Vec<u8>>,
    ) -> Result<RebuiltV3NativeSourceAssets, String> {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("native-sources-test".into()));
        snapshot.classic_sources = sources;
        project_rebuilt_v3_native_source_assets(&snapshot, source_bytes, &[])
    }

    #[test]
    fn source_assets_deduplicate_payloads_and_retain_partial_record_bytes() {
        let bytes = vec![0x5a; 259];
        let sources = vec![
            retained_source("Data SD2", &bytes),
            retained_source("Dormant copy", &bytes),
        ];
        let captured = BTreeMap::from([
            ("Data SD2".into(), bytes.clone()),
            ("Dormant copy".into(), bytes.clone()),
        ]);

        let retained = project_sources(sources, &captured).expect("retained source assets");
        let source_descriptors = retained
            .descriptors
            .iter()
            .filter(|descriptor| descriptor.kind == "classic-source")
            .collect::<Vec<_>>();
        assert_eq!(source_descriptors.len(), 1);
        assert_eq!(source_descriptors[0].resource_type, None);
        assert_eq!(source_descriptors[0].resource_id, None);
        assert_eq!(
            source_descriptors[0].mime_type.as_deref(),
            Some("application/octet-stream")
        );

        let raw_payloads = retained
            .payloads
            .iter()
            .filter(|(path, _)| path.ends_with(".bin"))
            .collect::<Vec<_>>();
        assert_eq!(raw_payloads.len(), 1);
        assert_eq!(raw_payloads[0].1, bytes);
        let receipt = retained
            .payloads
            .iter()
            .find(|(path, _)| path.ends_with(".json"))
            .expect("source receipt");
        let receipt: serde_json::Value = serde_json::from_slice(&receipt.1).unwrap();
        assert_eq!(receipt["sources"].as_array().unwrap().len(), 2);
        assert_eq!(
            receipt["sources"][0]["framing"]["codecs"][0]["framing"]["trailingBytes"],
            3
        );
        assert_eq!(receipt["sources"][1]["framing"]["status"], "opaque");
    }

    #[test]
    fn source_assets_reject_tampered_hash_length_and_paths() {
        let bytes = b"captured bytes".to_vec();
        let source = retained_source("Data SD2", &bytes);

        let wrong_hash = ClassicSourceBlob {
            blob: crate::model::BlobId(format!("sha256:{}", "0".repeat(64))),
            ..source.clone()
        };
        assert!(
            project_sources(
                vec![wrong_hash],
                &BTreeMap::from([("Data SD2".into(), bytes.clone())]),
            )
            .is_err()
        );

        let wrong_length = ClassicSourceBlob {
            byte_length: bytes.len() as u64 + 1,
            ..source.clone()
        };
        assert!(
            project_sources(
                vec![wrong_length],
                &BTreeMap::from([("Data SD2".into(), bytes.clone())]),
            )
            .is_err()
        );

        let unsafe_path = ClassicSourceBlob {
            native_path: "../Data SD2".into(),
            ..source
        };
        assert!(
            project_sources(
                vec![unsafe_path],
                &BTreeMap::from([("../Data SD2".into(), bytes)]),
            )
            .is_err()
        );
    }

    #[test]
    fn dynamic_source_framing_uses_the_shared_snapshot_resolver() {
        let bytes = vec![0; crate::codecs::MAPSTATS_RECORD_BYTES * 2 + 3];
        let custom = retained_source("Data Custom 3 BD", &bytes);
        let custom_snapshot = ProjectSnapshot {
            classic_sources: vec![custom],
            ..ProjectSnapshot::new_authored(StableId("custom-source-layout".into()))
        };
        let custom_framing =
            source_framing_diagnostics(&custom_snapshot, "Data Custom 3 BD", bytes.len() as u64);
        assert_eq!(custom_framing["status"], "registered-fixed-record");
        assert_eq!(
            custom_framing["codecs"][0]["framing"]["recordBytes"],
            crate::codecs::MAPSTATS_RECORD_BYTES
        );
        assert_eq!(
            custom_framing["codecs"][0]["framing"]["completeRecordCount"],
            2
        );
        assert_eq!(custom_framing["codecs"][0]["framing"]["trailingBytes"], 3);

        let marker_bytes = vec![0; crate::codecs::SCENARIO_STARTUP_BYTES];
        let marker = retained_source("Exact Original Marker", &marker_bytes);
        let mut snapshot = ProjectSnapshot::new_authored(StableId("marker-source-layout".into()));
        snapshot.campaign = Some(crate::model::CampaignMetadata::neutral());
        snapshot.classic_sources = vec![marker.clone()];
        snapshot.startup_authoring = Some(crate::model::ScenarioStartupAuthoring {
            marker_filename: "Renamed Marker".into(),
            original_source: Some(marker),
            security: None,
        });
        let marker_framing = source_framing_diagnostics(
            &snapshot,
            "Exact Original Marker",
            marker_bytes.len() as u64,
        );
        assert_eq!(marker_framing["status"], "registered-fixed-record");
        assert_eq!(marker_framing["codecs"].as_array().unwrap().len(), 2);
        assert_eq!(
            source_framing_diagnostics(&snapshot, "Renamed Marker", marker_bytes.len() as u64)["status"],
            "opaque"
        );
        assert_eq!(
            source_framing_diagnostics(&snapshot, "Data Custom 4 BD", bytes.len() as u64)["status"],
            "opaque"
        );
    }
    fn selected_media_fixture() -> (
        ProjectSnapshot,
        BTreeMap<String, Vec<u8>>,
        RebuiltV3AssetRecord,
    ) {
        let bytes = b"MADGretained source and media".to_vec();
        let mut snapshot = ProjectSnapshot::new_authored(StableId("shared-source-test".into()));
        snapshot.classic_sources = vec![retained_source("Custom 2 Music", &bytes)];
        let captured = BTreeMap::from([("Custom 2 Music".into(), bytes)]);
        let baseline = project_rebuilt_v3_native_source_assets(&snapshot, &captured, &[]).unwrap();
        let mut media = baseline
            .descriptors
            .iter()
            .find(|asset| asset.kind == "classic-source")
            .unwrap()
            .clone();
        media.kind = "music".into();
        media.mime_type = Some("audio/x-mad".into());
        media.scenario_music_slot = Some(2);
        media.id = StableId("music-one".into());
        media.path = format!("assets/media/{}.mad", media.sha256);
        (snapshot, captured, media)
    }

    #[test]
    fn shared_media_path_is_order_independent_and_preserves_source_semantics() {
        let (snapshot, captured, media) = selected_media_fixture();
        let mut later = media.clone();
        later.id = StableId("music-two".into());
        later.path = format!("assets/media/{}.wav", later.sha256);
        let shared = project_rebuilt_v3_native_source_assets(
            &snapshot,
            &captured,
            &[media.clone(), later.clone()],
        )
        .unwrap();
        assert_eq!(
            project_rebuilt_v3_native_source_assets(&snapshot, &captured, &[later, media.clone()])
                .unwrap(),
            shared
        );
        let baseline = project_rebuilt_v3_native_source_assets(&snapshot, &captured, &[]).unwrap();
        let mut expected = baseline
            .descriptors
            .iter()
            .find(|asset| asset.kind == "classic-source")
            .unwrap()
            .clone();
        expected.path = media.path.clone();
        assert_eq!(
            shared
                .descriptors
                .iter()
                .find(|asset| asset.kind == "classic-source")
                .unwrap(),
            &expected
        );
        assert_eq!(
            shared
                .payloads
                .iter()
                .find(|(path, _)| path == &media.path)
                .unwrap()
                .1,
            captured["Custom 2 Music"]
        );
        assert!(
            !shared
                .payloads
                .iter()
                .any(|(path, _)| path.ends_with(".bin"))
        );
        let receipt = shared
            .payloads
            .iter()
            .find(|(path, _)| path.ends_with(".json"))
            .unwrap();
        let receipt: serde_json::Value = serde_json::from_slice(&receipt.1).unwrap();
        assert_eq!(receipt["sources"][0]["assetPath"], media.path);
    }

    #[test]
    fn matching_hash_with_conflicting_lengths_cannot_share_a_source_path() {
        let (snapshot, captured, mut media) = selected_media_fixture();
        media.bytes += 1;
        assert!(project_rebuilt_v3_native_source_assets(&snapshot, &captured, &[media]).is_err());
    }
}
