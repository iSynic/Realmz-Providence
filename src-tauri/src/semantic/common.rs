use crate::project::*;
use crate::realmz::{
    BATTLE_BYTES, CASTE_BYTES, COMPLEX_ENCOUNTER_BYTES, DOOR_BYTES, DOOR_LEVEL_BYTES,
    EXTRACODE_BYTES, FIELD_BYTES, GLOBAL_MACRO_HOOK_BYTES, ITEM_BYTES, LAND_LAYOUT_BYTES,
    MAP_RECORD_BYTES, MESSAGE_BYTES, MONSTER_BYTES, MONSTER_DESCRIPTION_BYTES, OPTION_LABEL_BYTES,
    RACE_BYTES, RANDLEVEL_BYTES, SCENARIO_CONTACT_INFO_BYTES, SCENARIO_RESTRICTIONS_BYTES,
    SCENARIO_SHELL_BYTES, SHOP_BYTES, SIMPLE_ENCOUNTER_BYTES, SPELL_BYTES, THIEF_ENCOUNTER_BYTES,
    TILE_SOLIDS_BYTES, TIMED_ENCOUNTER_BYTES, TREASURE_BYTES,
};
use serde_json::Value;
use std::collections::BTreeMap;

pub(super) const SIMPLE_STRUCT_BYTES: usize = 106;
pub(super) const COMPLEX_STRUCT_BYTES: usize = 160;

pub(super) fn source_anchors() -> Vec<SemanticEvidence> {
    vec![
        SemanticEvidence {
            id: "anchor:scenario-format-index".to_string(),
            confidence: Confidence::SourceBacked,
            source: "docs/scenario-format/format-index.md".to_string(),
            note: "Record sizes, meanings, confidence, and high-linkage priorities.".to_string(),
        },
        SemanticEvidence {
            id: "anchor:semantic-schema".to_string(),
            confidence: Confidence::FixtureBacked,
            source: "docs/scenario-format/semantic-schema.md".to_string(),
            note: "Source/record/entity/link/evidence/diagnostic model.".to_string(),
        },
        SemanticEvidence {
            id: "anchor:fixtures".to_string(),
            confidence: Confidence::FixtureBacked,
            source: "docs/scenario-format/fixtures.md".to_string(),
            note: "Fixture expectations for dungeon rendering, custom resources, map names, and links.".to_string(),
        },
        SemanticEvidence {
            id: "anchor:runtime-consumer-matrix".to_string(),
            confidence: Confidence::SourceBacked,
            source: "docs/scenario-format/runtime-consumer-matrix.md".to_string(),
            note: "Authored source files, generated runtime caches, semantic outputs, and remaining gaps.".to_string(),
        },
        SemanticEvidence {
            id: "anchor:opcode-runtime-reference".to_string(),
            confidence: Confidence::SourceBacked,
            source: "docs/scenario-format/opcode-runtime-reference.md".to_string(),
            note: "Opcode categories, EDCD coverage policy, and source-backed high-linkage action shapes.".to_string(),
        },
        SemanticEvidence {
            id: "anchor:ed3-reachability".to_string(),
            confidence: Confidence::SourceBacked,
            source: "docs/scenario-format/ed3-reachability.md".to_string(),
            note: "Data ED3 rows are promoted to callable macros only when source-backed roots can reach them.".to_string(),
        },
        SemanticEvidence {
            id: "anchor:dispatcher-noops".to_string(),
            confidence: Confidence::SourceBacked,
            source: "docs/scenario-format/generated/dispatcher-noop-action-cases.md".to_string(),
            note: "Active nonzero action words without newland.c dispatcher cases are recorded as no-op diagnostics.".to_string(),
        },
        SemanticEvidence {
            id: "anchor:confidence-debt".to_string(),
            confidence: Confidence::SourceBacked,
            source: "docs/scenario-format/generated/confidence-debt-cases.md".to_string(),
            note: "Low-confidence or runtime-only format evidence remains grouped as debt rather than promoted to editable semantics.".to_string(),
        },
        SemanticEvidence {
            id: "anchor:resource-fork-taxonomy".to_string(),
            confidence: Confidence::FixtureBacked,
            source: "docs/scenario-format/resource-fork-taxonomy.md".to_string(),
            note: "Scenario resource fork parsing, individual resource records, and fallback provenance.".to_string(),
        },
        SemanticEvidence {
            id: "anchor:supporting-records".to_string(),
            confidence: Confidence::SourceBacked,
            source: "docs/scenario-format/containers/supporting-records.md".to_string(),
            note: "Treasure, thief, timed encounter, contact, menu, and solidity container layouts and runtime consumers.".to_string(),
        },
    ]
}

pub(super) fn layout_for(name: &str) -> Option<SemanticLayout> {
    let (kind, record_bytes) = match name {
        "Data LD" => ("land field grid", FIELD_BYTES),
        "Data DL" => ("dungeon field grid", FIELD_BYTES),
        "Data DD" => ("land trigger/action table", DOOR_LEVEL_BYTES),
        "Data DDD" => ("dungeon trigger/action table", DOOR_LEVEL_BYTES),
        "Data RD" => ("land random metadata", RANDLEVEL_BYTES),
        "Data RDD" => ("dungeon random metadata", RANDLEVEL_BYTES),
        "Data ED" => ("simple encounters", SIMPLE_ENCOUNTER_BYTES),
        "Data ED2" => ("complex encounters", COMPLEX_ENCOUNTER_BYTES),
        "Data ED3" => ("macro/action records", DOOR_BYTES),
        "Data EDCD" => ("extra-code rows", EXTRACODE_BYTES),
        "Data MD" => ("monsters", MONSTER_BYTES),
        "Data MD1" => ("alternate monster set", MONSTER_BYTES),
        "Data MD-1" => ("alternate monster set", MONSTER_BYTES),
        "Data DES" => ("monster descriptions", MONSTER_DESCRIPTION_BYTES),
        "Data BD" => ("battles", BATTLE_BYTES),
        "Data SD" => ("shops", SHOP_BYTES),
        "Data SD2" => ("messages", MESSAGE_BYTES),
        "Data OD" => ("option labels", OPTION_LABEL_BYTES),
        "Data MD2" => ("map records", MAP_RECORD_BYTES),
        "Data TD" => ("treasure", TREASURE_BYTES),
        "Data TD2" => ("thief encounters", THIEF_ENCOUNTER_BYTES),
        "Data TD3" => ("timed encounters", TIMED_ENCOUNTER_BYTES),
        "Data Spell" => ("spell overrides", SPELL_BYTES),
        "Data Race" => ("race overrides", RACE_BYTES),
        "Data Caste" => ("caste overrides", CASTE_BYTES),
        "Data CI" => ("scenario contact", SCENARIO_CONTACT_INFO_BYTES),
        "Data RI" => ("scenario restrictions", SCENARIO_RESTRICTIONS_BYTES),
        "Data CS" => ("scenario security backup", SCENARIO_SHELL_BYTES),
        "Global" => ("global macro hooks", GLOBAL_MACRO_HOOK_BYTES),
        "Data MENU" => ("monster menu cache", 502),
        "Data Solids" => ("solid tile table", TILE_SOLIDS_BYTES),
        "Data NI" => ("scenario item table", ITEM_BYTES),
        "Layout" => ("outdoor land layout", LAND_LAYOUT_BYTES),
        _ => return None,
    };
    Some(SemanticLayout {
        kind: kind.to_string(),
        record_bytes,
    })
}

pub(super) fn push_link(
    schema: &mut SemanticSchema,
    from: &str,
    to: &str,
    kind: &str,
    confidence: Confidence,
    evidence: Vec<String>,
    metadata: BTreeMap<String, Value>,
) {
    schema.links.push(SemanticLink {
        id: format!("link:{}", schema.links.len()),
        from: from.to_string(),
        to: to.to_string(),
        kind: kind.to_string(),
        confidence,
        evidence,
        metadata,
    });
}

pub(super) fn add_reverse_links_and_summary(schema: &mut SemanticSchema) {
    let mut reverse: BTreeMap<String, SemanticReverseLinks> = BTreeMap::new();
    for link in &schema.links {
        reverse
            .entry(link.from.clone())
            .or_default()
            .outgoing
            .push(link.id.clone());
        reverse
            .entry(link.to.clone())
            .or_default()
            .incoming
            .push(link.id.clone());
    }
    schema.reverse_links = reverse;
    schema.summary = SemanticSummary {
        source_count: schema.sources.len(),
        record_count: schema.records.len(),
        entity_count: schema.entities.len(),
        link_count: schema.links.len(),
        diagnostic_count: schema.diagnostics.len(),
    };
}

pub(super) fn source_id(name: &str) -> String {
    format!("source:file:{name}")
}

pub(super) fn runtime_cache_source_id(name: &str) -> String {
    format!("source:runtime-cache:{name}")
}

pub(super) fn shared_source_id(name: &str) -> String {
    format!("source:shared:{name}")
}

pub(super) fn map_entity_id(level_type: LevelType, index: usize) -> String {
    format!("map:{}:{}", level_type.as_str(), index)
}

pub(super) fn byte_range(start: usize, length: usize) -> ByteRange {
    ByteRange {
        start,
        length,
        end_exclusive: start + length,
    }
}

pub(super) fn summary<const N: usize>(entries: [(&str, Value); N]) -> BTreeMap<String, Value> {
    entries
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect()
}

pub(super) fn full_record_count(buffer: Option<&Vec<u8>>, record_bytes: usize) -> usize {
    buffer
        .map(|buffer| buffer.len() / record_bytes)
        .unwrap_or(0)
}

pub(super) fn encounter_count(
    buffer: Option<&Vec<u8>>,
    block_bytes: usize,
    struct_bytes: usize,
) -> usize {
    let Some(buffer) = buffer else {
        return 0;
    };
    let full = buffer.len() / block_bytes;
    let trailing = buffer.len() % block_bytes;
    full + usize::from(trailing >= struct_bytes)
}

pub(super) fn is_resource_file(name: &str) -> bool {
    name == "Scenario"
        || name.ends_with(".rsrc")
        || name.ends_with(".rsf")
        || name.starts_with("._")
}

pub(super) fn decode_pascal_text(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    let length = (bytes[0] as usize).min(bytes.len().saturating_sub(1));
    decode_classic_text(&bytes[1..1 + length])
}

pub(super) fn decode_classic_text(bytes: &[u8]) -> String {
    let nul = bytes
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(bytes.len());
    let mut out = String::new();
    let mut last_space = false;
    for byte in &bytes[..nul] {
        let ch = match *byte {
            0..=31 => ' ',
            32..=126 => *byte as char,
            127..=255 => *byte as char,
        };
        if ch.is_whitespace() {
            if !last_space {
                out.push(' ');
            }
            last_space = true;
        } else {
            out.push(ch);
            last_space = false;
        }
    }
    out.trim().to_string()
}

pub(super) fn printable_token(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_graphic() || ch == ' ' {
                ch
            } else {
                '?'
            }
        })
        .collect()
}

pub(super) fn hex_preview(buffer: &[u8], limit: usize) -> String {
    buffer
        .iter()
        .take(limit)
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(" ")
}

pub(super) fn title(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

pub(super) fn i16_be(buffer: &[u8], offset: usize) -> i16 {
    if offset + 2 > buffer.len() {
        return 0;
    }
    i16::from_be_bytes([buffer[offset], buffer[offset + 1]])
}

pub(super) fn u16_safe(buffer: &[u8], offset: usize) -> Option<usize> {
    if offset + 2 > buffer.len() {
        None
    } else {
        Some(u16::from_be_bytes([buffer[offset], buffer[offset + 1]]) as usize)
    }
}

pub(super) fn u32_safe(buffer: &[u8], offset: usize) -> Option<usize> {
    if offset + 4 > buffer.len() {
        None
    } else {
        Some(u32::from_be_bytes([
            buffer[offset],
            buffer[offset + 1],
            buffer[offset + 2],
            buffer[offset + 3],
        ]) as usize)
    }
}
