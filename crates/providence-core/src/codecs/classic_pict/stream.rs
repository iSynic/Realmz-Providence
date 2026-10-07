use super::bitmap::{
    BITS_RECT, BITS_RGN, DIRECT_BITS_RECT, DIRECT_BITS_RGN, PACK_BITS_RECT, PACK_BITS_RGN,
    parse_bitmap,
};
use super::byte_io::{checked_slice, read_u16};
use super::geometry::{BitmapCommand, Rect};
use super::types::{PictBitmapFormat, PictDecodeError};

pub(super) fn scan_version_two_bitmap_commands(
    bytes: &[u8],
) -> Result<Vec<BitmapCommand>, PictDecodeError> {
    let mut commands = Vec::new();
    let mut first_bitmap_error = None;
    let mut offset = 10usize;
    while offset + 2 <= bytes.len() {
        let opcode = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]);
        if !matches!(
            opcode,
            BITS_RECT
                | BITS_RGN
                | PACK_BITS_RECT
                | PACK_BITS_RGN
                | DIRECT_BITS_RECT
                | DIRECT_BITS_RGN
        ) {
            offset += 1;
            continue;
        }
        match parse_bitmap(bytes, offset, opcode, 2) {
            Ok(command) => {
                offset = command.next_offset.max(offset + 2);
                commands.push(command);
            }
            Err(error) => {
                first_bitmap_error.get_or_insert(error);
                offset += 1;
            }
        }
    }
    if commands.is_empty() {
        Err(first_bitmap_error.unwrap_or(PictDecodeError::NoSupportedBitmap))
    } else {
        Ok(commands)
    }
}

pub(super) fn parse_version_one_bitmap_commands(
    bytes: &[u8],
) -> Result<Vec<BitmapCommand>, PictDecodeError> {
    let mut commands = Vec::new();
    let mut offset = 10usize;
    while offset < bytes.len() {
        let opcode = bytes[offset];
        match opcode {
            0x90 | 0x91 | 0x98 | 0x99 => {
                let command = parse_bitmap(bytes, offset, u16::from(opcode), 1)?;
                if command.format != PictBitmapFormat::Monochrome {
                    return Err(PictDecodeError::UnsupportedBitmap {
                        offset,
                        opcode: u16::from(opcode),
                    });
                }
                offset = command.next_offset.max(offset + 1);
                commands.push(command);
            }
            0xff => break,
            _ => offset = skip_version_one_control(bytes, offset, opcode)?,
        }
    }
    Ok(commands)
}

pub(super) fn pict_payload(input: &[u8]) -> Result<&[u8], PictDecodeError> {
    if input.len() < 10 {
        return Err(PictDecodeError::TooShort);
    }
    if Rect::read(input, 2)
        .ok()
        .and_then(Rect::width)
        .is_some_and(|width| width > 0)
    {
        return Ok(input);
    }
    if input.len() >= 522 && input[..512].iter().all(|byte| *byte == 0) {
        let payload = &input[512..];
        let version_offset = 10;
        let v2 = payload.get(version_offset..version_offset + 4) == Some(&[0x00, 0x11, 0x02, 0xff]);
        if !v2 {
            return Err(PictDecodeError::InvalidStandaloneContainer);
        }
        return Ok(payload);
    }
    Ok(input)
}

fn skip_version_one_control(
    bytes: &[u8],
    offset: usize,
    opcode: u8,
) -> Result<usize, PictDecodeError> {
    match opcode {
        0x11 => {
            let version = *bytes.get(offset + 1).ok_or(PictDecodeError::Truncated {
                offset,
                section: "version-1 version opcode",
            })?;
            if version != 1 {
                return Err(PictDecodeError::UnsupportedVersionOneOpcode { offset, opcode });
            }
            Ok(offset + 2)
        }
        0x01 => {
            let size = usize::from(read_u16(bytes, offset + 1, "version-1 clip region")?);
            if size < 10 {
                return Err(PictDecodeError::Truncated {
                    offset,
                    section: "version-1 clip region",
                });
            }
            checked_slice(bytes, offset + 1, size, "version-1 clip region")?;
            Ok(offset + 1 + size)
        }
        0xa0 => {
            checked_slice(bytes, offset, 3, "version-1 short comment")?;
            Ok(offset + 3)
        }
        0xa1 => {
            let data_length = usize::from(read_u16(bytes, offset + 3, "version-1 long comment")?);
            let command_length = data_length
                .checked_add(5)
                .ok_or(PictDecodeError::Truncated {
                    offset,
                    section: "version-1 long comment",
                })?;
            checked_slice(bytes, offset, command_length, "version-1 long comment")?;
            Ok(offset + command_length)
        }
        _ => Err(PictDecodeError::UnsupportedVersionOneOpcode { offset, opcode }),
    }
}
