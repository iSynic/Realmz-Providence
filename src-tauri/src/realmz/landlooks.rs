use crate::error::Result;
use crate::generated::native_manifest_policy::REALMZ_NATIVE_LAYOUT;
use crate::project::{
    CustomLandlookMetadata, LandlookRangeSlot, LandlookWriterGate, MapstatsRecord,
    TileAttributeConfidence, TileAttributeFlag, TileAttributeProfile, TileAttributeSourceKind,
    TileEditableScope,
};

use super::record_bytes::{i16_be, write_i16_be};

pub const MAPSTATS_RECORD_BYTES: usize = REALMZ_NATIVE_LAYOUT.mapstats_record_bytes;
pub const MAPSTATS_RECORDS: usize = REALMZ_NATIVE_LAYOUT.mapstats_records;
pub const LANDLOOK_RANGE_HEADER_BYTES: usize = REALMZ_NATIVE_LAYOUT.landlook_range_header_bytes;
pub const LANDLOOK_RANGE_TAIL_BYTES: usize = REALMZ_NATIVE_LAYOUT.landlook_range_tail_bytes;
pub const LANDLOOK_RANGE_SLOT_BYTES: usize = REALMZ_NATIVE_LAYOUT.landlook_range_slot_bytes;
pub const LANDLOOK_RANGE_SLOTS: usize = REALMZ_NATIVE_LAYOUT.landlook_range_slots;

mod tile_solids;
pub(super) use tile_solids::parse_tile_attributes;
pub use tile_solids::{write_tile_solids, TILE_SOLIDS_BYTES};

pub fn parse_landlook_mapstats_data(
    buffer: &[u8],
    landlook: i8,
    source: &str,
) -> Vec<TileAttributeProfile> {
    let count = (buffer.len() / MAPSTATS_RECORD_BYTES).min(MAPSTATS_RECORDS);
    let base_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
    let base_tile = if buffer.len() >= base_offset + 2 {
        Some(i16_be(buffer, base_offset))
    } else {
        None
    };
    let base_scale = if buffer.len() >= base_offset + LANDLOOK_RANGE_HEADER_BYTES {
        Some(i16_be(buffer, base_offset + 2))
    } else {
        None
    };
    let editable_scope = if source.to_ascii_lowercase().contains("custom") {
        TileEditableScope::ScenarioCustom
    } else {
        TileEditableScope::BuiltInReference
    };
    (0..count)
        .map(|tile| {
            let start = tile * MAPSTATS_RECORD_BYTES;
            let sound = i16_be(buffer, start);
            let time = i16_be(buffer, start + 2);
            let solid = i16_be(buffer, start + 4);
            let shore = i16_be(buffer, start + 6) != 0;
            let need_boat = i16_be(buffer, start + 8);
            let is_path = i16_be(buffer, start + 10) != 0;
            let los = i16_be(buffer, start + 12) != 0;
            let fly_float = i16_be(buffer, start + 14) != 0;
            let forest = i16_be(buffer, start + 16);
            let spare = i16_be(buffer, start + 18);
            let combat_build = vec![
                vec![
                    i16_be(buffer, start + 20),
                    i16_be(buffer, start + 22),
                    i16_be(buffer, start + 24),
                ],
                vec![
                    i16_be(buffer, start + 26),
                    i16_be(buffer, start + 28),
                    i16_be(buffer, start + 30),
                ],
                vec![
                    i16_be(buffer, start + 32),
                    i16_be(buffer, start + 34),
                    i16_be(buffer, start + 36),
                ],
            ];
            let clear_land_id = i16_be(buffer, start + 38);
            let mut flags = Vec::new();
            if solid == 0 && need_boat == 0 && !fly_float {
                flags.push(TileAttributeFlag::Walkable);
            } else {
                flags.push(TileAttributeFlag::Solid);
            }
            if shore {
                flags.push(TileAttributeFlag::Shore);
            }
            if need_boat != 0 {
                flags.push(TileAttributeFlag::BoatRequired);
            }
            if is_path {
                flags.push(TileAttributeFlag::Path);
            }
            if los {
                flags.push(TileAttributeFlag::BlocksLos);
            }
            if fly_float {
                flags.push(TileAttributeFlag::FlyFloatRequired);
            }
            if forest != 0 {
                flags.push(TileAttributeFlag::Forest);
            }
            if combat_build.iter().flatten().any(|value| *value != 0) {
                flags.push(TileAttributeFlag::CombatBuild);
            }
            TileAttributeProfile {
                tile: tile as i16,
                landlook: Some(landlook),
                solid_type: Some(solid),
                movement_sound_id: Some(sound),
                movement_cost: Some(time),
                shore: Some(shore),
                boat_requirement: Some(need_boat),
                path_flag: Some(is_path),
                blocks_los: Some(los),
                fly_float_required: Some(fly_float),
                forest_type: Some(forest),
                spare: Some(spare),
                combat_build,
                clear_land_id: Some(clear_land_id),
                base_tile,
                base_scale,
                editable_scope: editable_scope.clone(),
                flags,
                confidence: TileAttributeConfidence::SourceBacked,
                source_kind: TileAttributeSourceKind::Mapstats,
                source: source.to_string(),
                raw_byte: None,
            }
        })
        .collect()
}

pub fn parse_custom_landlook_metadata(
    buffer: &[u8],
    landlook: i8,
    source_file: &str,
) -> CustomLandlookMetadata {
    let records = (0..MAPSTATS_RECORDS)
        .map(|tile| {
            if buffer.len() >= (tile + 1) * MAPSTATS_RECORD_BYTES {
                parse_mapstats_record(buffer, tile)
            } else {
                empty_mapstats_record(tile)
            }
        })
        .collect();
    let base_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
    let base_tile = if buffer.len() >= base_offset + 2 {
        i16_be(buffer, base_offset)
    } else {
        0
    };
    let base_scale = if buffer.len() >= base_offset + LANDLOOK_RANGE_HEADER_BYTES {
        i16_be(buffer, base_offset + 2)
    } else {
        0
    };
    let mut range_slots = parse_landlook_range_tail(buffer);
    for slot in range_slots.len()..LANDLOOK_RANGE_SLOTS {
        range_slots.push(LandlookRangeSlot {
            slot,
            label: landlook_range_label(slot).to_string(),
            first_tile: 0,
            last_tile: 0,
            reserved: None,
        });
    }
    CustomLandlookMetadata {
        landlook,
        source_file: source_file.to_string(),
        records,
        base_tile,
        base_scale,
        range_slots,
        writer_gate: custom_landlook_writer_gate(),
        authored: false,
    }
}

fn parse_mapstats_record(buffer: &[u8], tile: usize) -> MapstatsRecord {
    let start = tile * MAPSTATS_RECORD_BYTES;
    MapstatsRecord {
        tile: tile as i16,
        sound: i16_be(buffer, start),
        time: i16_be(buffer, start + 2),
        solid: i16_be(buffer, start + 4),
        shore: i16_be(buffer, start + 6),
        need_boat: i16_be(buffer, start + 8),
        is_path: i16_be(buffer, start + 10),
        los: i16_be(buffer, start + 12),
        fly_float: i16_be(buffer, start + 14),
        forest: i16_be(buffer, start + 16),
        spare: Some(i16_be(buffer, start + 18)),
        combat_build: vec![
            vec![
                i16_be(buffer, start + 20),
                i16_be(buffer, start + 22),
                i16_be(buffer, start + 24),
            ],
            vec![
                i16_be(buffer, start + 26),
                i16_be(buffer, start + 28),
                i16_be(buffer, start + 30),
            ],
            vec![
                i16_be(buffer, start + 32),
                i16_be(buffer, start + 34),
                i16_be(buffer, start + 36),
            ],
        ],
        clear_land_id: i16_be(buffer, start + 38),
    }
}

fn empty_mapstats_record(tile: usize) -> MapstatsRecord {
    MapstatsRecord {
        tile: tile as i16,
        sound: 0,
        time: 0,
        solid: 0,
        shore: 0,
        need_boat: 0,
        is_path: 0,
        los: 0,
        fly_float: 0,
        forest: 0,
        spare: None,
        combat_build: vec![vec![0; 3], vec![0; 3], vec![0; 3]],
        clear_land_id: 0,
    }
}

fn custom_landlook_writer_gate() -> LandlookWriterGate {
    LandlookWriterGate {
        metadata_writer_status: "writer-safe-fixture-gated".to_string(),
        atlas_writer_status: "writable-by-generated-pict-replacement".to_string(),
        writable_fields: vec![
            "sound",
            "time",
            "solid",
            "shore",
            "needBoat",
            "isPath",
            "los",
            "flyFloat",
            "forest",
            "clearLandId",
            "combatBuild",
            "baseTile",
            "baseScale",
            "rangeSlot.firstTile",
            "rangeSlot.lastTile",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        preserve_only_fields: vec!["spare", "rangeSlot.reserved"]
            .into_iter()
            .map(String::from)
            .collect(),
        evidence: vec![
            "docs/format-evidence-cards/custom-landlook-writers.md".to_string(),
            "docs/generated/custom-landlook-coverage.json".to_string(),
        ],
    }
}

pub const CUSTOM_LANDLOOK_METADATA_BYTES: usize =
    REALMZ_NATIVE_LAYOUT.custom_landlook_metadata_bytes;

pub fn write_custom_landlook_metadata(metadata: &CustomLandlookMetadata) -> Result<Vec<u8>> {
    let mut output = vec![0u8; CUSTOM_LANDLOOK_METADATA_BYTES];
    for (tile, record) in metadata.records.iter().take(MAPSTATS_RECORDS).enumerate() {
        write_mapstats_record(&mut output, tile, record);
    }
    let base_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
    write_i16_be(&mut output, base_offset, metadata.base_tile);
    write_i16_be(&mut output, base_offset + 2, metadata.base_scale);
    for slot in metadata.range_slots.iter().take(LANDLOOK_RANGE_SLOTS) {
        if slot.slot >= LANDLOOK_RANGE_SLOTS {
            continue;
        }
        let start = base_offset + LANDLOOK_RANGE_HEADER_BYTES
            + slot.slot * LANDLOOK_RANGE_SLOT_BYTES;
        write_i16_be(&mut output, start, slot.first_tile);
        write_i16_be(&mut output, start + 2, slot.last_tile);
    }
    Ok(output)
}

fn write_mapstats_record(output: &mut [u8], tile: usize, record: &MapstatsRecord) {
    let start = tile * MAPSTATS_RECORD_BYTES;
    write_i16_be(output, start, record.sound);
    write_i16_be(output, start + 2, record.time);
    write_i16_be(output, start + 4, record.solid);
    write_i16_be(output, start + 6, record.shore);
    write_i16_be(output, start + 8, record.need_boat);
    write_i16_be(output, start + 10, record.is_path);
    write_i16_be(output, start + 12, record.los);
    write_i16_be(output, start + 14, record.fly_float);
    write_i16_be(output, start + 16, record.forest);
    // The spare word is imported compatibility state. Fresh compilation owns the
    // surrounding semantic fields and leaves this word neutral; the exporter may
    // restore it from the compatibility annex for an edited legacy scenario.
    write_i16_be(output, start + 18, 0);
    for row in 0..3 {
        for col in 0..3 {
            let value = record
                .combat_build
                .get(row)
                .and_then(|values| values.get(col))
                .copied()
                .unwrap_or(0);
            write_i16_be(output, start + 20 + (row * 3 + col) * 2, value);
        }
    }
    write_i16_be(output, start + 38, record.clear_land_id);
}

pub fn update_custom_land_tile_attributes(
    metadata: &CustomLandlookMetadata,
    tile: usize,
    patch: CustomLandTileAttributePatch,
) -> CustomLandlookMetadata {
    let mut next = metadata.clone();
    if let Some(record) = next.records.get_mut(tile) {
        if let Some(value) = patch.sound {
            record.sound = value;
        }
        if let Some(value) = patch.time {
            record.time = value;
        }
        if let Some(value) = patch.solid {
            record.solid = value;
        }
        if let Some(value) = patch.shore {
            record.shore = value;
        }
        if let Some(value) = patch.need_boat {
            record.need_boat = value;
        }
        if let Some(value) = patch.is_path {
            record.is_path = value;
        }
        if let Some(value) = patch.los {
            record.los = value;
        }
        if let Some(value) = patch.fly_float {
            record.fly_float = value;
        }
        if let Some(value) = patch.forest {
            record.forest = value;
        }
        if let Some(value) = patch.clear_land_id {
            record.clear_land_id = value;
        }
        next.authored = true;
    }
    next
}

#[derive(Debug, Clone, Default)]
pub struct CustomLandTileAttributePatch {
    pub sound: Option<i16>,
    pub time: Option<i16>,
    pub solid: Option<i16>,
    pub shore: Option<i16>,
    pub need_boat: Option<i16>,
    pub is_path: Option<i16>,
    pub los: Option<i16>,
    pub fly_float: Option<i16>,
    pub forest: Option<i16>,
    pub clear_land_id: Option<i16>,
}

pub fn update_custom_land_tile_combat_build(
    metadata: &CustomLandlookMetadata,
    tile: usize,
    row: usize,
    col: usize,
    value: i16,
) -> CustomLandlookMetadata {
    let mut next = metadata.clone();
    if row < 3 && col < 3 {
        if let Some(record) = next.records.get_mut(tile) {
            if record.combat_build.len() < 3 {
                record.combat_build.resize_with(3, || vec![0; 3]);
            }
            if record.combat_build[row].len() < 3 {
                record.combat_build[row].resize(3, 0);
            }
            record.combat_build[row][col] = value;
            next.authored = true;
        }
    }
    next
}

pub fn update_custom_landlook_base(
    metadata: &CustomLandlookMetadata,
    base_tile: Option<i16>,
    base_scale: Option<i16>,
) -> CustomLandlookMetadata {
    let mut next = metadata.clone();
    if let Some(value) = base_tile {
        next.base_tile = value;
    }
    if let Some(value) = base_scale {
        next.base_scale = value;
    }
    next.authored = true;
    next
}

pub fn update_custom_landlook_range_slot(
    metadata: &CustomLandlookMetadata,
    slot: usize,
    first_tile: Option<i16>,
    last_tile: Option<i16>,
) -> CustomLandlookMetadata {
    let mut next = metadata.clone();
    if let Some(range) = next.range_slots.iter_mut().find(|range| range.slot == slot) {
        if let Some(value) = first_tile {
            range.first_tile = value;
        }
        if let Some(value) = last_tile {
            range.last_tile = value;
        }
        next.authored = true;
    }
    next
}

pub fn parse_landlook_range_tail(buffer: &[u8]) -> Vec<LandlookRangeSlot> {
    let tail_offset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + LANDLOOK_RANGE_HEADER_BYTES;
    if buffer.len() < tail_offset + LANDLOOK_RANGE_SLOT_BYTES {
        return Vec::new();
    }
    let slots =
        ((buffer.len() - tail_offset) / LANDLOOK_RANGE_SLOT_BYTES).min(LANDLOOK_RANGE_SLOTS);
    (0..slots)
        .map(|slot| {
            let start = tail_offset + slot * LANDLOOK_RANGE_SLOT_BYTES;
            LandlookRangeSlot {
                slot,
                label: landlook_range_label(slot).to_string(),
                first_tile: i16_be(buffer, start),
                last_tile: i16_be(buffer, start + 2),
                reserved: Some(i16_be(buffer, start + 4)),
            }
        })
        .collect()
}

fn landlook_range_label(slot: usize) -> &'static str {
    match slot {
        0 => "Mountain range",
        1 => "Open range",
        2 => "Rubble range",
        3 => "House range",
        _ => "Reserved range",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mapstats_parse_source_backed_tile_attributes() {
        let mut input = vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 64];
        let tile_start = MAPSTATS_RECORD_BYTES;
        write_i16_be(&mut input, tile_start, 9);
        write_i16_be(&mut input, tile_start + 2, 4);
        write_i16_be(&mut input, tile_start + 4, 2);
        write_i16_be(&mut input, tile_start + 6, 1);
        write_i16_be(&mut input, tile_start + 8, 2);
        write_i16_be(&mut input, tile_start + 10, 1);
        write_i16_be(&mut input, tile_start + 12, 1);
        write_i16_be(&mut input, tile_start + 14, 1);
        write_i16_be(&mut input, tile_start + 16, 3);
        write_i16_be(&mut input, tile_start + 18, 77);
        write_i16_be(&mut input, tile_start + 20, 101);
        write_i16_be(&mut input, tile_start + 22, 102);
        write_i16_be(&mut input, tile_start + 24, 103);
        write_i16_be(&mut input, tile_start + 26, 104);
        write_i16_be(&mut input, tile_start + 28, 105);
        write_i16_be(&mut input, tile_start + 30, 106);
        write_i16_be(&mut input, tile_start + 32, 107);
        write_i16_be(&mut input, tile_start + 34, 108);
        write_i16_be(&mut input, tile_start + 36, 109);
        write_i16_be(&mut input, tile_start + 38, 12);
        write_i16_be(&mut input, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS, 1);
        write_i16_be(&mut input, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 2, 4);
        let profiles = parse_landlook_mapstats_data(&input, 0, "Data P BD");
        assert_eq!(profiles.len(), MAPSTATS_RECORDS);
        let tile = &profiles[1];
        assert_eq!(tile.landlook, Some(0));
        assert_eq!(tile.movement_sound_id, Some(9));
        assert_eq!(tile.movement_cost, Some(4));
        assert_eq!(tile.solid_type, Some(2));
        assert_eq!(tile.shore, Some(true));
        assert_eq!(tile.boat_requirement, Some(2));
        assert_eq!(tile.path_flag, Some(true));
        assert_eq!(tile.blocks_los, Some(true));
        assert_eq!(tile.fly_float_required, Some(true));
        assert_eq!(tile.forest_type, Some(3));
        assert_eq!(tile.spare, Some(77));
        assert_eq!(tile.combat_build[0], vec![101, 102, 103]);
        assert_eq!(tile.combat_build[2], vec![107, 108, 109]);
        assert_eq!(tile.clear_land_id, Some(12));
        assert_eq!(tile.base_tile, Some(1));
        assert_eq!(tile.base_scale, Some(4));
        assert_eq!(tile.editable_scope, TileEditableScope::BuiltInReference);
        assert!(tile.flags.contains(&TileAttributeFlag::Solid));
        assert!(tile.flags.contains(&TileAttributeFlag::Shore));
        assert!(tile.flags.contains(&TileAttributeFlag::BoatRequired));
        assert!(tile.flags.contains(&TileAttributeFlag::Path));
        assert!(tile.flags.contains(&TileAttributeFlag::BlocksLos));
        assert!(tile.flags.contains(&TileAttributeFlag::FlyFloatRequired));
        assert!(tile.flags.contains(&TileAttributeFlag::Forest));
        assert!(tile.flags.contains(&TileAttributeFlag::CombatBuild));
        assert!(matches!(
            tile.source_kind,
            TileAttributeSourceKind::Mapstats
        ));
    }

    #[test]
    fn mapstats_tail_parses_divinity_tile_ranges() {
        let mut input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let tail_start = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
        for (slot, first, last) in [(0, 62, 85), (1, 155, 158), (2, 159, 167), (3, 190, 200)] {
            let offset = tail_start + slot * LANDLOOK_RANGE_SLOT_BYTES;
            write_i16_be(&mut input, offset, first);
            write_i16_be(&mut input, offset + 2, last);
            write_i16_be(&mut input, offset + 4, 0);
        }

        let ranges = parse_landlook_range_tail(&input);

        assert_eq!(ranges.len(), LANDLOOK_RANGE_SLOTS);
        assert_eq!(ranges[0].label, "Mountain range");
        assert_eq!(
            (
                ranges[0].first_tile,
                ranges[0].last_tile,
                ranges[0].reserved
            ),
            (62, 85, Some(0))
        );
        assert_eq!(ranges[1].label, "Open range");
        assert_eq!(
            (
                ranges[1].first_tile,
                ranges[1].last_tile,
                ranges[1].reserved
            ),
            (155, 158, Some(0))
        );
        assert_eq!(ranges[2].label, "Rubble range");
        assert_eq!(
            (
                ranges[2].first_tile,
                ranges[2].last_tile,
                ranges[2].reserved
            ),
            (159, 167, Some(0))
        );
        assert_eq!(ranges[3].label, "House range");
        assert_eq!(
            (
                ranges[3].first_tile,
                ranges[3].last_tile,
                ranges[3].reserved
            ),
            (190, 200, Some(0))
        );
        assert!(ranges[4..]
            .iter()
            .all(|slot| slot.first_tile == 0 && slot.last_tile == 0 && slot.reserved == Some(0)));
    }

    #[test]
    fn custom_landlook_metadata_no_edit_reencodes_byte_identical() {
        let mut input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let tile_start = 12 * MAPSTATS_RECORD_BYTES;
        for (offset, value) in [
            (0, 88),
            (2, 6),
            (4, 2),
            (6, 1),
            (8, 4),
            (10, 1),
            (12, 1),
            (14, 0),
            (16, 3),
            (18, 0),
            (20, 155),
            (22, 156),
            (24, 157),
            (26, 158),
            (28, 159),
            (30, 160),
            (32, 161),
            (34, 162),
            (36, 163),
            (38, 155),
        ] {
            write_i16_be(&mut input, tile_start + offset, value);
        }
        write_i16_be(&mut input, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS, 156);
        write_i16_be(&mut input, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 2, 1);
        let tail_start = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
        write_i16_be(&mut input, tail_start, 62);
        write_i16_be(&mut input, tail_start + 2, 85);

        let metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        assert_eq!(metadata.records.len(), MAPSTATS_RECORDS);
        assert_eq!(metadata.base_tile, 156);
        assert_eq!(metadata.base_scale, 1);
        assert_eq!(metadata.range_slots[0].first_tile, 62);

        let output = write_custom_landlook_metadata(&metadata).unwrap();
        assert_eq!(input, output);
    }

    #[test]
    fn custom_landlook_attribute_update_mutates_only_owned_word() {
        let input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        let updated = update_custom_land_tile_attributes(
            &metadata,
            5,
            CustomLandTileAttributePatch {
                sound: Some(321),
                ..CustomLandTileAttributePatch::default()
            },
        );
        assert!(updated.authored);

        let output = write_custom_landlook_metadata(&updated).unwrap();
        let changed: Vec<_> = input
            .iter()
            .zip(output.iter())
            .enumerate()
            .filter_map(|(index, (before, after))| (before != after).then_some(index))
            .collect();
        assert_eq!(
            changed,
            vec![5 * MAPSTATS_RECORD_BYTES, 5 * MAPSTATS_RECORD_BYTES + 1]
        );
        assert_eq!(i16_be(&output, 5 * MAPSTATS_RECORD_BYTES), 321);
    }

    #[test]
    fn custom_landlook_behavior_update_writes_all_editable_behavior_words() {
        let input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        let tile = 9usize;
        let updated = update_custom_land_tile_attributes(
            &metadata,
            tile,
            CustomLandTileAttributePatch {
                sound: Some(7),
                time: Some(2),
                solid: Some(1),
                shore: Some(1),
                need_boat: Some(3),
                is_path: Some(1),
                los: Some(1),
                fly_float: Some(1),
                forest: Some(2),
                clear_land_id: Some(155),
            },
        );

        let output = write_custom_landlook_metadata(&updated).unwrap();
        let start = tile * MAPSTATS_RECORD_BYTES;
        for (offset, value) in [
            (0, 7),
            (2, 2),
            (4, 1),
            (6, 1),
            (8, 3),
            (10, 1),
            (12, 1),
            (14, 1),
            (16, 2),
            (38, 155),
        ] {
            assert_eq!(i16_be(&output, start + offset), value);
        }
        let changed: Vec<_> = input
            .iter()
            .zip(output.iter())
            .enumerate()
            .filter_map(|(index, (before, after))| (before != after).then_some(index))
            .collect();
        assert!(changed.iter().all(|offset| {
            let relative = offset.saturating_sub(start);
            *offset >= start
                && *offset < start + MAPSTATS_RECORD_BYTES
                && relative != 18
                && !(20..38).contains(&relative)
        }));
        assert!(!changed.is_empty());
    }

    #[test]
    fn custom_landlook_combat_update_mutates_only_selected_build_cell() {
        let input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        let updated = update_custom_land_tile_combat_build(&metadata, 10, 2, 1, 177);
        let output = write_custom_landlook_metadata(&updated).unwrap();
        let offset = 10 * MAPSTATS_RECORD_BYTES + 34;
        let changed: Vec<_> = input
            .iter()
            .zip(output.iter())
            .enumerate()
            .filter_map(|(index, (before, after))| (before != after).then_some(index))
            .collect();
        assert!(changed
            .iter()
            .all(|changed_offset| *changed_offset == offset || *changed_offset == offset + 1));
        assert!(!changed.is_empty());
        assert_eq!(i16_be(&output, offset), 177);
    }

    #[test]
    fn custom_landlook_range_writer_leaves_reserved_word_neutral() {
        let mut input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let tail_start = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
        write_i16_be(&mut input, tail_start, 62);
        write_i16_be(&mut input, tail_start + 2, 85);
        write_i16_be(&mut input, tail_start + 4, 1234);
        let metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        let updated = update_custom_landlook_range_slot(&metadata, 0, Some(70), Some(80));
        let output = write_custom_landlook_metadata(&updated).unwrap();

        assert_eq!(i16_be(&output, tail_start), 70);
        assert_eq!(i16_be(&output, tail_start + 2), 80);
        assert_eq!(i16_be(&output, tail_start + 4), 0);
    }

    #[test]
    fn custom_landlook_writer_keeps_preserve_only_words_neutral() {
        let input =
            vec![0u8; MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES];
        let mut metadata = parse_custom_landlook_metadata(&input, 6, "Data Custom 1 BD");
        metadata.records[5].sound = 321;
        metadata.records[5].spare = Some(0x1234);
        metadata.range_slots[0].first_tile = 62;
        metadata.range_slots[0].last_tile = 85;
        metadata.range_slots[0].reserved = Some(0x2345);
        let output = write_custom_landlook_metadata(&metadata).unwrap();

        assert_eq!(output.len(), CUSTOM_LANDLOOK_METADATA_BYTES);
        assert_eq!(i16_be(&output, 5 * MAPSTATS_RECORD_BYTES), 321);
        assert_eq!(i16_be(&output, 5 * MAPSTATS_RECORD_BYTES + 18), 0);
        let range_start = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
        assert_eq!(i16_be(&output, range_start), 62);
        assert_eq!(i16_be(&output, range_start + 2), 85);
        assert_eq!(i16_be(&output, range_start + 4), 0);
    }
}
