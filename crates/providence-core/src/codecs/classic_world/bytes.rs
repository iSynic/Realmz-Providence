pub(super) fn read_i16(bytes: &[u8]) -> i16 {
    i16::from_be_bytes([bytes[0], bytes[1]])
}

pub(super) fn read_i32(bytes: &[u8]) -> i32 {
    i32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
}

pub(super) fn append_trailing_bytes(
    output: &mut Vec<u8>,
    source: Option<&[u8]>,
    record_bytes: usize,
) {
    if let Some(source) = source {
        let complete = source.len() / record_bytes * record_bytes;
        output.extend_from_slice(&source[complete..]);
    }
}
