use super::byte_io::{checked_slice, read_u16};
use super::types::PictDecodeError;

pub(super) fn decode_rows(
    bytes: &[u8],
    offset: usize,
    row_bytes: usize,
    decoded_row_bytes: usize,
    height: usize,
    packed: bool,
    words: bool,
) -> Result<(Vec<Vec<u8>>, usize), PictDecodeError> {
    let mut cursor = offset;
    let mut rows = Vec::with_capacity(height);
    for _ in 0..height {
        if !packed {
            let row = checked_slice(bytes, cursor, row_bytes, "pixel row")?.to_vec();
            cursor += row_bytes;
            rows.push(row);
            continue;
        }
        let (packed_length, prefix) = if row_bytes > 250 {
            (
                usize::from(read_u16(bytes, cursor, "PackBits row length")?),
                2,
            )
        } else {
            (
                usize::from(*bytes.get(cursor).ok_or(PictDecodeError::Truncated {
                    offset: cursor,
                    section: "PackBits row length",
                })?),
                1,
            )
        };
        cursor += prefix;
        let packed_row = checked_slice(bytes, cursor, packed_length, "PackBits row")?;
        rows.push(decode_packbits(
            packed_row,
            decoded_row_bytes,
            words,
            cursor,
        )?);
        cursor += packed_length;
    }
    Ok((rows, cursor))
}

pub(super) fn decode_direct_rows(
    bytes: &[u8],
    offset: usize,
    row_bytes: usize,
    width: usize,
    height: usize,
    components: u16,
    pack_type: u16,
) -> Result<(Vec<Vec<u8>>, usize), PictDecodeError> {
    if pack_type == 1 {
        return decode_rows(bytes, offset, row_bytes, row_bytes, height, false, false);
    }
    if pack_type == 2 {
        let stored = row_bytes
            .checked_mul(3)
            .and_then(|bytes| bytes.checked_div(4))
            .ok_or(PictDecodeError::InvalidRowBytes { offset, row_bytes })?;
        return decode_rows(bytes, offset, stored, stored, height, false, false);
    }
    let decoded_row_bytes = if pack_type == 4 {
        width
            .checked_mul(usize::from(components))
            .ok_or(PictDecodeError::InvalidRowBytes { offset, row_bytes })?
    } else {
        row_bytes
    };
    decode_rows(
        bytes,
        offset,
        row_bytes,
        decoded_row_bytes,
        height,
        true,
        pack_type == 3,
    )
}

pub(super) fn decode_packbits(
    packed: &[u8],
    expected: usize,
    words: bool,
    offset: usize,
) -> Result<Vec<u8>, PictDecodeError> {
    let unit = if words { 2 } else { 1 };
    let mut cursor = 0usize;
    let mut decoded = Vec::with_capacity(expected);
    while cursor < packed.len() && decoded.len() < expected {
        let control = packed[cursor] as i8;
        cursor += 1;
        match control {
            0..=127 => {
                let count = (usize::from(control as u8) + 1) * unit;
                let end = cursor
                    .checked_add(count)
                    .ok_or(PictDecodeError::InvalidPackBits { offset })?;
                if end > packed.len() {
                    return Err(PictDecodeError::InvalidPackBits { offset });
                }
                let remaining = expected.saturating_sub(decoded.len());
                decoded.extend_from_slice(&packed[cursor..cursor + count.min(remaining)]);
                cursor = end;
            }
            -127..=-1 => {
                let count = usize::try_from(1i16 - i16::from(control)).unwrap_or(0);
                let end = cursor + unit;
                if end > packed.len() {
                    return Err(PictDecodeError::InvalidPackBits { offset });
                }
                let value = &packed[cursor..end];
                for _ in 0..count.min(expected.saturating_sub(decoded.len()) / unit) {
                    decoded.extend_from_slice(value);
                }
                cursor = end;
            }
            -128 => {}
        }
    }
    if decoded.len() != expected {
        return Err(PictDecodeError::PackBitsLengthMismatch {
            offset,
            expected,
            actual: decoded.len(),
        });
    }
    Ok(decoded)
}
