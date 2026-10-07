use super::{normalized_query, page};
use providence_core::{
    codecs::{CODEC_REGISTRY, NativeFileFamily, RESOURCE_CODEC_REGISTRY},
    model::{ClassicSourceBlob, ProjectSnapshot},
    session::EditorSession,
};
use serde_json::{Value, json};

pub(crate) fn source_evidence_list(
    session: &EditorSession,
    params: &Value,
) -> Result<Value, String> {
    let query = normalized_query(params);
    let kind = params
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("all")
        .trim();
    let snapshot = session.snapshot();
    let mut matches = snapshot
        .classic_sources
        .iter()
        .filter(|source| {
            let summary = source_summary(snapshot, source);
            kind == "all" || summary.kind == kind
        })
        .filter(|source| {
            query.is_empty()
                || source.native_path.to_lowercase().contains(&query)
                || source.blob.0.to_lowercase().contains(&query)
        })
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| left.native_path.cmp(&right.native_path));
    let total = matches.len();
    let (offset, limit) = page(params);
    let items = matches
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|source| source_list_projection(snapshot, source))
        .collect::<Vec<_>>();

    Ok(json!({
        "revision": session.revision(),
        "origin": session.snapshot().origin,
        "items": items,
        "offset": offset,
        "limit": limit,
        "total": total,
        "truncated": offset.saturating_add(limit) < total,
    }))
}

pub(crate) fn source_evidence_open(
    session: &EditorSession,
    params: &Value,
) -> Result<Value, String> {
    let native_path = params
        .get("nativePath")
        .and_then(Value::as_str)
        .ok_or_else(|| "source-evidence.open requires nativePath".to_string())?;
    let matches = session
        .snapshot()
        .classic_sources
        .iter()
        .filter(|source| source.native_path == native_path)
        .collect::<Vec<_>>();
    let source = match matches.as_slice() {
        [] => {
            return Err(format!(
                "Retained Classic source '{native_path}' was not found"
            ));
        }
        [source] => *source,
        _ => {
            return Err(format!(
                "Retained Classic source '{native_path}' is ambiguous"
            ));
        }
    };
    let snapshot = session.snapshot();
    let codecs = codec_geometry(snapshot, source);
    let resources = matching_resource_codecs(native_path)
        .into_iter()
        .map(|descriptor| {
            json!({
                "family": descriptor.family,
                "nativePathPattern": descriptor.native_path,
                "resourceType": String::from_utf8_lossy(&descriptor.resource_type),
                "minimumResourceId": descriptor.minimum_resource_id,
                "maximumResourceId": descriptor.maximum_resource_id,
                "payloadFullyOwned": descriptor.payload_is_fully_owned,
            })
        })
        .collect::<Vec<_>>();
    let summary = source_summary(snapshot, source);

    Ok(json!({
        "revision": session.revision(),
        "source": source,
        "kind": summary.kind,
        "registered": summary.registered,
        "codecDescriptors": codecs,
        "resourceCodecDescriptors": resources,
        "rawBytesIncluded": false,
        "decodedRecordCount": crate::record_catalog::decoded_count(snapshot, native_path),
    }))
}

fn codec_geometry(snapshot: &ProjectSnapshot, source: &ClassicSourceBlob) -> Vec<Value> {
    matching_codecs(snapshot, &source.native_path)
        .into_iter()
        .map(|descriptor| {
            json!({
                "family": descriptor.family,
                "nativePathPattern": descriptor.native_path,
                "recordBytes": descriptor.record_bytes,
                "recordCount": record_count(descriptor.family, source.byte_length, descriptor.record_bytes),
                "trailingBytes": source.byte_length - record_count(descriptor.family, source.byte_length, descriptor.record_bytes) * descriptor.record_bytes as u64,
                "ownedByteRanges": descriptor.owned_byte_ranges,
                "compatibilityOverlay": descriptor.compatibility_overlay,
            })
        })
        .collect::<Vec<_>>()
}

struct SourceSummary {
    kind: &'static str,
    registered: bool,
    codec_families: Vec<NativeFileFamily>,
    resource_families: Vec<NativeFileFamily>,
}

fn source_list_projection(snapshot: &ProjectSnapshot, source: &ClassicSourceBlob) -> Value {
    let summary = source_summary(snapshot, source);
    json!({
        "nativePath": source.native_path,
        "blob": source.blob,
        "byteLength": source.byte_length,
        "kind": summary.kind,
        "registered": summary.registered,
        "codecFamilies": summary.codec_families,
        "resourceCodecFamilies": summary.resource_families,
    })
}

fn source_summary(snapshot: &ProjectSnapshot, source: &ClassicSourceBlob) -> SourceSummary {
    let codecs = matching_codecs(snapshot, &source.native_path);
    let resources = matching_resource_codecs(&source.native_path);
    let registered = !codecs.is_empty() || !resources.is_empty();
    let kind = if !resources.is_empty() || source.native_path.ends_with(".rsrc") {
        "resource-container"
    } else if !codecs.is_empty() {
        "record-file"
    } else {
        "compatibility-only"
    };
    SourceSummary {
        kind,
        registered,
        codec_families: codecs
            .into_iter()
            .map(|descriptor| descriptor.family)
            .collect(),
        resource_families: resources
            .into_iter()
            .map(|descriptor| descriptor.family)
            .collect(),
    }
}

fn matching_codecs(
    snapshot: &ProjectSnapshot,
    native_path: &str,
) -> Vec<&'static providence_core::codecs::CodecDescriptor> {
    CODEC_REGISTRY
        .iter()
        .filter(|descriptor| {
            descriptor.native_path == native_path
                || (matches!(
                    descriptor.family,
                    NativeFileFamily::ScenarioStartup | NativeFileFamily::ScenarioSecurityStartup
                ) && captured_marker(snapshot) == Some(native_path))
                || (descriptor.family == NativeFileFamily::CustomLandlookMetadata
                    && matches!(
                        native_path,
                        "Data Custom 1 BD" | "Data Custom 2 BD" | "Data Custom 3 BD"
                    ))
        })
        .collect()
}

fn matching_resource_codecs(
    native_path: &str,
) -> Vec<&'static providence_core::codecs::ResourceCodecDescriptor> {
    RESOURCE_CODEC_REGISTRY
        .iter()
        .filter(|descriptor| descriptor.native_path == native_path)
        .collect()
}

fn record_count(family: NativeFileFamily, byte_length: u64, stride: usize) -> u64 {
    let count = byte_length / stride as u64;
    if family == NativeFileFamily::RaceRules {
        count.min(providence_core::codecs::CLASSIC_RACE_RECORDS as u64)
    } else {
        count
    }
}

fn captured_marker(snapshot: &ProjectSnapshot) -> Option<&str> {
    snapshot
        .startup_authoring
        .as_ref()
        .map(|startup| {
            startup
                .original_source
                .as_ref()
                .map_or(startup.marker_filename.as_str(), |source| {
                    source.native_path.as_str()
                })
        })
        .or_else(|| {
            snapshot
                .campaign
                .as_ref()
                .map(|campaign| campaign.name.as_str())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::model::{BlobId, CampaignMetadata, ScenarioStartupAuthoring, StableId};

    #[test]
    fn source_geometry_caps_race_records_and_retains_whole_stride_residue() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("geometry".into()));
        snapshot.classic_sources.push(ClassicSourceBlob {
            native_path: "Data Race".into(),
            blob: BlobId("sha256:race".into()),
            byte_length: 31 * 408 + 7,
        });
        let session = EditorSession::new(snapshot);
        let opened = source_evidence_open(&session, &json!({"nativePath":"Data Race"})).unwrap();
        assert_eq!(opened["codecDescriptors"][0]["recordCount"], 30);
        assert_eq!(opened["codecDescriptors"][0]["trailingBytes"], 415);
        assert_eq!(opened["rawBytesIncluded"], false);
    }

    #[test]
    fn marker_descriptors_use_captured_source_after_authoring_renames_it() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("marker".into()));
        let mut campaign = CampaignMetadata::neutral();
        campaign.name = "New title".into();
        snapshot.campaign = Some(campaign);
        let source = ClassicSourceBlob {
            native_path: "Original marker".into(),
            blob: BlobId("sha256:marker".into()),
            byte_length: 200,
        };
        snapshot.classic_sources.push(source.clone());
        snapshot.startup_authoring = Some(ScenarioStartupAuthoring {
            marker_filename: "New marker".into(),
            original_source: Some(source),
            security: None,
        });
        let codecs = matching_codecs(&snapshot, "Original marker");
        assert!(
            codecs
                .iter()
                .any(|codec| codec.family == NativeFileFamily::ScenarioStartup)
        );
        assert!(
            codecs
                .iter()
                .any(|codec| codec.family == NativeFileFamily::ScenarioSecurityStartup)
        );
        assert!(matching_codecs(&snapshot, "New marker").is_empty());
    }

    #[test]
    fn duplicate_source_paths_are_not_selected_and_unknown_sources_have_no_geometry() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("source-owners".into()));
        let source = ClassicSourceBlob {
            native_path: "Data SD2".into(),
            blob: BlobId("sha256:first".into()),
            byte_length: 256,
        };
        snapshot.classic_sources.extend([
            source.clone(),
            ClassicSourceBlob {
                blob: BlobId("sha256:second".into()),
                ..source
            },
        ]);
        snapshot.classic_sources.push(ClassicSourceBlob {
            native_path: "Unregistered source".into(),
            blob: BlobId("sha256:unknown".into()),
            byte_length: 409,
        });
        let session = EditorSession::new(snapshot);
        assert!(
            source_evidence_open(&session, &json!({"nativePath":"Data SD2"}))
                .unwrap_err()
                .contains("ambiguous")
        );
        let unknown =
            source_evidence_open(&session, &json!({"nativePath":"Unregistered source"})).unwrap();
        assert_eq!(unknown["registered"], false);
        assert_eq!(unknown["decodedRecordCount"], 0);
        assert_eq!(unknown["codecDescriptors"], json!([]));
        assert_eq!(unknown["resourceCodecDescriptors"], json!([]));
        assert_eq!(unknown["rawBytesIncluded"], false);
    }
}
