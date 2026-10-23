use super::*;
use crate::{codecs::*, model::*};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

fn snapshot(bytes: &[u8]) -> ProjectSnapshot {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("native-player-map-facts".into()));
    snapshot.classic_sources.push(ClassicSourceBlob {
        native_path: "Data MD2".into(),
        blob: BlobId(format!("sha256:{:x}", Sha256::digest(bytes))),
        byte_length: bytes.len() as u64,
    });
    snapshot.world.player_maps = decode_player_maps(bytes).records;
    snapshot
}

fn raw_source() -> Vec<u8> {
    let mut bytes = vec![0; 22 * PLAYER_MAP_RECORD_BYTES];
    for (id, row) in bytes.chunks_exact_mut(PLAYER_MAP_RECORD_BYTES).enumerate() {
        for slot in 0..42 {
            let value = (id * 100 + slot) as i16 * if slot % 2 == 0 { 1 } else { -1 };
            row[slot * 2..slot * 2 + 2].copy_from_slice(&value.to_be_bytes());
        }
        for (index, byte) in row[84..].iter_mut().enumerate() {
            *byte = (index as u8).wrapping_add(id as u8);
        }
    }
    let start = 20 * PLAYER_MAP_RECORD_BYTES;
    for (offset, value) in [(68, i16::MIN), (70, -301), (74, -12345)] {
        bytes[start + offset..start + offset + 2].copy_from_slice(&value.to_be_bytes());
    }
    bytes[start + 84] = 255;
    bytes[start + 85] = 0;
    bytes[start + 339] = 0x80;
    bytes.extend_from_slice(&[0xde, 0xad, 0x80]);
    bytes
}

#[test]
fn every_complete_md2_row_retains_all_signed_words_and_raw_note_bytes() {
    let bytes = raw_source();
    let start = 20 * PLAYER_MAP_RECORD_BYTES;
    let snapshot = snapshot(&bytes);
    let facts = project_rebuilt_v7_classic_records(
        &snapshot,
        &BTreeMap::from([("Data MD2".into(), bytes.clone())]),
    )
    .unwrap();
    assert_eq!(
        facts
            .player_maps
            .iter()
            .map(|row| row.id)
            .collect::<Vec<_>>(),
        (0..22).collect::<Vec<_>>()
    );
    assert!(
        facts
            .player_maps
            .iter()
            .all(|row| row.words.len() == 42 && row.note_bytes.len() == 256)
    );
    assert_eq!(facts.player_maps[20].words[34], i16::MIN);
    assert_eq!(facts.player_maps[20].words[35], -301);
    assert_eq!(facts.player_maps[20].words[37], -12345);
    assert_eq!(facts.player_maps[20].words[36], 2036);
    assert_eq!(
        facts.player_maps[20].note_bytes,
        bytes[start + 84..start + 340]
    );
    assert_eq!(facts.sources[0].layouts[0].record_bytes, 340);
    assert_eq!(facts.sources[0].layouts[0].complete_records, 22);
    assert_eq!(facts.sources[0].layouts[0].trailing_bytes, 3);
    assert_eq!(
        facts.sources[0].sha256,
        format!("{:x}", Sha256::digest(&bytes))
    );
    assert_eq!(facts.sources[0].effective_sha256, facts.sources[0].sha256);
    let value = serde_json::to_value(&facts).unwrap();
    assert_eq!(value["playerMaps"][20]["words"][34], i16::MIN);
    assert_eq!(value["playerMaps"][20]["noteBytes"][255], 128);
    assert_eq!(
        serde_json::from_value::<RebuiltV7ClassicRecords>(value).unwrap(),
        facts
    );
}

#[test]
fn effective_player_map_edits_declare_exact_preimages_without_replacing_source() {
    let mut original = vec![0; 2 * PLAYER_MAP_RECORD_BYTES];
    for start in [0, 340] {
        original[start + 68..start + 70].copy_from_slice(&16_i16.to_be_bytes());
    }
    original[340 + 74..340 + 76].copy_from_slice(&(-12345_i16).to_be_bytes());
    original[340 + 84..680].fill(0xa5);
    original[340 + 84..340 + 89].copy_from_slice(&[4, b'C', b'a', b'f', 0x8e]);
    original.extend_from_slice(&[0xde, 0xad, 0x80]);
    let mut snapshot = snapshot(&original);
    snapshot.world.player_maps[1].authored = true;
    snapshot.world.player_maps[1].start_x = -37;
    snapshot.world.player_maps[1].note = "Caf\u{e9}\n".into();
    let facts = project_rebuilt_v7_effective_records(
        &snapshot,
        &BTreeMap::from([("Data MD2".into(), original.clone())]),
    )
    .unwrap();
    let mut expected = original.clone();
    expected[400..402].copy_from_slice(&(-37_i16).to_be_bytes());
    expected[424..680].fill(0);
    expected[424..430].copy_from_slice(&[5, b'C', b'a', b'f', 0x8e, 13]);
    assert_eq!(facts.player_maps[1].words[30], -37);
    assert_eq!(facts.player_maps[1].words[37], -12345);
    assert_eq!(facts.player_maps[1].note_bytes, expected[424..680]);
    let source = &facts.sources[0];
    assert_eq!(source.sha256, format!("{:x}", Sha256::digest(&original)));
    assert_eq!(
        source.effective_sha256,
        format!("{:x}", Sha256::digest(&expected))
    );
    assert_eq!(source.edits.len(), 1);
    let edit = &source.edits[0];
    assert_eq!(edit.offset, 400);
    assert_eq!(edit.before, original[400..680]);
    let mut reconstructed = original.clone();
    reconstructed.splice(
        edit.offset..edit.offset + edit.before.len(),
        edit.after.iter().copied(),
    );
    assert_eq!(reconstructed, expected);
    assert_eq!(source.layouts[0].complete_records, 2);
    assert_eq!(source.layouts[0].trailing_bytes, 3);
}

#[test]
fn absent_player_map_source_has_no_invented_native_rows() {
    let snapshot = ProjectSnapshot::new_authored(StableId("no-md2".into()));
    assert!(
        project_rebuilt_v7_classic_records(&snapshot, &BTreeMap::new())
            .unwrap()
            .player_maps
            .is_empty()
    );
}

#[test]
fn player_maps_require_every_complete_source_row_even_outside_runtime_addresses() {
    let bytes = raw_source();
    let mut snapshot = snapshot(&bytes);
    let sources = BTreeMap::from([("Data MD2".into(), bytes)]);
    project_rebuilt_v7_effective_records(&snapshot, &sources).unwrap();
    snapshot.world.player_maps.pop();
    assert!(
        project_rebuilt_v7_effective_records(&snapshot, &sources)
            .unwrap_err()
            .contains("Data MD2 supplied native row 21")
    );
    snapshot.classic_sources.clear();
    assert!(
        project_rebuilt_v7_effective_records(&snapshot, &BTreeMap::new())
            .unwrap_err()
            .contains("no native source bytes for v7 publication")
    );
}
