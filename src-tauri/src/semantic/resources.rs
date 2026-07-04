use super::common::*;
use crate::project::*;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

const APPLE_SINGLE_MAGIC: usize = 0x0005_1600;
const APPLE_DOUBLE_MAGIC: usize = 0x0005_1607;
const RESOURCE_FORK_ENTRY_ID: usize = 2;

pub(super) fn add_resources(schema: &mut SemanticSchema, buffers: &BTreeMap<String, Vec<u8>>) {
    for (source_name, buffer) in buffers.iter().filter(|(name, _)| is_resource_file(name)) {
        let resources = parse_resource_fork(buffer);
        if resources.is_empty() {
            schema.diagnostics.push(SemanticDiagnostic {
                id: format!(
                    "diagnostic:resource-fork-empty:{}",
                    source_name.replace([' ', '.'], "-")
                ),
                diagnostic_type: "resource-fork-empty".to_string(),
                severity: DiagnosticSeverity::Warning,
                confidence: Confidence::FixtureBacked,
                source: Some(source_name.clone()),
                message: format!("{source_name} did not expose a readable Mac resource fork."),
                data: summary([("bytes", json!(buffer.len()))]),
            });
            continue;
        }
        add_resource_type_entities(schema, source_name, &resources);
        add_resource_entities(schema, source_name, &resources);
        add_malformed_resource_diagnostics(schema, source_name, &resources);
    }
}

#[derive(Debug)]
pub(crate) struct ResourceEntry {
    pub(crate) resource_type: String,
    pub(crate) id: i16,
    pub(crate) name: String,
    pub(crate) attributes: u8,
    pub(crate) ref_offset: usize,
    pub(crate) name_offset: Option<usize>,
    pub(crate) data_relative_offset: usize,
    pub(crate) offset: usize,
    pub(crate) length: usize,
    pub(crate) data: Vec<u8>,
}

fn add_resource_type_entities(
    schema: &mut SemanticSchema,
    source_name: &str,
    resources: &[ResourceEntry],
) {
    let mut by_type: BTreeMap<String, ResourceTypeSummary> = BTreeMap::new();
    for resource in resources {
        let entry = by_type
            .entry(resource.resource_type.clone())
            .or_insert_with(|| ResourceTypeSummary {
                resource_type: resource.resource_type.clone(),
                count: 0,
                total_bytes: 0,
                min_id: resource.id,
                max_id: resource.id,
                named: 0,
                ids: Vec::new(),
                names: Vec::new(),
            });
        entry.count += 1;
        entry.total_bytes += resource.length;
        entry.min_id = entry.min_id.min(resource.id);
        entry.max_id = entry.max_id.max(resource.id);
        if !resource.name.is_empty() {
            entry.named += 1;
            if entry.names.len() < 8 {
                entry
                    .names
                    .push(json!({"id": resource.id, "name": resource.name}));
            }
        }
        if entry.ids.len() < 24 {
            entry.ids.push(resource.id);
        }
    }

    for entry in by_type.values() {
        let printable_type = printable_token(&entry.resource_type);
        let id = resource_type_id(&entry.resource_type);
        schema.entities.push(SemanticEntity {
            id: id.clone(),
            entity_type: "resource type".to_string(),
            label: format!("{printable_type} resources"),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::FixtureBacked,
            source: source_name.to_string(),
            record_ref: None,
            byte_range: None,
            editable: false,
            summary: summary([
                ("type", json!(entry.resource_type)),
                ("count", json!(entry.count)),
                ("totalBytes", json!(entry.total_bytes)),
                ("minId", json!(entry.min_id)),
                ("maxId", json!(entry.max_id)),
                ("named", json!(entry.named)),
                ("ids", json!(entry.ids)),
                ("names", json!(entry.names)),
            ]),
        });
    }
}

fn add_resource_entities(
    schema: &mut SemanticSchema,
    source_name: &str,
    resources: &[ResourceEntry],
) {
    let mut seen = BTreeSet::new();
    for resource in resources {
        let base_id = resource_entity_id(&resource.resource_type, resource.id);
        let entity_id = if seen.insert(base_id.clone()) {
            base_id
        } else {
            format!("{}:{}", base_id, seen.len())
        };
        let mut resource_summary = summary([
            ("type", json!(resource.resource_type)),
            ("resourceId", json!(resource.id)),
            ("name", json!(resource.name)),
            ("attributes", json!(resource.attributes)),
            ("bytes", json!(resource.length)),
            ("refOffset", json!(resource.ref_offset)),
            ("nameOffset", json!(resource.name_offset)),
            ("dataRelativeOffset", json!(resource.data_relative_offset)),
            ("offset", json!(resource.offset)),
            ("preview", json!(hex_preview(&resource.data, 20))),
        ]);
        resource_summary.extend(resource_payload_summary(resource));
        resource_summary.insert("sha256".to_string(), json!(sha256_hex(&resource.data)));
        let record_id = format!("record:{entity_id}");
        schema.records.push(SemanticRecord {
            id: record_id.clone(),
            source: source_id(source_name),
            record_type: "resource".to_string(),
            label: resource_label(resource),
            edit_state: SemanticEditState::InspectOnly,
            byte_range: Some(byte_range(resource.offset, resource.length)),
            confidence: Confidence::FixtureBacked,
            summary: resource_summary.clone(),
        });
        schema.entities.push(SemanticEntity {
            id: entity_id.clone(),
            entity_type: "resource".to_string(),
            label: resource_label(resource),
            edit_state: SemanticEditState::InspectOnly,
            confidence: Confidence::FixtureBacked,
            source: source_name.to_string(),
            record_ref: Some(record_id),
            byte_range: Some(byte_range(resource.offset, resource.length)),
            editable: false,
            summary: resource_summary,
        });
        push_link(
            schema,
            &entity_id,
            &resource_type_id(&resource.resource_type),
            "member_of_resource_type",
            Confidence::FixtureBacked,
            vec![source_id(source_name)],
            BTreeMap::new(),
        );
    }
    add_resource_relationships(schema, resources);
}

fn add_resource_relationships(schema: &mut SemanticSchema, resources: &[ResourceEntry]) {
    let known: BTreeSet<String> = resources
        .iter()
        .map(|resource| resource_entity_id(&resource.resource_type, resource.id))
        .collect();
    for resource in resources {
        let from = resource_entity_id(&resource.resource_type, resource.id);
        if resource.resource_type == "TEXT" {
            let style = resource_entity_id("styl", resource.id);
            if known.contains(&style) {
                push_link(
                    schema,
                    &from,
                    &style,
                    "styled_by",
                    Confidence::Inferred,
                    vec!["anchor:resource-fork-taxonomy".to_string()],
                    summary([("resourceId", json!(resource.id))]),
                );
                push_link(
                    schema,
                    &style,
                    &from,
                    "styles_text",
                    Confidence::Inferred,
                    vec!["anchor:resource-fork-taxonomy".to_string()],
                    summary([("resourceId", json!(resource.id))]),
                );
            }
        }
    }
}

fn add_malformed_resource_diagnostics(
    schema: &mut SemanticSchema,
    source_name: &str,
    resources: &[ResourceEntry],
) {
    for resource in resources {
        if resource.resource_type.chars().any(|ch| ch == '\0') {
            schema.diagnostics.push(SemanticDiagnostic {
                id: format!(
                    "diagnostic:malformed-resource-type:{}:{}",
                    source_name.replace([' ', '.'], "-"),
                    resource.id
                ),
                diagnostic_type: "malformed-resource-entry".to_string(),
                severity: DiagnosticSeverity::Warning,
                confidence: Confidence::FixtureBacked,
                source: Some(source_name.to_string()),
                message: format!(
                    "{} contains a malformed or legacy resource type entry for id {}.",
                    source_name, resource.id
                ),
                data: summary([
                    (
                        "resourceType",
                        json!(printable_token(&resource.resource_type)),
                    ),
                    ("resourceId", json!(resource.id)),
                    (
                        "target",
                        json!(resource_entity_id(&resource.resource_type, resource.id)),
                    ),
                ]),
            });
        }
    }
}

#[derive(Debug)]
struct ResourceTypeSummary {
    resource_type: String,
    count: usize,
    total_bytes: usize,
    min_id: i16,
    max_id: i16,
    named: usize,
    ids: Vec<i16>,
    names: Vec<serde_json::Value>,
}

fn resource_label(resource: &ResourceEntry) -> String {
    let printable_type = printable_token(&resource.resource_type);
    if resource.name.is_empty() {
        format!("{printable_type} {}", resource.id)
    } else {
        format!("{printable_type} {}: {}", resource.id, resource.name)
    }
}

pub(crate) fn resource_type_id(resource_type: &str) -> String {
    format!("resource-type:{}", printable_token(resource_type))
}

pub(crate) fn resource_entity_id(resource_type: &str, id: i16) -> String {
    format!("resource:{}:{}", printable_token(resource_type), id)
}

pub(crate) fn parse_resource_fork(buffer: &[u8]) -> Vec<ResourceEntry> {
    let buffer = extract_resource_fork(buffer);
    if buffer.len() < 32 {
        return Vec::new();
    }
    let Some(data_offset) = u32_safe(buffer, 0) else {
        return Vec::new();
    };
    let Some(map_offset) = u32_safe(buffer, 4) else {
        return Vec::new();
    };
    if map_offset + 28 > buffer.len() {
        return Vec::new();
    }
    let Some(type_list_relative_offset) = u16_safe(buffer, map_offset + 24) else {
        return Vec::new();
    };
    let Some(name_list_relative_offset) = u16_safe(buffer, map_offset + 26) else {
        return Vec::new();
    };
    let type_list_offset = map_offset + type_list_relative_offset;
    let name_list_offset = map_offset + name_list_relative_offset;
    if type_list_offset + 2 > buffer.len() {
        return Vec::new();
    }
    let Some(raw_type_count) = u16_safe(buffer, type_list_offset) else {
        return Vec::new();
    };
    let mut resources = Vec::new();
    for type_index in 0..=raw_type_count {
        let type_offset = type_list_offset + 2 + type_index * 8;
        if type_offset + 8 > buffer.len() {
            continue;
        }
        let resource_type =
            String::from_utf8_lossy(&buffer[type_offset..type_offset + 4]).to_string();
        let Some(raw_resource_count) = u16_safe(buffer, type_offset + 4) else {
            continue;
        };
        let Some(ref_list_relative_offset) = u16_safe(buffer, type_offset + 6) else {
            continue;
        };
        let ref_list_offset = type_list_offset + ref_list_relative_offset;
        for ref_index in 0..=raw_resource_count {
            let ref_offset = ref_list_offset + ref_index * 12;
            if ref_offset + 12 > buffer.len() {
                continue;
            }
            let id = i16_be(buffer, ref_offset);
            let name_relative_offset = i16_be(buffer, ref_offset + 2);
            let name = if name_relative_offset >= 0 {
                let name_offset = name_list_offset + name_relative_offset as usize;
                if name_offset < buffer.len() {
                    let length = buffer[name_offset] as usize;
                    let end = (name_offset + 1 + length).min(buffer.len());
                    decode_classic_text(&buffer[name_offset + 1..end])
                } else {
                    String::new()
                }
            } else {
                String::new()
            };
            let data_relative_offset = ((buffer[ref_offset + 5] as usize) << 16)
                | ((buffer[ref_offset + 6] as usize) << 8)
                | buffer[ref_offset + 7] as usize;
            let length_offset = data_offset + data_relative_offset;
            let Some(length) = u32_safe(buffer, length_offset) else {
                continue;
            };
            if length_offset + 4 + length > buffer.len() {
                continue;
            }
            let offset = length_offset + 4;
            resources.push(ResourceEntry {
                resource_type: resource_type.clone(),
                id,
                name,
                attributes: buffer[ref_offset + 4],
                ref_offset,
                name_offset: (name_relative_offset >= 0)
                    .then_some(name_list_offset + name_relative_offset.max(0) as usize),
                data_relative_offset,
                offset,
                length,
                data: buffer[offset..offset + length].to_vec(),
            });
        }
    }
    resources
}

fn extract_resource_fork(buffer: &[u8]) -> &[u8] {
    if buffer.len() < 26 {
        return buffer;
    }
    let Some(magic) = u32_safe(buffer, 0) else {
        return buffer;
    };
    if magic != APPLE_SINGLE_MAGIC && magic != APPLE_DOUBLE_MAGIC {
        return buffer;
    }
    let Some(entry_count) = u16_safe(buffer, 24) else {
        return buffer;
    };
    for index in 0..entry_count {
        let entry_offset = 26 + index * 12;
        let Some(entry_id) = u32_safe(buffer, entry_offset) else {
            continue;
        };
        let Some(offset) = u32_safe(buffer, entry_offset + 4) else {
            continue;
        };
        let Some(length) = u32_safe(buffer, entry_offset + 8) else {
            continue;
        };
        if entry_id == RESOURCE_FORK_ENTRY_ID && offset + length <= buffer.len() {
            return &buffer[offset..offset + length];
        }
    }
    buffer
}

pub(super) fn parse_string_list_resource(buffer: &[u8]) -> Vec<String> {
    if buffer.len() < 2 {
        return Vec::new();
    }
    let Some(count) = u16_safe(buffer, 0) else {
        return Vec::new();
    };
    let mut offset = 2;
    let mut strings = Vec::new();
    for _ in 0..count {
        if offset >= buffer.len() {
            break;
        }
        let length = buffer[offset] as usize;
        offset += 1;
        if offset + length > buffer.len() {
            break;
        }
        strings.push(decode_classic_text(&buffer[offset..offset + length]));
        offset += length;
    }
    strings
}

fn resource_payload_summary(resource: &ResourceEntry) -> BTreeMap<String, serde_json::Value> {
    match resource.resource_type.as_str() {
        "STR#" => {
            let strings = parse_string_list_resource(&resource.data);
            summary([
                ("family", json!("string-list")),
                ("stringCount", json!(strings.len())),
                ("strings", json!(strings)),
            ])
        }
        "TEXT" => {
            let text = decode_classic_text(&resource.data);
            let text_offset_body = decode_classic_text_offset_body(&resource.data);
            let text_offset_length = text_offset_body.chars().count();
            summary([
                ("family", json!("text")),
                ("text", json!(text)),
                (
                    "textPreview",
                    json!(decode_classic_text(&resource.data[..resource.data.len().min(240)])),
                ),
                ("textOffsetBody", json!(text_offset_body)),
                ("textOffsetLength", json!(text_offset_length)),
                ("textBytes", json!(resource.length)),
            ])
        }
        "styl" => {
            let run_count = u16_safe(&resource.data, 0).unwrap_or(0);
            let style_runs = classic_style_run_summary(&resource.data);
            summary([
                ("family", json!("text-style")),
                ("styleRunCountCandidate", json!(run_count)),
                ("styleBytes", json!(resource.length)),
                ("styleHexPreview", json!(hex_preview(&resource.data, 48))),
                ("styleResourceBase64", json!(STANDARD.encode(&resource.data))),
                ("styleRunTableStatus", json!(style_runs.status)),
                ("styleRunStride", json!(style_runs.stride)),
                ("styleRuns", json!(style_runs.runs)),
                (
                    "note",
                    json!("Classic styled-text metadata; exact consumers remain inferred."),
                ),
            ])
        }
        "snd " => summary([
            ("family", json!("sound")),
            ("formatCandidate", json!(i16_be(&resource.data, 0))),
            ("commandCountCandidate", json!(i16_be(&resource.data, 4))),
            (
                "note",
                json!("Sound resource payload is inventoried; audio decoding is deferred."),
            ),
        ]),
        "RLMZ" => {
            let shorts: Vec<i16> = (0..resource.data.len().min(24) / 2)
                .map(|index| i16_be(&resource.data, index * 2))
                .collect();
            summary([
                ("family", json!("realmz-metadata")),
                ("shortPreview", json!(shorts)),
                (
                    "nonzeroBytes",
                    json!(resource.data.iter().filter(|value| **value != 0).count()),
                ),
                (
                    "note",
                    json!("Realmz-specific scenario/menu metadata; field taxonomy remains unknown."),
                ),
            ])
        }
        "vers" => summary([
            ("family", json!("version")),
            ("majorMinor", json!(resource.data.first().copied())),
            ("stageAndRevision", json!(resource.data.get(1).copied())),
            ("region", json!(i16_be(&resource.data, 2))),
            (
                "versionText",
                json!(decode_classic_text(&resource.data[6.min(resource.data.len())..])),
            ),
        ]),
        "PICT" => {
            let frame = (resource.data.len() >= 10).then(|| {
                json!({
                    "top": i16_be(&resource.data, 2),
                    "left": i16_be(&resource.data, 4),
                    "bottom": i16_be(&resource.data, 6),
                    "right": i16_be(&resource.data, 8),
                })
            });
            summary([
                ("family", json!("picture")),
                ("pictSizeWord", json!(i16_be(&resource.data, 0))),
                ("frame", json!(frame)),
            ])
        }
        "cicn" => summary([
            ("family", json!("color-icon")),
            ("iconBytes", json!(resource.length)),
            (
                "note",
                json!("Color icon resource; exact bitmap decode is handled by the render asset pipeline."),
            ),
        ]),
        _ => summary([
            ("family", json!("unknown-resource-family")),
            (
                "nonzeroBytes",
                json!(resource.data.iter().filter(|value| **value != 0).count()),
            ),
        ]),
    }
}

fn decode_classic_text_offset_body(bytes: &[u8]) -> String {
    let nul = bytes
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(bytes.len());
    bytes[..nul]
        .iter()
        .map(|byte| match *byte {
            9 => '\t',
            10 | 13 => '\n',
            32..=255 => *byte as char,
            _ => ' ',
        })
        .collect()
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

#[derive(serde::Serialize)]
struct ClassicStyleRunSummary {
    status: &'static str,
    stride: Option<usize>,
    runs: Vec<ClassicStyleRun>,
}

#[derive(serde::Serialize)]
struct ClassicStyleRun {
    index: usize,
    start_char: i32,
    height: i16,
    ascent: i16,
    font: i16,
    face: u8,
    size: i16,
    red: u16,
    green: u16,
    blue: u16,
}

fn classic_style_run_summary(bytes: &[u8]) -> ClassicStyleRunSummary {
    let Some(run_count) = u16_safe(bytes, 0) else {
        return ClassicStyleRunSummary {
            status: "raw-preserved",
            stride: None,
            runs: Vec::new(),
        };
    };
    let expected_length = 2 + run_count * 20;
    if bytes.len() != expected_length {
        return ClassicStyleRunSummary {
            status: "raw-preserved",
            stride: None,
            runs: Vec::new(),
        };
    }
    let runs = (0..run_count.min(16))
        .map(|index| {
            let offset = 2 + index * 20;
            ClassicStyleRun {
                index,
                start_char: i32_be(bytes, offset),
                height: i16_be(bytes, offset + 4),
                ascent: i16_be(bytes, offset + 6),
                font: i16_be(bytes, offset + 8),
                face: bytes.get(offset + 10).copied().unwrap_or(0),
                size: i16_be(bytes, offset + 12),
                red: u16_value(bytes, offset + 14),
                green: u16_value(bytes, offset + 16),
                blue: u16_value(bytes, offset + 18),
            }
        })
        .collect();
    ClassicStyleRunSummary {
        status: "classic-style-run-table",
        stride: Some(20),
        runs,
    }
}

fn i32_be(buffer: &[u8], offset: usize) -> i32 {
    if offset + 4 > buffer.len() {
        return 0;
    }
    i32::from_be_bytes([
        buffer[offset],
        buffer[offset + 1],
        buffer[offset + 2],
        buffer[offset + 3],
    ])
}

fn u16_value(buffer: &[u8], offset: usize) -> u16 {
    if offset + 2 > buffer.len() {
        return 0;
    }
    u16::from_be_bytes([buffer[offset], buffer[offset + 1]])
}
