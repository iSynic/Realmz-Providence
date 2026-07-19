use crate::error::{ProvidenceError, Result};
use crate::project::{
    Confidence, LandLayout, LevelType, MapEntity, MapMarker, MapRecord, MapRecordRect, MapRender,
    Provenance, RandomLevel, RenderMode, MAP_SIZE,
};
use std::collections::BTreeMap;

use super::record_bytes::{
    decode_pascal_text, encode_pascal_text, i16_be, provenance, write_i16_be,
};

pub const FIELD_BYTES: usize = MAP_SIZE * MAP_SIZE * 2;
pub const LAND_LAYOUT_ROWS: usize = 8;
pub const LAND_LAYOUT_COLS: usize = 16;
pub const LAND_LAYOUT_BYTES: usize = LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS * 2;
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

pub fn parse_land_layout(buffer: &[u8]) -> Result<LandLayout> {
    if buffer.len() < LAND_LAYOUT_BYTES {
        return Err(ProvidenceError::message(format!(
            "Layout is {} byte(s); expected at least {} bytes",
            buffer.len(),
            LAND_LAYOUT_BYTES
        )));
    }
    let mut cells = Vec::with_capacity(LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS);
    for index in 0..LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS {
        cells.push(i16_be(buffer, index * 2));
    }
    Ok(LandLayout {
        rows: LAND_LAYOUT_ROWS,
        cols: LAND_LAYOUT_COLS,
        cells,
        trailing_bytes: buffer.get(LAND_LAYOUT_BYTES..).unwrap_or(&[]).to_vec(),
        authored: false,
        provenance: Some(provenance("Layout", 0, 0, LAND_LAYOUT_BYTES)),
    })
}

pub fn write_land_layout(layout: &LandLayout) -> Result<Vec<u8>> {
    if layout.rows != LAND_LAYOUT_ROWS || layout.cols != LAND_LAYOUT_COLS {
        return Err(ProvidenceError::message(format!(
            "Layout must be {} rows by {} columns",
            LAND_LAYOUT_ROWS, LAND_LAYOUT_COLS
        )));
    }
    let mut output = vec![0u8; LAND_LAYOUT_BYTES + layout.trailing_bytes.len()];
    for index in 0..LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS {
        let value = layout.cells.get(index).copied().unwrap_or(0);
        write_i16_be(&mut output, index * 2, value);
    }
    if !layout.trailing_bytes.is_empty() {
        output[LAND_LAYOUT_BYTES..].copy_from_slice(&layout.trailing_bytes);
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
                raw_bytes: record.to_vec(),
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
        if !record.raw_bytes.is_empty() && record.raw_bytes.len() != MAP_RECORD_BYTES {
            return Err(ProvidenceError::message(format!(
                "Map record {} has invalid compatibility byte storage",
                record.id
            )));
        }
        if record.raw_bytes.len() == MAP_RECORD_BYTES {
            output[start..start + MAP_RECORD_BYTES].copy_from_slice(&record.raw_bytes);
        }
        let has_compatibility_base = record.raw_bytes.len() == MAP_RECORD_BYTES;
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
        if !has_compatibility_base || (i16_be(&output, start + 72) != 0) != record.is_dungeon {
            write_i16_be(
                &mut output,
                start + 72,
                if record.is_dungeon { 1 } else { 0 },
            );
        }
        write_i16_be(&mut output, start + 76, record.rect.top);
        write_i16_be(&mut output, start + 78, record.rect.left);
        write_i16_be(&mut output, start + 80, record.rect.bottom);
        write_i16_be(&mut output, start + 82, record.rect.right);
        if !has_compatibility_base
            || decode_pascal_text(&output[start + 84..start + MAP_RECORD_BYTES]) != record.note
        {
            encode_pascal_text(
                &mut output[start + 84..start + MAP_RECORD_BYTES],
                &record.note,
            )?;
        }
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
    fn land_layout_round_trip() {
        let mut input = vec![0u8; LAND_LAYOUT_BYTES + 4];
        write_i16_be(&mut input, 0, -1);
        write_i16_be(&mut input, 2, 1);
        write_i16_be(
            &mut input,
            (LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS - 1) * 2,
            19,
        );
        input[LAND_LAYOUT_BYTES..].copy_from_slice(&[9, 8, 7, 6]);
        let layout = parse_land_layout(&input).unwrap();
        assert_eq!(layout.rows, LAND_LAYOUT_ROWS);
        assert_eq!(layout.cols, LAND_LAYOUT_COLS);
        assert_eq!(layout.cells[0], -1);
        assert_eq!(layout.cells[1], 1);
        assert_eq!(layout.cells[LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS - 1], 19);
        assert_eq!(layout.trailing_bytes, vec![9, 8, 7, 6]);
        let output = write_land_layout(&layout).unwrap();
        assert_eq!(input, output);
    }

    #[test]
    fn map_storage_layout_mutates_only_owned_cell_and_preserves_tail() {
        let mut input = vec![0xA5; LAND_LAYOUT_BYTES + 6];
        input[LAND_LAYOUT_BYTES..].copy_from_slice(&[0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]);
        let cell_index = LAND_LAYOUT_COLS + 4;
        let cell_offset = cell_index * 2;
        write_i16_be(&mut input, cell_offset, 0x0102);

        let mut layout = parse_land_layout(&input).unwrap();
        layout.cells[cell_index] = 0x0304;

        let output = write_land_layout(&layout).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(&output[LAND_LAYOUT_BYTES..], &input[LAND_LAYOUT_BYTES..]);
        assert_eq!(i16_be(&output, cell_offset), 0x0304);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![cell_offset, cell_offset + 1]
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
            raw_bytes: Vec::new(),
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
    fn imported_map_record_preserves_compatible_encodings_until_semantics_change() {
        let mut input = vec![0xA5; MAP_RECORD_BYTES];
        input[84] = 2;
        input[85] = b'G';
        input[86] = b'o';
        let mut records = parse_map_records(&input);

        assert_eq!(write_map_records(&records).unwrap(), input);

        records[0].start_x = 0x1234;
        records[0].is_dungeon = false;
        let output = write_map_records(&records).unwrap();
        assert_eq!(i16_be(&output, 60), 0x1234);
        assert_eq!(i16_be(&output, 72), 0);
        assert_eq!(&output[74..76], &[0xA5, 0xA5]);
        assert_eq!(&output[84..87], &[2, b'G', b'o']);
        assert_eq!(output[MAP_RECORD_BYTES - 1], 0xA5);
    }

    #[test]
    fn map_record_storage_mutates_only_modeled_fields_and_preserves_prefix() {
        let mut input = vec![0u8; MAP_RECORD_BYTES * 2];
        let record_start = MAP_RECORD_BYTES;
        for offset in 0..60 {
            input[record_start + offset] = 0xA5;
        }
        input[record_start + 74] = 0xCA;
        input[record_start + 75] = 0xFE;

        let mut records = parse_map_records(&input);
        records[1].start_x = 0x0304;
        records[1].level = -2;
        records[1].is_dungeon = true;
        records[1].rect.bottom = 0x0506;
        records[1].note = "Go".to_string();

        let output = write_map_records(&records).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(
            &output[record_start..record_start + 60],
            &input[record_start..record_start + 60]
        );
        assert_eq!(
            &output[record_start + 74..record_start + 76],
            &input[record_start + 74..record_start + 76]
        );
        assert_eq!(i16_be(&output, record_start + 60), 0x0304);
        assert_eq!(i16_be(&output, record_start + 64), -2);
        assert_eq!(i16_be(&output, record_start + 72), 1);
        assert_eq!(i16_be(&output, record_start + 80), 0x0506);
        assert_eq!(
            &output[record_start + 84..record_start + 87],
            &[2, b'G', b'o']
        );
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                record_start + 60,
                record_start + 61,
                record_start + 64,
                record_start + 65,
                record_start + 73,
                record_start + 80,
                record_start + 81,
                record_start + 84,
                record_start + 85,
                record_start + 86,
            ]
        );
    }

    #[test]
    fn map_record_marker_storage_mutates_only_selected_marker_words() {
        let mut input = vec![0u8; MAP_RECORD_BYTES * 2];
        let record_start = MAP_RECORD_BYTES;
        input[record_start + 74] = 0xCA;
        input[record_start + 75] = 0xFE;

        let marker_slot = 4;
        let marker_start = record_start + marker_slot * MAP_RECORD_MARKER_BYTES;
        let mut records = parse_map_records(&input);
        records[1].markers[marker_slot].icon_id = 0x1234;
        records[1].markers[marker_slot].x = 0x5678;
        records[1].markers[marker_slot].y = -0x1234;

        let output = write_map_records(&records).unwrap();

        assert_eq!(output.len(), input.len());
        assert_eq!(
            &output[record_start + 74..record_start + 76],
            &input[record_start + 74..record_start + 76]
        );
        assert_eq!(i16_be(&output, marker_start), 0x1234);
        assert_eq!(i16_be(&output, marker_start + 2), 0x5678);
        assert_eq!(i16_be(&output, marker_start + 4), -0x1234);
        assert_eq!(
            changed_offsets(&input, &output),
            vec![
                marker_start,
                marker_start + 1,
                marker_start + 2,
                marker_start + 3,
                marker_start + 4,
                marker_start + 5,
            ]
        );
    }
}
