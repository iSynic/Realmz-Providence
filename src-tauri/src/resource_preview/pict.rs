use super::{
    decode_packbits_row, diagnostic, i16_be, image_preview, metadata_preview, u16_be, DecodedImage,
    DecodedResourcePreview, DiagnosticExt, ResourcePreviewStatus,
};
use crate::error::Result;
use std::collections::BTreeMap;

const PACK_BITS_RECT: usize = 0x0098;
const PACK_BITS_RGN: usize = 0x0099;
const DIRECT_BITS_RECT: usize = 0x009a;
const DIRECT_BITS_RGN: usize = 0x009b;
const BITS_RECT: usize = 0x0090;
const BITS_RGN: usize = 0x0091;

pub(crate) fn inspect(
    data: &[u8],
    mut summary: BTreeMap<String, String>,
) -> Result<DecodedResourcePreview> {
    if data.len() < 10 {
        return Ok(metadata_preview(
            ResourcePreviewStatus::Malformed,
            "image/pict",
            summary,
            diagnostic(
                "error",
                "pict.too_short",
                "PICT resource is shorter than the 10-byte size/frame header.",
                "pict",
            ),
        ));
    }
    summary.insert("pictSizeWord".to_string(), i16_be(data, 0).to_string());
    summary.insert("frameTop".to_string(), i16_be(data, 2).to_string());
    summary.insert("frameLeft".to_string(), i16_be(data, 4).to_string());
    summary.insert("frameBottom".to_string(), i16_be(data, 6).to_string());
    summary.insert("frameRight".to_string(), i16_be(data, 8).to_string());

    match decode_pict(data) {
        Ok(decoded) => {
            summary.insert("format".to_string(), decoded.format);
            summary.insert("pixelSize".to_string(), decoded.pixel_size.to_string());
            summary.insert("rowBytes".to_string(), decoded.row_bytes.to_string());
            summary.insert("opcode".to_string(), format!("0x{:04X}", decoded.opcode));
            image_preview(summary, decoded.image, Vec::new())
        }
        Err(failure) => {
            let status = if failure.malformed {
                ResourcePreviewStatus::Malformed
            } else {
                ResourcePreviewStatus::UnsupportedVariant
            };
            Ok(metadata_preview(
                status,
                "image/pict",
                summary,
                failure.diagnostic,
            ))
        }
    }
}

struct PictDecode {
    image: DecodedImage,
    format: String,
    pixel_size: usize,
    row_bytes: usize,
    opcode: usize,
}

struct PictFailure {
    diagnostic: super::ResourcePreviewDiagnostic,
    malformed: bool,
}

struct PackBitsRect {
    opcode: usize,
    opcode_offset: usize,
    row_bytes: usize,
    color_table_offset: usize,
    color_count: usize,
    width: usize,
    height: usize,
    data_offset: usize,
    pixel_size: usize,
}

fn decode_pict(data: &[u8]) -> std::result::Result<PictDecode, PictFailure> {
    let rect = find_packbits_rect(data)?;
    let image = decode_packbits_rect(data, &rect)?;
    Ok(PictDecode {
        image,
        format: if rect.pixel_size == 4 {
            "packbits-indexed-4".to_string()
        } else {
            "packbits-indexed-8".to_string()
        },
        pixel_size: rect.pixel_size,
        row_bytes: rect.row_bytes,
        opcode: rect.opcode,
    })
}

fn find_packbits_rect(data: &[u8]) -> std::result::Result<PackBitsRect, PictFailure> {
    let mut first_supported_candidate = None;
    let mut first_known_opcode = None;
    for offset in 10..data.len().saturating_sub(80) {
        let Some(opcode) = u16_be(data, offset) else {
            continue;
        };
        if matches!(
            opcode,
            PACK_BITS_RECT
                | PACK_BITS_RGN
                | DIRECT_BITS_RECT
                | DIRECT_BITS_RGN
                | BITS_RECT
                | BITS_RGN
        ) && first_known_opcode.is_none()
        {
            first_known_opcode = Some((offset, opcode));
        }
        if opcode != PACK_BITS_RECT && opcode != PACK_BITS_RGN {
            continue;
        }
        let pixmap = offset + 2;
        let row_bytes_raw = u16_be(data, pixmap).unwrap_or(0);
        let row_bytes = row_bytes_raw & 0x3fff;
        let pixel_type = u16_be(data, pixmap + 26).unwrap_or(usize::MAX);
        let pixel_size = u16_be(data, pixmap + 28).unwrap_or(usize::MAX);
        let component_count = u16_be(data, pixmap + 30).unwrap_or(usize::MAX);
        let component_size = u16_be(data, pixmap + 32).unwrap_or(usize::MAX);
        if row_bytes_raw & 0x8000 == 0
            || row_bytes == 0
            || row_bytes > 4096
            || pixel_type != 0
            || ![4, 8].contains(&pixel_size)
            || component_count != 1
            || component_size != pixel_size
        {
            first_supported_candidate.get_or_insert_with(|| {
                PictFailure {
                    malformed: false,
                    diagnostic: diagnostic(
                        "warning",
                        "pict.packbits_unsupported_shape",
                        format!(
                            "PICT uses PackBits opcode 0x{opcode:04X}, but Providence only supports indexed 4-bit and 8-bit pixmaps here. Found pixelType={pixel_type}, pixelSize={pixel_size}, componentCount={component_count}, componentSize={component_size}, rowBytes={row_bytes}."
                        ),
                        "pict",
                    )
                    .with_offset(offset)
                    .with_opcode(opcode)
                    .with_variant(format!("pixel-size-{pixel_size}")),
                }
            });
            continue;
        }
        let color_table_offset = pixmap + 46;
        if color_table_offset + 8 > data.len() {
            return Err(PictFailure {
                malformed: true,
                diagnostic: diagnostic(
                    "error",
                    "pict.color_table_missing",
                    "PICT PackBits pixmap points beyond the resource before the color table.",
                    "pict",
                )
                .with_offset(color_table_offset)
                .with_opcode(opcode),
            });
        }
        let color_count = u16_be(data, color_table_offset + 6).unwrap_or(0) + 1;
        let after_color_table = color_table_offset + 8 + color_count * 8;
        if after_color_table + 18 >= data.len() {
            return Err(PictFailure {
                malformed: true,
                diagnostic: diagnostic(
                    "error",
                    "pict.truncated_color_table",
                    "PICT color table or source/destination rectangles are truncated.",
                    "pict",
                )
                .with_offset(color_table_offset)
                .with_opcode(opcode),
            });
        }
        let width = (i16_be(data, after_color_table + 6) - i16_be(data, after_color_table + 2))
            .max(0) as usize;
        let height =
            (i16_be(data, after_color_table + 4) - i16_be(data, after_color_table)).max(0) as usize;
        let mut data_offset = after_color_table + 18;
        if opcode == PACK_BITS_RGN {
            let region_size = u16_be(data, data_offset).unwrap_or(0);
            if region_size < 10 || data_offset + region_size >= data.len() {
                return Err(PictFailure {
                    malformed: true,
                    diagnostic: diagnostic(
                        "error",
                        "pict.region_truncated",
                        "PICT PackBitsRgn has a missing or truncated region before pixel data.",
                        "pict",
                    )
                    .with_offset(data_offset)
                    .with_opcode(opcode),
                });
            }
            data_offset += region_size;
        }
        if width > 0 && height > 0 {
            return Ok(PackBitsRect {
                opcode,
                opcode_offset: offset,
                row_bytes,
                color_table_offset,
                color_count,
                width,
                height,
                data_offset,
                pixel_size,
            });
        }
    }

    if let Some(failure) = first_supported_candidate {
        return Err(failure);
    }
    if let Some((offset, opcode)) = first_known_opcode {
        return Err(PictFailure {
            malformed: false,
            diagnostic: diagnostic(
                "warning",
                "pict.unsupported_opcode",
                "PICT uses a QuickDraw bitmap opcode that is not yet decoded for preview.",
                "pict",
            )
            .with_offset(offset)
            .with_opcode(opcode)
            .with_variant(match opcode {
                DIRECT_BITS_RECT | DIRECT_BITS_RGN => "direct-bits",
                BITS_RECT | BITS_RGN => "bits",
                _ => "quickdraw",
            })
            .with_hint(
                "The resource is preserved; preview needs an additional QuickDraw decoder variant.",
            ),
        });
    }
    Err(PictFailure {
        malformed: true,
        diagnostic: diagnostic(
            "error",
            "pict.no_drawable_opcode",
            "PICT contains no supported PackBits, Bits, or DirectBits drawing opcode.",
            "pict",
        ),
    })
}

fn decode_packbits_rect(
    data: &[u8],
    rect: &PackBitsRect,
) -> std::result::Result<DecodedImage, PictFailure> {
    let mut palette = vec![[0u8, 0u8, 0u8]; rect.color_count.max(1)];
    for index in 0..rect.color_count {
        let offset = rect.color_table_offset + 8 + index * 8;
        if offset + 8 > data.len() {
            break;
        }
        let color_index = u16_be(data, offset).unwrap_or(index);
        if color_index < palette.len() {
            palette[color_index] = [
                (u16_be(data, offset + 2).unwrap_or(0) >> 8) as u8,
                (u16_be(data, offset + 4).unwrap_or(0) >> 8) as u8,
                (u16_be(data, offset + 6).unwrap_or(0) >> 8) as u8,
            ];
        }
    }
    let width = rect.width.min(2048);
    let height = rect.height.min(2048);
    let mut rgba = vec![0u8; width * height * 4];
    let mut cursor = rect.data_offset;
    for y in 0..rect.height {
        if cursor >= data.len() {
            return Err(PictFailure {
                malformed: true,
                diagnostic: diagnostic(
                    "error",
                    "pict.pixel_data_truncated",
                    "PICT PackBits pixel data ended before all rows were decoded.",
                    "pict",
                )
                .with_offset(cursor)
                .with_opcode(rect.opcode),
            });
        }
        let packed_length = if rect.row_bytes > 250 {
            let value = u16_be(data, cursor).unwrap_or(0);
            cursor += 2;
            value
        } else {
            let value = data[cursor] as usize;
            cursor += 1;
            value
        };
        let available = packed_length.min(data.len().saturating_sub(cursor));
        let row = decode_packbits_row(data, cursor, available, rect.row_bytes);
        cursor += available;
        if y >= height {
            continue;
        }
        for x in 0..width {
            let index = if rect.pixel_size == 8 {
                row.get(x).copied().unwrap_or(0) as usize
            } else {
                let byte = row.get(x / 2).copied().unwrap_or(0);
                if x % 2 == 0 {
                    (byte >> 4) as usize
                } else {
                    (byte & 0x0f) as usize
                }
            };
            let color = palette.get(index).copied().unwrap_or([0, 0, 0]);
            let out = (y * width + x) * 4;
            rgba[out] = color[0];
            rgba[out + 1] = color[1];
            rgba[out + 2] = color[2];
            rgba[out + 3] = 255;
        }
    }
    let _ = rect.opcode_offset;
    Ok(DecodedImage {
        width: width as u32,
        height: height as u32,
        rgba,
    })
}
