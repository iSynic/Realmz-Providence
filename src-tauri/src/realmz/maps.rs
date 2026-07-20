use crate::error::{ProvidenceError, Result};
use crate::project::{
    Confidence, LevelType, MapEntity, MapMarker, MapRecord, MapRecordRect, MapRender, Provenance,
    RandomLevel, RenderMode, MAP_SIZE,
};
use std::collections::BTreeMap;

use super::record_bytes::{
    decode_pascal_text, encode_pascal_text, i16_be, provenance, write_i16_be,
};

mod land_layout;
pub use land_layout::{
    parse_land_layout, write_land_layout, LAND_LAYOUT_BYTES, LAND_LAYOUT_COLS, LAND_LAYOUT_ROWS,
};

pub const FIELD_BYTES: usize = MAP_SIZE * MAP_SIZE * 2;
pub const MAP_RECORD_BYTES: usize = 340;
pub const MAP_RECORD_MARKERS: usize = 10;
pub const MAP_RECORD_MARKER_BYTES: usize = 6;

pub fn parse_fields(buffer: &[u8], level_type: LevelType, source: &str) -> Vec<MapEntity> {
    let count = buffer.len() / FIELD_BYTES;
    (0..count)
        .map(|level_index| {
            let start = level_index * FIELD_BYTES;
            let mut tiles = Vec::with_capacity(MAP_SIZE * MAP_SIZE);
            for index in 0..MAP_SIZE * MAP_SIZE {
                tiles.push(i16_be(buffer, start + index * 2));
            }
            MapEntity {
                id: format!("{}:{}", level_type.as_str(), level_index),
                level_type,
                source: source.to_string(),
                index: level_index,
                name: format!("{} level {}", title(level_type.as_str()), level_index),
                width: MAP_SIZE,
                height: MAP_SIZE,
                tiles,
                render: MapRender {
                    tileset_id: "abstract-fallback".to_string(),
                    landlook: None,
                    mode: RenderMode::AbstractFallback,
                },
                provenance: Provenance {
                    source_file: source.to_string(),
                    record_index: level_index,
                    byte_offset: start,
                    byte_length: FIELD_BYTES,
                    confidence: Confidence::Confirmed,
                },
            }
        })
        .collect()
}

pub fn write_fields(maps: &[MapEntity], level_type: LevelType) -> Result<Vec<u8>> {
    let mut selected: Vec<&MapEntity> = maps
        .iter()
        .filter(|map| map.level_type == level_type)
        .collect();
    selected.sort_by_key(|map| map.index);
    ensure_dense_indices(&selected, level_type.as_str())?;

    let mut output = vec![0u8; selected.len() * FIELD_BYTES];
    for map in selected {
        if map.width != MAP_SIZE || map.height != MAP_SIZE || map.tiles.len() != MAP_SIZE * MAP_SIZE
        {
            return Err(ProvidenceError::message(format!(
                "{} must be a 90 x 90 map with 8100 tiles",
                map.id
            )));
        }
        let start = map.index * FIELD_BYTES;
        for (index, value) in map.tiles.iter().enumerate() {
            write_i16_be(&mut output, start + index * 2, *value);
        }
    }
    Ok(output)
}

pub fn parse_map_records(buffer: &[u8]) -> Vec<MapRecord> {
    let count = buffer.len() / MAP_RECORD_BYTES;
    (0..count)
        .map(|id| {
            let start = id * MAP_RECORD_BYTES;
            let record = &buffer[start..start + MAP_RECORD_BYTES];
            MapRecord {
                id,
                markers: parse_map_record_markers(record),
                start_x: i16_be(record, 60),
                start_y: i16_be(record, 62),
                level: i16_be(record, 64),
                pict_id: i16_be(record, 66),
                icon_size: i16_be(record, 68),
                show: i16_be(record, 70),
                is_dungeon: i16_be(record, 72) != 0,
                rect: MapRecordRect {
                    top: i16_be(record, 76),
                    left: i16_be(record, 78),
                    bottom: i16_be(record, 80),
                    right: i16_be(record, 82),
                },
                note: decode_pascal_text(&record[84..MAP_RECORD_BYTES]),
                authored: false,
                name: None,
                primary_name: None,
                secondary_name: None,
                name_source: None,
                map_name_authored: false,
                provenance: provenance("Data MD2", id, start, MAP_RECORD_BYTES),
            }
        })
        .collect()
}

pub fn write_map_records(records: &[MapRecord]) -> Result<Vec<u8>> {
    if records.is_empty() {
        return Ok(Vec::new());
    }
    let max_id = records.iter().map(|record| record.id).max().unwrap_or(0);
    let mut output = vec![0u8; (max_id + 1) * MAP_RECORD_BYTES];
    for record in records {
        let start = record.id * MAP_RECORD_BYTES;
        for (slot, marker) in normalized_map_record_markers(record).iter().enumerate() {
            let offset = start + slot * MAP_RECORD_MARKER_BYTES;
            write_i16_be(&mut output, offset, marker.icon_id);
            write_i16_be(&mut output, offset + 2, marker.x);
            write_i16_be(&mut output, offset + 4, marker.y);
        }
        write_i16_be(&mut output, start + 60, record.start_x);
        write_i16_be(&mut output, start + 62, record.start_y);
        write_i16_be(&mut output, start + 64, record.level);
        write_i16_be(&mut output, start + 66, record.pict_id);
        write_i16_be(&mut output, start + 68, record.icon_size);
        write_i16_be(&mut output, start + 70, record.show);
        write_i16_be(
            &mut output,
            start + 72,
            if record.is_dungeon { 1 } else { 0 },
        );
        write_i16_be(&mut output, start + 76, record.rect.top);
        write_i16_be(&mut output, start + 78, record.rect.left);
        write_i16_be(&mut output, start + 80, record.rect.bottom);
        write_i16_be(&mut output, start + 82, record.rect.right);
        encode_pascal_text(
            &mut output[start + 84..start + MAP_RECORD_BYTES],
            &record.note,
        )?;
    }
    Ok(output)
}

fn parse_map_record_markers(record: &[u8]) -> Vec<MapMarker> {
    (0..MAP_RECORD_MARKERS)
        .map(|slot| {
            let offset = slot * MAP_RECORD_MARKER_BYTES;
            MapMarker {
                icon_id: i16_be(record, offset),
                x: i16_be(record, offset + 2),
                y: i16_be(record, offset + 4),
            }
        })
        .collect()
}

fn normalized_map_record_markers(record: &MapRecord) -> Vec<MapMarker> {
    (0..MAP_RECORD_MARKERS)
        .map(|slot| {
            record.markers.get(slot).cloned().unwrap_or(MapMarker {
                icon_id: 0,
                x: 0,
                y: 0,
            })
        })
        .collect()
}

fn ensure_dense_indices(maps: &[&MapEntity], label: &str) -> Result<()> {
    for (expected, map) in maps.iter().enumerate() {
        if map.index != expected {
            return Err(ProvidenceError::message(format!(
                "{} maps must have dense indices; expected {}, found {}",
                label, expected, map.index
            )));
        }
    }
    Ok(())
}

pub(super) fn attach_render_info(maps: &mut [MapEntity], random_levels: &[RandomLevel]) {
    let lookup: BTreeMap<(LevelType, usize), &RandomLevel> = random_levels
        .iter()
        .map(|level| ((level.level_type, level.level_index), level))
        .collect();
    for map in maps {
        if map.level_type == LevelType::Dungeon {
            map.render = MapRender {
                tileset_id: "dungeon-top-down-302".to_string(),
                landlook: lookup
                    .get(&(map.level_type, map.index))
                    .map(|level| level.landlook),
                mode: RenderMode::DungeonTopDown,
            };
        } else if let Some(level) = lookup.get(&(map.level_type, map.index)) {
            map.render = MapRender {
                tileset_id: format!("landlook-{}", level.landlook),
                landlook: Some(level.landlook),
                mode: RenderMode::OutdoorLandlook,
            };
        }
    }
}

fn title(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
        before
            .iter()
            .zip(after.iter())
            .enumerate()
            .filter_map(|(offset, (left, right))| (left != right).then_some(offset))
            .collect()
    }

    #[test]
    fn fields_round_trip() {
        let mut input = vec![0u8; FIELD_BYTES * 2];
        write_i16_be(&mut input, 0, 42);
        write_i16_be(&mut input, FIELD_BYTES + 2, -7);
        let maps = parse_fields(&input, LevelType::Land, "Data LD");
        let output = write_fields(&maps, LevelType::Land).unwrap();
        assert_eq!(input, output);
    }

    #[test]
    fn map_storage_land_tiles_mutate_only_owned_cell() {
        let mut input = vec![0xA5; FIELD_BYTES * 2];
        let level_index = 1;
        let tile_index = MAP_SIZE + 7;
        let tile_offset = level_index * FIELD_BYTES + tile_index * 2;
        write_i16_be(&mut input, tile_offset, 0x0102);

        let mut maps = parse_fields(&input, LevelType::Land, "Data LD");
        maps[level_index].tiles[tile_index] = 0x0304;

        let output = write_fields(&maps, LevelType::Land).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(i16_be(&output, tile_offset), 0x0304);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![tile_offset, tile_offset + 1]
        );
    }

    #[test]
    fn fresh_map_record_compiles_from_semantic_fields() {
        let record = MapRecord {
            id: 0,
            markers: vec![
                MapMarker {
                    icon_id: 400,
                    x: 12,
                    y: 13,
                };
                MAP_RECORD_MARKERS
            ],
            start_x: 4,
            start_y: 5,
            level: 2,
            pict_id: 30128,
            icon_size: 32,
            show: -808,
            is_dungeon: true,
            rect: MapRecordRect {
                top: 1,
                left: 2,
                bottom: 20,
                right: 30,
            },
            note: "Go".to_string(),
            name: None,
            primary_name: None,
            secondary_name: None,
            name_source: None,
            map_name_authored: false,
            authored: true,
            provenance: provenance("Data MD2", 0, 0, MAP_RECORD_BYTES),
        };

        let output = write_map_records(&[record]).unwrap();

        assert_eq!(output.len(), MAP_RECORD_BYTES);
        assert_eq!(i16_be(&output, 0), 400);
        assert_eq!(i16_be(&output, 2), 12);
        assert_eq!(i16_be(&output, 4), 13);
        assert_eq!(i16_be(&output, 60), 4);
        assert_eq!(i16_be(&output, 64), 2);
        assert_eq!(i16_be(&output, 66), 30128);
        assert_eq!(i16_be(&output, 70), -808);
        assert_eq!(i16_be(&output, 72), 1);
        assert_eq!(&output[74..76], &[0, 0]);
        assert_eq!(i16_be(&output, 76), 1);
        assert_eq!(&output[84..87], &[2, b'G', b'o']);
    }

    #[test]
    fn imported_map_record_parses_semantics_without_raw_identity() {
        let mut input = vec![0xA5; MAP_RECORD_BYTES];
        input[84] = 2;
        input[85] = b'G';
        input[86] = b'o';
        let records = parse_map_records(&input);
        let output = write_map_records(&records).unwrap();

        assert_eq!(i16_be(&output, 60), -23131);
        assert_eq!(i16_be(&output, 72), 1);
        assert_eq!(&output[74..76], &[0, 0]);
        assert_eq!(&output[84..87], &[2, b'G', b'o']);
        assert!(output[87..].iter().all(|byte| *byte == 0));
    }
}
