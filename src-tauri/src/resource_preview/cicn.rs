use super::{
    diagnostic, i16_be, image_preview, metadata_preview, u16_be, DecodedImage,
    DecodedResourcePreview, DiagnosticExt, ResourcePreviewStatus,
};
use crate::error::Result;
use std::collections::BTreeMap;

pub(crate) fn inspect(
    data: &[u8],
    mut summary: BTreeMap<String, String>,
) -> Result<DecodedResourcePreview> {
    match decode_cicn(data) {
        Ok(image) => {
            summary.insert("format".to_string(), "indexed-color-icon".to_string());
            image_preview(summary, image, Vec::new())
        }
        Err(failure) => Ok(metadata_preview(
            if failure.malformed {
                ResourcePreviewStatus::Malformed
            } else {
                ResourcePreviewStatus::UnsupportedVariant
            },
            "image/cicn",
            summary,
            failure.diagnostic,
        )),
    }
}

struct CicnFailure {
    diagnostic: super::ResourcePreviewDiagnostic,
    malformed: bool,
}

fn decode_cicn(data: &[u8]) -> std::result::Result<DecodedImage, CicnFailure> {
    if data.len() < 82 {
        return Err(CicnFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "cicn.too_short",
                "cicn resource is shorter than the fixed icon header.",
                "cicn",
            ),
        });
    }
    let row_bytes = u16_be(data, 4).unwrap_or(0) & 0x3fff;
    let width = (i16_be(data, 12) - i16_be(data, 8)).max(0) as usize;
    let height = (i16_be(data, 10) - i16_be(data, 6)).max(0) as usize;
    let pixel_size = u16_be(data, 32).unwrap_or(0);
    let mask_row_bytes = u16_be(data, 54).unwrap_or(0) & 0x3fff;
    let mask_top = i16_be(data, 56);
    let mask_bottom = i16_be(data, 60);
    let mask_height = if mask_bottom > mask_top {
        (mask_bottom - mask_top) as usize
    } else {
        height
    };
    let bitmap_row_bytes = u16_be(data, 68).unwrap_or(0) & 0x3fff;
    let bitmap_top = i16_be(data, 70);
    let bitmap_bottom = i16_be(data, 74);
    let bitmap_height = if bitmap_bottom > bitmap_top {
        (bitmap_bottom - bitmap_top) as usize
    } else {
        0
    };
    if width == 0 || height == 0 || width > 512 || height > 512 {
        return Err(CicnFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "cicn.invalid_geometry",
                format!("cicn geometry is invalid: width={width}, height={height}."),
                "cicn",
            )
            .with_variant("geometry"),
        });
    }
    if ![1, 2, 4, 8].contains(&pixel_size) {
        return Err(CicnFailure {
            malformed: false,
            diagnostic: diagnostic(
                "warning",
                "cicn.unsupported_depth",
                format!(
                    "cicn pixel depth {pixel_size} is not supported; expected 1, 2, 4, or 8 bits."
                ),
                "cicn",
            )
            .with_variant(format!("depth-{pixel_size}")),
        });
    }
    let mask_offset = 82usize;
    let bitmap_offset = mask_offset + mask_row_bytes * mask_height;
    let color_table_offset = bitmap_offset + bitmap_row_bytes * bitmap_height;
    if color_table_offset + 8 > data.len() {
        return Err(CicnFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "cicn.color_table_missing",
                "cicn color table begins beyond the available resource bytes.",
                "cicn",
            )
            .with_offset(color_table_offset),
        });
    }
    let color_count = u16_be(data, color_table_offset + 6).unwrap_or(0) + 1;
    let color_table_flags = u16_be(data, color_table_offset + 4).unwrap_or(0);
    let pixel_data_offset = color_table_offset + 8 + color_count * 8;
    if pixel_data_offset + row_bytes * height > data.len() {
        return Err(CicnFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "cicn.pixel_data_truncated",
                "cicn pixel data is truncated after the color table.",
                "cicn",
            )
            .with_offset(pixel_data_offset),
        });
    }
    let mut color_entries = Vec::with_capacity(color_count);
    for index in 0..color_count {
        let offset = color_table_offset + 8 + index * 8;
        color_entries.push(ColorTableEntry {
            color_num: u16_be(data, offset).unwrap_or(index),
            rgb: [
                color_component_8(u16_be(data, offset + 2).unwrap_or(0)),
                color_component_8(u16_be(data, offset + 4).unwrap_or(0)),
                color_component_8(u16_be(data, offset + 6).unwrap_or(0)),
            ],
        });
    }
    let max_pixel_value = (1usize << pixel_size) - 1;
    let mut rgba = vec![0u8; width * height * 4];
    for y in 0..height {
        for x in 0..width {
            let color_index = match pixel_size {
                8 => data[pixel_data_offset + y * row_bytes + x] as usize,
                4 => {
                    let byte = data[pixel_data_offset + y * row_bytes + x / 2];
                    if x % 2 == 0 {
                        (byte >> 4) as usize
                    } else {
                        (byte & 0x0f) as usize
                    }
                }
                2 => {
                    let byte = data[pixel_data_offset + y * row_bytes + x / 4];
                    ((byte >> (6 - (x % 4) * 2)) & 0x03) as usize
                }
                _ => {
                    let byte = data[pixel_data_offset + y * row_bytes + x / 8];
                    ((byte >> (7 - (x % 8))) & 0x01) as usize
                }
            };
            let mask_byte = data
                .get(mask_offset + y * mask_row_bytes + x / 8)
                .copied()
                .unwrap_or(0xff);
            let alpha = if (mask_byte >> (7 - (x % 8))) & 1 == 1 {
                255
            } else {
                0
            };
            let color = lookup_color_table_entry(&color_entries, color_table_flags, color_index)
                .unwrap_or_else(|| {
                    if color_index == max_pixel_value {
                        [0, 0, 0]
                    } else {
                        [0, 0, 0]
                    }
                });
            let out = (y * width + x) * 4;
            rgba[out] = color[0];
            rgba[out + 1] = color[1];
            rgba[out + 2] = color[2];
            rgba[out + 3] = alpha;
        }
    }
    Ok(DecodedImage {
        width: width as u32,
        height: height as u32,
        rgba,
    })
}

#[derive(Clone, Copy)]
struct ColorTableEntry {
    color_num: usize,
    rgb: [u8; 3],
}

fn lookup_color_table_entry(
    entries: &[ColorTableEntry],
    flags: usize,
    color_id: usize,
) -> Option<[u8; 3]> {
    if flags & 0x8000 != 0 {
        return entries.get(color_id).map(|entry| entry.rgb);
    }
    entries
        .iter()
        .find(|entry| entry.color_num == color_id)
        .map(|entry| entry.rgb)
}

fn color_component_8(component: usize) -> u8 {
    (component / 0x0101) as u8
}
