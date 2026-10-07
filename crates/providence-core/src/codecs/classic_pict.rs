mod bitmap;
mod byte_io;
mod drawing;
mod geometry;
mod pixels;
mod rows;
mod stream;
mod types;

use drawing::draw_bitmap;
use geometry::Rect;
use std::collections::BTreeSet;
use stream::{parse_version_one_bitmap_commands, pict_payload, scan_version_two_bitmap_commands};
pub use types::{DecodedPict, PictBitmapFormat, PictDecodeError, PictStreamVersion};

pub fn decode_classic_pict(input: &[u8]) -> Result<DecodedPict, PictDecodeError> {
    let bytes = pict_payload(input)?;
    if bytes.len() < 10 {
        return Err(PictDecodeError::TooShort);
    }
    let frame = Rect::read(bytes, 2)?;
    let (width, height) = frame
        .bounded(2)
        .map_err(|_| PictDecodeError::InvalidFrame)?;
    let canvas_length = width
        .checked_mul(height)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or(PictDecodeError::InvalidFrame)?;
    let mut canvas = vec![255; canvas_length];
    let mut formats = BTreeSet::new();
    let (stream_version, commands) = if bytes.get(10..12) == Some(&[0x11, 0x01]) {
        (
            PictStreamVersion::Version1,
            parse_version_one_bitmap_commands(bytes)?,
        )
    } else {
        (
            if bytes.get(10..14) == Some(&[0x00, 0x11, 0x02, 0xff]) {
                PictStreamVersion::Version2
            } else {
                PictStreamVersion::UnversionedWordOpcodes
            },
            scan_version_two_bitmap_commands(bytes)?,
        )
    };
    if commands.is_empty() {
        return Err(PictDecodeError::NoSupportedBitmap);
    }
    for command in &commands {
        draw_bitmap(&mut canvas, width, height, frame, command);
        formats.insert(command.format);
    }
    Ok(DecodedPict {
        stream_version,
        width: width as u32,
        height: height as u32,
        rgba: canvas,
        bitmap_commands: commands.len(),
        formats: formats.into_iter().collect(),
    })
}

#[cfg(test)]
mod tests;
