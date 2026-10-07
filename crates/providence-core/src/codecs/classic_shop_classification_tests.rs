use super::*;

fn row(items: &[(usize, i16)]) -> Vec<u8> {
    let mut bytes = vec![0; SHOP_RECORD_BYTES];
    for &(slot, id) in items {
        write_i16(&mut bytes, slot * 2, id);
    }
    bytes
}

#[test]
fn sparse_invalid_categories_are_quarantined_without_a_twenty_shop_cap() {
    let mut bytes = Vec::new();
    for _ in 0..21 {
        bytes.extend(row(&[(600, 647), (800, 911)]));
    }
    bytes.extend(row(&[
        (200, 29557),
        (600, 26215),
        (601, 27759),
        (602, 30078),
    ]));
    bytes.extend(row(&[]));
    let decoded = decode_shops(&bytes);
    assert_eq!(decoded.records.len(), 21);
    assert_eq!(
        decoded.records.last().unwrap().native_id,
        NativeRecordId(20)
    );
    assert_eq!(
        decoded
            .quarantined_records
            .iter()
            .map(|row| row.native_id.0)
            .collect::<Vec<_>>(),
        [21, 22]
    );
    assert_eq!(encode_shops(&decoded.records, Some(&bytes)).unwrap(), bytes);
}

#[test]
fn later_coherent_extension_keeps_native_offset_and_unrelated_bytes() {
    let mut bytes = row(&[(0, 7)]);
    bytes.extend(row(&[(0, 2000), (1, 2001)]));
    bytes.extend(row(&[]));
    bytes.extend(row(&[(800, 900)]));
    bytes.extend([0xde, 0xad]);
    let mut decoded = decode_shops(&bytes);
    assert_eq!(
        decoded
            .records
            .iter()
            .map(|row| row.native_id.0)
            .collect::<Vec<_>>(),
        [0, 3]
    );
    assert_eq!(decoded.trailing_bytes, [0xde, 0xad]);
    assert_eq!(encode_shops(&decoded.records, Some(&bytes)).unwrap(), bytes);
    decoded.records[1].inflation = 125;
    decoded.records[1].authored = true;
    let output = encode_shops(&decoded.records, Some(&bytes)).unwrap();
    let changed = bytes
        .iter()
        .zip(&output)
        .enumerate()
        .filter_map(|(i, (a, b))| (a != b).then_some(i))
        .collect::<Vec<_>>();
    assert_eq!(changed, [3 * SHOP_RECORD_BYTES + 3001]);
}

#[test]
fn isolated_defects_missing_in_range_items_and_unused_words_do_not_remove_shops() {
    let mut bytes = row(&[(0, 1200)]);
    bytes.extend(row(&[(0, 999)]));
    bytes.extend(row(&[(0, 7), (1, -1), (2, 30000), (3, 30001)]));
    bytes.extend(row(&[(0, 7), (200, 1200), (201, 1201)]));
    write_i16(&mut bytes, 3000, i16::MAX);
    let decoded = decode_shops(&bytes);
    assert_eq!(decoded.records.len(), 4);
    assert!(decoded.quarantined_records.is_empty());
}

#[test]
fn empty_and_unreferenced_coherent_tables_are_kept() {
    let mut bytes = row(&[]);
    for _ in 0..27 {
        bytes.extend(row(&[(0, 1)]));
    }
    let decoded = decode_shops(&bytes);
    assert_eq!(decoded.records.len(), 28);
    assert!(decoded.quarantined_records.is_empty());
    assert_eq!(decode_shops(&bytes), decoded);
}
