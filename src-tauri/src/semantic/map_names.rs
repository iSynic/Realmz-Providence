use super::common::*;
use super::resources::{parse_resource_fork, parse_string_list_resource, resource_entity_id};
use crate::project::*;
use crate::realmz::ParsedScenario;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};

const PRIMARY_MAP_NAMES_RESOURCE_ID: i16 = -102;
const SECONDARY_MAP_NAMES_RESOURCE_ID: i16 = -101;
const MAP_RECORD_BYTES: usize = 340;

#[derive(Debug, Clone)]
pub(super) struct ResourceMapName {
    pub id: usize,
    pub name: String,
    pub primary_name: String,
    pub secondary_name: String,
    pub source_resources: Vec<String>,
}

#[derive(Debug, Clone)]
struct MapRecordTarget {
    record_index: usize,
    level_type: LevelType,
    level_index: usize,
    start_x: i16,
    start_y: i16,
}

pub fn apply_map_name_hints(parsed: &mut ParsedScenario, buffers: &BTreeMap<String, Vec<u8>>) {
    let names = resource_map_names(buffers);
    if names.is_empty() {
        return;
    }
    for target in map_record_targets(buffers) {
        let Some(name) = names.get(&target.record_index) else {
            continue;
        };
        if name.name.is_empty() {
            continue;
        }
        let Some(map) = parsed
            .maps
            .iter_mut()
            .find(|map| map.level_type == target.level_type && map.index == target.level_index)
        else {
            continue;
        };
        map.name = name.name.clone();
    }
}

pub(super) fn resource_map_names(
    buffers: &BTreeMap<String, Vec<u8>>,
) -> BTreeMap<usize, ResourceMapName> {
    let mut primary = Vec::new();
    let mut secondary = Vec::new();
    let mut sources = BTreeMap::<i16, BTreeSet<String>>::new();
    for (source_name, buffer) in buffers.iter().filter(|(name, _)| is_resource_file(name)) {
        for resource in parse_resource_fork(buffer) {
            if resource.resource_type != "STR#" || resource.name != "Map Names" {
                continue;
            }
            if resource.id == PRIMARY_MAP_NAMES_RESOURCE_ID {
                primary = parse_string_list_resource(&resource.data);
                sources.entry(resource.id).or_default().insert(format!(
                    "{}:{}",
                    source_name,
                    resource_entity_id("STR#", resource.id)
                ));
            } else if resource.id == SECONDARY_MAP_NAMES_RESOURCE_ID {
                secondary = parse_string_list_resource(&resource.data);
                sources.entry(resource.id).or_default().insert(format!(
                    "{}:{}",
                    source_name,
                    resource_entity_id("STR#", resource.id)
                ));
            }
        }
    }
    let count = primary.len().max(secondary.len());
    let mut names = BTreeMap::new();
    for id in 0..count {
        let primary_name = clean_resource_name(primary.get(id).map(String::as_str).unwrap_or(""));
        let secondary_name =
            clean_resource_name(secondary.get(id).map(String::as_str).unwrap_or(""));
        let name = if primary_name.is_empty() {
            secondary_name.clone()
        } else {
            primary_name.clone()
        };
        if name.is_empty() && primary_name.is_empty() && secondary_name.is_empty() {
            continue;
        }
        let mut source_resources = Vec::new();
        for resource_id in [
            PRIMARY_MAP_NAMES_RESOURCE_ID,
            SECONDARY_MAP_NAMES_RESOURCE_ID,
        ] {
            if let Some(entries) = sources.get(&resource_id) {
                source_resources.extend(entries.iter().cloned());
            }
        }
        names.insert(
            id,
            ResourceMapName {
                id,
                name,
                primary_name,
                secondary_name,
                source_resources,
            },
        );
    }
    names
}

pub(super) fn add_map_name_links(schema: &mut SemanticSchema, buffers: &BTreeMap<String, Vec<u8>>) {
    let names = resource_map_names(buffers);
    if names.is_empty() {
        return;
    }
    for target in map_record_targets(buffers) {
        let Some(name) = names.get(&target.record_index) else {
            continue;
        };
        if name.name.is_empty() {
            continue;
        }
        let map_record_id = format!("map-record:{}", target.record_index);
        let map_id = map_entity_id(target.level_type, target.level_index);
        for source_resource in &name.source_resources {
            let Some((source_name, resource_id)) = source_resource.split_once(':') else {
                continue;
            };
            let metadata = summary([
                ("mapNameId", json!(name.id)),
                ("name", json!(name.name)),
                ("primaryName", json!(name.primary_name)),
                ("secondaryName", json!(name.secondary_name)),
                ("startX", json!(target.start_x)),
                ("startY", json!(target.start_y)),
            ]);
            push_link(
                schema,
                resource_id,
                &map_record_id,
                "names_map_record",
                Confidence::FixtureBacked,
                vec![source_id(source_name)],
                metadata.clone(),
            );
            push_link(
                schema,
                resource_id,
                &map_id,
                "names_map_level",
                Confidence::FixtureBacked,
                vec![source_id(source_name)],
                metadata,
            );
        }
    }
}

pub(super) fn map_record_name(
    names: &BTreeMap<usize, ResourceMapName>,
    index: usize,
) -> Option<&ResourceMapName> {
    names.get(&index).filter(|name| !name.name.is_empty())
}

fn map_record_targets(buffers: &BTreeMap<String, Vec<u8>>) -> Vec<MapRecordTarget> {
    let Some(buffer) = buffers.get("Data MD2") else {
        return Vec::new();
    };
    let count = buffer.len() / MAP_RECORD_BYTES;
    let mut targets = Vec::new();
    for record_index in 0..count {
        let start = record_index * MAP_RECORD_BYTES;
        let record = &buffer[start..start + MAP_RECORD_BYTES];
        let level = i16_be(record, 64);
        if !(0..100).contains(&level) {
            continue;
        }
        targets.push(MapRecordTarget {
            record_index,
            level_type: if i16_be(record, 72) != 0 {
                LevelType::Dungeon
            } else {
                LevelType::Land
            },
            level_index: level as usize,
            start_x: i16_be(record, 60),
            start_y: i16_be(record, 62),
        });
    }
    targets
}

fn clean_resource_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.chars().all(|ch| ch == '-') {
        String::new()
    } else {
        trimmed.to_string()
    }
}
