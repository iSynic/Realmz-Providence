use super::*;

pub(super) fn apple_double(resource_fork: &[u8], metadata: &[u8]) -> Vec<u8> {
    let header_length = 26 + 2 * 12;
    let mut output = vec![0u8; header_length];
    output[0..4].copy_from_slice(&APPLE_DOUBLE_MAGIC.to_be_bytes());
    output[4..8].copy_from_slice(&0x0002_0000u32.to_be_bytes());
    output[24..26].copy_from_slice(&2u16.to_be_bytes());
    output[26..30].copy_from_slice(&9u32.to_be_bytes());
    output[30..34].copy_from_slice(&(header_length as u32).to_be_bytes());
    output[34..38].copy_from_slice(&(metadata.len() as u32).to_be_bytes());
    output[38..42].copy_from_slice(&RESOURCE_FORK_ENTRY_ID.to_be_bytes());
    output[42..46].copy_from_slice(&((header_length + metadata.len()) as u32).to_be_bytes());
    output[46..50].copy_from_slice(&(resource_fork.len() as u32).to_be_bytes());
    output.extend_from_slice(metadata);
    output.extend_from_slice(resource_fork);
    output
}

pub(super) fn apple_double_entry(bytes: &[u8], wanted: u32) -> &[u8] {
    let count = read_u16(bytes, 24).unwrap();
    for index in 0..count {
        let descriptor = 26 + index * 12;
        if read_u32(bytes, descriptor).unwrap() as u32 == wanted {
            let offset = read_u32(bytes, descriptor + 4).unwrap();
            let length = read_u32(bytes, descriptor + 8).unwrap();
            return &bytes[offset..offset + length];
        }
    }
    panic!("entry missing")
}

pub(super) fn ownership_source() -> Vec<u8> {
    write_resource_fork(&[
        ResourceEntry {
            resource_type: *b"PICT",
            id: 30_000,
            name: "Old Gate".into(),
            attributes: 4,
            data: vec![1, 2, 3],
        },
        ResourceEntry {
            resource_type: *b"TEXT",
            id: 42,
            name: "Evidence".into(),
            attributes: 3,
            data: b"preserve me".to_vec(),
        },
    ])
    .unwrap()
}
