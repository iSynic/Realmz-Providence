use super::{
    decode_packbits_row, diagnostic, i16_be, image_preview, metadata_preview, u16_be, DecodedImage,
    DecodedResourcePreview, DiagnosticExt, ResourcePreviewDiagnostic, ResourcePreviewStatus,
};
use crate::error::Result;
use std::collections::BTreeMap;

const END_PICTURE: usize = 0x00ff;
const HEADER_OP: usize = 0x0c00;
const PACK_BITS_RECT: usize = 0x0098;
const PACK_BITS_RGN: usize = 0x0099;
const DIRECT_BITS_RECT: usize = 0x009a;
const DIRECT_BITS_RGN: usize = 0x009b;
const BITS_RECT: usize = 0x0090;
const BITS_RGN: usize = 0x0091;
const MAX_CANVAS_SIDE: usize = 2048;

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
            summary.insert("pictVersion".to_string(), decoded.version);
            summary.insert("format".to_string(), decoded.format);
            summary.insert("pixelSize".to_string(), decoded.pixel_size.to_string());
            summary.insert("rowBytes".to_string(), decoded.row_bytes.to_string());
            summary.insert("opcode".to_string(), format!("0x{:04X}", decoded.opcode));
            summary.insert("opcodeCount".to_string(), decoded.opcode_count.to_string());
            if decoded.unsupported_visible_opcodes > 0 {
                summary.insert(
                    "unsupportedVisibleOpcodes".to_string(),
                    decoded.unsupported_visible_opcodes.to_string(),
                );
            }
            image_preview(summary, decoded.image, decoded.diagnostics)
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
    version: String,
    format: String,
    pixel_size: usize,
    row_bytes: usize,
    opcode: usize,
    opcode_count: usize,
    unsupported_visible_opcodes: usize,
    diagnostics: Vec<ResourcePreviewDiagnostic>,
}

#[derive(Clone, Debug)]
struct PictFailure {
    diagnostic: super::ResourcePreviewDiagnostic,
    malformed: bool,
}

struct PackBitsRect {
    opcode: usize,
    opcode_offset: usize,
    row_bytes: usize,
    color_table_offset: usize,
    color_table_flags: usize,
    color_count: usize,
    width: usize,
    height: usize,
    data_offset: usize,
    pixel_size: usize,
}

struct DirectBitsRect {
    opcode: usize,
    row_bytes: usize,
    width: usize,
    height: usize,
    data_offset: usize,
    pixel_size: usize,
}

struct OneBitPackBitsRect {
    opcode: usize,
    row_bytes: usize,
    width: usize,
    height: usize,
    data_offset: usize,
}

#[derive(Clone, Copy)]
struct Rect {
    top: i16,
    left: i16,
    bottom: i16,
    right: i16,
}

impl Rect {
    fn parse(data: &[u8], offset: usize) -> Option<Self> {
        (offset + 8 <= data.len()).then(|| Self {
            top: i16_be(data, offset),
            left: i16_be(data, offset + 2),
            bottom: i16_be(data, offset + 4),
            right: i16_be(data, offset + 6),
        })
    }

    fn width(self) -> usize {
        (i32::from(self.right) - i32::from(self.left)).max(0) as usize
    }

    fn height(self) -> usize {
        (i32::from(self.bottom) - i32::from(self.top)).max(0) as usize
    }
}

struct PictHeader {
    size_word: i16,
    frame: Rect,
}

impl PictHeader {
    fn parse(data: &[u8]) -> Option<Self> {
        Some(Self {
            size_word: i16_be(data, 0),
            frame: Rect::parse(data, 2)?,
        })
    }
}

#[derive(Clone)]
struct PictOpcode {
    offset: usize,
    opcode: usize,
}

struct PictOpcodeStream {
    version: String,
    opcodes: Vec<PictOpcode>,
    unsupported_visible: Vec<PictOpcode>,
}

struct PictCanvas {
    frame: Rect,
    width: usize,
    height: usize,
    rgba: Vec<u8>,
    drew: bool,
}

impl PictCanvas {
    fn new(frame: Rect, fallback_width: usize, fallback_height: usize) -> Self {
        let frame_width = frame.width();
        let frame_height = frame.height();
        let width = if frame_width > 0 {
            frame_width
        } else {
            fallback_width
        }
        .clamp(1, MAX_CANVAS_SIDE);
        let height = if frame_height > 0 {
            frame_height
        } else {
            fallback_height
        }
        .clamp(1, MAX_CANVAS_SIDE);
        Self {
            frame,
            width,
            height,
            rgba: vec![255u8; width * height * 4],
            drew: false,
        }
    }

    fn draw_bitmap(&mut self, bitmap: &DecodedBitmap, src_rect: Rect, dst_rect: Rect) {
        let dst_left = (i32::from(dst_rect.left) - i32::from(self.frame.left)).max(0) as usize;
        let dst_top = (i32::from(dst_rect.top) - i32::from(self.frame.top)).max(0) as usize;
        let dst_right = (i32::from(dst_rect.right) - i32::from(self.frame.left))
            .max(0)
            .min(self.width as i32) as usize;
        let dst_bottom = (i32::from(dst_rect.bottom) - i32::from(self.frame.top))
            .max(0)
            .min(self.height as i32) as usize;
        let dst_width = dst_right.saturating_sub(dst_left);
        let dst_height = dst_bottom.saturating_sub(dst_top);
        let src_width = src_rect.width().max(1);
        let src_height = src_rect.height().max(1);
        if dst_width == 0 || dst_height == 0 {
            return;
        }
        for y in 0..dst_height {
            let source_y = i32::from(src_rect.top)
                + i32::try_from(y * src_height / dst_height).unwrap_or(0)
                - i32::from(bitmap.bounds.top);
            if source_y < 0 || source_y >= bitmap.image.height as i32 {
                continue;
            }
            for x in 0..dst_width {
                let source_x = i32::from(src_rect.left)
                    + i32::try_from(x * src_width / dst_width).unwrap_or(0)
                    - i32::from(bitmap.bounds.left);
                if source_x < 0 || source_x >= bitmap.image.width as i32 {
                    continue;
                }
                let source =
                    (source_y as usize * bitmap.image.width as usize + source_x as usize) * 4;
                let target = ((dst_top + y) * self.width + dst_left + x) * 4;
                self.rgba[target..target + 4]
                    .copy_from_slice(&bitmap.image.rgba[source..source + 4]);
            }
        }
        self.drew = true;
    }

    fn into_image(self) -> DecodedImage {
        DecodedImage {
            width: self.width as u32,
            height: self.height as u32,
            rgba: self.rgba,
        }
    }
}

struct DecodedBitmap {
    image: DecodedImage,
    bounds: Rect,
}

struct BitmapDrawCommand {
    opcode: usize,
    next_offset: usize,
    row_bytes: usize,
    pixel_size: usize,
    bounds: Rect,
    src_rect: Rect,
    dst_rect: Rect,
    format: String,
    data_offset: usize,
    color_table_offset: Option<usize>,
    color_table_flags: usize,
    color_count: usize,
    direct: bool,
    packed: bool,
}

fn decode_pict(data: &[u8]) -> std::result::Result<PictDecode, PictFailure> {
    let header = PictHeader::parse(data).ok_or_else(|| PictFailure {
        malformed: true,
        diagnostic: diagnostic(
            "error",
            "pict.too_short",
            "PICT resource is shorter than the 10-byte size/frame header.",
            "pict",
        ),
    })?;
    let stream = parse_opcode_stream(data);
    let mut diagnostics = Vec::new();
    let mut best: Option<(BitmapDrawCommand, DecodedBitmap)> = None;
    for opcode in &stream.opcodes {
        let Ok(command) = parse_bitmap_command(data, opcode.offset, opcode.opcode) else {
            continue;
        };
        match decode_bitmap_command(data, &command) {
            Ok(bitmap) => {
                let area = bitmap.image.width as usize * bitmap.image.height as usize;
                let current_area = best
                    .as_ref()
                    .map(|(_, image)| image.image.width as usize * image.image.height as usize)
                    .unwrap_or(0);
                if area >= current_area {
                    best = Some((command, bitmap));
                }
            }
            Err(failure) => diagnostics.push(failure.diagnostic),
        }
    }
    if let Some((command, bitmap)) = best {
        let mut canvas = PictCanvas::new(
            header.frame,
            bitmap.image.width as usize,
            bitmap.image.height as usize,
        );
        canvas.draw_bitmap(&bitmap, command.src_rect, command.dst_rect);
        return Ok(PictDecode {
            image: if canvas.drew {
                canvas.into_image()
            } else {
                bitmap.image
            },
            version: stream.version,
            format: command.format,
            pixel_size: command.pixel_size,
            row_bytes: command.row_bytes,
            opcode: command.opcode,
            opcode_count: stream.opcodes.len(),
            unsupported_visible_opcodes: stream.unsupported_visible.len(),
            diagnostics,
        });
    }

    let _ = header.size_word;
    let mut failures = diagnostics
        .into_iter()
        .map(|diagnostic| PictFailure {
            diagnostic,
            malformed: false,
        })
        .collect::<Vec<_>>();
    match find_indexed_packbits_rect(data).and_then(|rect| {
        decode_packbits_rect(data, &rect).map(|image| PictDecode {
            version: stream.version.clone(),
            image,
            format: if rect.pixel_size == 4 {
                "packbits-indexed-4".to_string()
            } else if rect.pixel_size == 2 {
                "packbits-indexed-2".to_string()
            } else if rect.pixel_size == 1 {
                "packbits-indexed-1".to_string()
            } else {
                "packbits-indexed-8".to_string()
            },
            pixel_size: rect.pixel_size,
            row_bytes: rect.row_bytes,
            opcode: rect.opcode,
            opcode_count: stream.opcodes.len(),
            unsupported_visible_opcodes: stream.unsupported_visible.len(),
            diagnostics: Vec::new(),
        })
    }) {
        Ok(decoded) => return Ok(decoded),
        Err(failure) => failures.push(failure),
    }
    match find_direct_bits_rect(data).and_then(|rect| {
        decode_direct_bits_rect(data, &rect).map(|image| PictDecode {
            version: stream.version.clone(),
            image,
            format: format!("directbits-{}-packbits", rect.pixel_size),
            pixel_size: rect.pixel_size,
            row_bytes: rect.row_bytes,
            opcode: rect.opcode,
            opcode_count: stream.opcodes.len(),
            unsupported_visible_opcodes: stream.unsupported_visible.len(),
            diagnostics: Vec::new(),
        })
    }) {
        Ok(decoded) => return Ok(decoded),
        Err(failure) => failures.push(failure),
    }
    match find_one_bit_packbits_rect(data).and_then(|rect| {
        decode_one_bit_packbits_rect(data, &rect).map(|image| PictDecode {
            version: stream.version.clone(),
            image,
            format: "packbits-bitmap-1".to_string(),
            pixel_size: 1,
            row_bytes: rect.row_bytes,
            opcode: rect.opcode,
            opcode_count: stream.opcodes.len(),
            unsupported_visible_opcodes: stream.unsupported_visible.len(),
            diagnostics: Vec::new(),
        })
    }) {
        Ok(decoded) => return Ok(decoded),
        Err(failure) => failures.push(failure),
    }
    Err(failures.into_iter().next().unwrap_or_else(|| PictFailure {
        malformed: true,
        diagnostic: diagnostic(
            "error",
            "pict.no_drawable_opcode",
            "PICT contains no supported PackBits, Bits, or DirectBits drawing opcode.",
            "pict",
        ),
    }))
}

fn parse_opcode_stream(data: &[u8]) -> PictOpcodeStream {
    let mut cursor = 10usize;
    let mut opcodes = Vec::new();
    let mut unsupported_visible = Vec::new();
    let mut version = "unknown".to_string();
    while cursor + 2 <= data.len() {
        if cursor % 2 != 0 {
            cursor += 1;
        }
        let offset = cursor;
        let Some(opcode) = u16_be(data, offset) else {
            break;
        };
        opcodes.push(PictOpcode { offset, opcode });
        cursor += 2;
        match opcode {
            END_PICTURE => break,
            0x0000 => {}
            0x0011 => {
                version = data
                    .get(cursor)
                    .map(|value| format!("v1/{value}"))
                    .unwrap_or_else(|| "v1".to_string());
                cursor += 1;
            }
            HEADER_OP => {
                version = "v2".to_string();
                cursor += 24;
            }
            0x0001 => {
                let size = u16_be(data, cursor).unwrap_or(0);
                cursor += size.max(2);
            }
            0x0003 | 0x0005 | 0x0008 | 0x000d | 0x00a0 => cursor += 2,
            0x0004 => cursor += 1,
            0x0006 | 0x0007 | 0x000b | 0x000c | 0x000e | 0x000f | 0x0021 => cursor += 4,
            0x0009 | 0x000a | 0x0010 | 0x0020 | 0x0030..=0x0077 => cursor += 8,
            0x001a | 0x001b | 0x001f | 0x0022 => cursor += 6,
            0x001e => {}
            0x0028 => {
                if cursor + 5 > data.len() {
                    break;
                }
                let text_len = data[cursor + 4] as usize;
                cursor += 5 + text_len;
            }
            0x0029 | 0x002a | 0x002b => {
                if cursor >= data.len() {
                    break;
                }
                let text_len = data[cursor] as usize;
                cursor += 1 + text_len;
            }
            BITS_RECT | BITS_RGN | PACK_BITS_RECT | PACK_BITS_RGN | DIRECT_BITS_RECT
            | DIRECT_BITS_RGN => match parse_bitmap_command(data, offset, opcode) {
                Ok(command) => cursor = command.next_offset,
                Err(failure) => {
                    unsupported_visible.push(PictOpcode { offset, opcode });
                    cursor = offset + 2;
                    if failure.malformed {
                        break;
                    }
                }
            },
            0x00a1 => {
                let size = u16_be(data, cursor + 2).unwrap_or(0);
                cursor += 4 + size;
            }
            0x8200 => {
                unsupported_visible.push(PictOpcode { offset, opcode });
                let size = u16_be(data, cursor).unwrap_or(0);
                cursor += 2 + size;
            }
            _ => {
                if is_probably_visible_opcode(opcode) {
                    unsupported_visible.push(PictOpcode { offset, opcode });
                }
            }
        }
        if cursor > data.len() {
            break;
        }
        if cursor % 2 != 0 {
            cursor += 1;
        }
    }
    PictOpcodeStream {
        version,
        opcodes,
        unsupported_visible,
    }
}

fn is_probably_visible_opcode(opcode: usize) -> bool {
    matches!(opcode, 0x0020..=0x007f | 0x0090..=0x009f | 0x8200)
}

fn parse_bitmap_command(
    data: &[u8],
    offset: usize,
    opcode: usize,
) -> std::result::Result<BitmapDrawCommand, PictFailure> {
    match opcode {
        BITS_RECT | BITS_RGN => parse_bits_command(data, offset, opcode),
        PACK_BITS_RECT | PACK_BITS_RGN => parse_packbits_command(data, offset, opcode),
        DIRECT_BITS_RECT | DIRECT_BITS_RGN => parse_directbits_command(data, offset, opcode),
        _ => Err(PictFailure {
            malformed: false,
            diagnostic: diagnostic(
                "warning",
                "pict.not_bitmap_opcode",
                "PICT opcode is not a bitmap drawing command.",
                "pict",
            )
            .with_offset(offset)
            .with_opcode(opcode),
        }),
    }
}

fn parse_bits_command(
    data: &[u8],
    offset: usize,
    opcode: usize,
) -> std::result::Result<BitmapDrawCommand, PictFailure> {
    let bitmap = offset + 2;
    if bitmap + 28 > data.len() {
        return Err(PictFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "pict.bits_truncated",
                "PICT BitsRect/BitsRgn bitmap header is truncated.",
                "pict",
            )
            .with_offset(offset)
            .with_opcode(opcode),
        });
    }
    let row_bytes = u16_be(data, bitmap).unwrap_or(0) & 0x3fff;
    let bounds = Rect::parse(data, bitmap + 2).ok_or_else(|| PictFailure {
        malformed: true,
        diagnostic: diagnostic(
            "error",
            "pict.bits_bounds_missing",
            "PICT BitsRect/BitsRgn bitmap bounds are missing.",
            "pict",
        )
        .with_offset(bitmap)
        .with_opcode(opcode),
    })?;
    let src_rect = Rect::parse(data, bitmap + 10).unwrap_or(bounds);
    let dst_rect = Rect::parse(data, bitmap + 18).unwrap_or(src_rect);
    let mut data_offset = bitmap + 28;
    if opcode == BITS_RGN {
        let region_size = u16_be(data, data_offset).unwrap_or(0);
        if region_size < 10 || data_offset + region_size > data.len() {
            return Err(PictFailure {
                malformed: true,
                diagnostic: diagnostic(
                    "error",
                    "pict.region_truncated",
                    "PICT BitsRgn has a missing or truncated region before pixel data.",
                    "pict",
                )
                .with_offset(data_offset)
                .with_opcode(opcode),
            });
        }
        data_offset += region_size;
    }
    if row_bytes == 0 || row_bytes > 4096 || bounds.width() == 0 || bounds.height() == 0 {
        return Err(PictFailure {
            malformed: false,
            diagnostic: diagnostic(
                "warning",
                "pict.bits_unsupported_shape",
                format!(
                    "PICT BitsRect/BitsRgn has unsupported geometry: rowBytes={row_bytes}, width={}, height={}.",
                    bounds.width(),
                    bounds.height()
                ),
                "pict",
            )
            .with_offset(offset)
            .with_opcode(opcode)
            .with_variant("bits-1"),
        });
    }
    let next_offset = data_offset.saturating_add(row_bytes.saturating_mul(bounds.height()));
    Ok(BitmapDrawCommand {
        opcode,
        next_offset: next_offset.min(data.len()),
        row_bytes,
        pixel_size: 1,
        bounds,
        src_rect,
        dst_rect,
        format: "bits-bitmap-1".to_string(),
        data_offset,
        color_table_offset: None,
        color_table_flags: 0,
        color_count: 2,
        direct: false,
        packed: false,
    })
}

fn parse_packbits_command(
    data: &[u8],
    offset: usize,
    opcode: usize,
) -> std::result::Result<BitmapDrawCommand, PictFailure> {
    let pixmap = offset + 2;
    if pixmap + 46 > data.len() {
        return Err(PictFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "pict.pixmap_truncated",
                "PICT PackBits pixmap header is truncated.",
                "pict",
            )
            .with_offset(offset)
            .with_opcode(opcode),
        });
    }
    let row_bytes_raw = u16_be(data, pixmap).unwrap_or(0);
    let row_bytes = row_bytes_raw & 0x3fff;
    let bounds = Rect::parse(data, pixmap + 2).unwrap_or(Rect {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
    });
    let pixel_type = u16_be(data, pixmap + 26).unwrap_or(usize::MAX);
    let pixel_size = u16_be(data, pixmap + 28).unwrap_or(usize::MAX);
    let component_count = u16_be(data, pixmap + 30).unwrap_or(usize::MAX);
    let component_size = u16_be(data, pixmap + 32).unwrap_or(usize::MAX);
    if row_bytes_raw & 0x8000 == 0
        || row_bytes == 0
        || row_bytes > 4096
        || pixel_type != 0
        || ![1, 2, 4, 8].contains(&pixel_size)
        || component_count != 1
        || component_size != pixel_size
    {
        return Err(PictFailure {
            malformed: false,
            diagnostic: diagnostic(
                "warning",
                "pict.packbits_unsupported_shape",
                format!(
                    "PICT uses PackBits opcode 0x{opcode:04X}, but this pixmap shape is unsupported. Found pixelType={pixel_type}, pixelSize={pixel_size}, componentCount={component_count}, componentSize={component_size}, rowBytes={row_bytes}."
                ),
                "pict",
            )
            .with_offset(offset)
            .with_opcode(opcode)
            .with_variant(format!("pixel-size-{pixel_size}")),
        });
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
    let color_table_flags = u16_be(data, color_table_offset + 4).unwrap_or(0);
    let color_count = u16_be(data, color_table_offset + 6).unwrap_or(0) + 1;
    let after_color_table = color_table_offset + 8 + color_count * 8;
    if after_color_table + 18 > data.len() {
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
    let src_rect = Rect::parse(data, after_color_table).unwrap_or(bounds);
    let dst_rect = Rect::parse(data, after_color_table + 8).unwrap_or(src_rect);
    let mut data_offset = after_color_table + 18;
    if opcode == PACK_BITS_RGN {
        let region_size = u16_be(data, data_offset).unwrap_or(0);
        if region_size < 10 || data_offset + region_size > data.len() {
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
    let next_offset = skip_packed_rows(data, data_offset, row_bytes, bounds.height());
    Ok(BitmapDrawCommand {
        opcode,
        next_offset,
        row_bytes,
        pixel_size,
        bounds,
        src_rect,
        dst_rect,
        format: format!("packbits-indexed-{pixel_size}"),
        data_offset,
        color_table_offset: Some(color_table_offset),
        color_table_flags,
        color_count,
        direct: false,
        packed: true,
    })
}

fn parse_directbits_command(
    data: &[u8],
    offset: usize,
    opcode: usize,
) -> std::result::Result<BitmapDrawCommand, PictFailure> {
    let pixmap = offset + 2;
    if pixmap + 68 > data.len() {
        return Err(PictFailure {
            malformed: true,
            diagnostic: diagnostic(
                "error",
                "pict.directbits_truncated",
                "PICT DirectBits pixmap header is truncated.",
                "pict",
            )
            .with_offset(offset)
            .with_opcode(opcode),
        });
    }
    let row_bytes_raw = u16_be(data, pixmap + 4).unwrap_or(0);
    let row_bytes = row_bytes_raw & 0x3fff;
    let bounds = Rect::parse(data, pixmap + 6).unwrap_or(Rect {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
    });
    let pixel_type = u16_be(data, pixmap + 30).unwrap_or(usize::MAX);
    let pixel_size = u16_be(data, pixmap + 32).unwrap_or(usize::MAX);
    let component_count = u16_be(data, pixmap + 34).unwrap_or(usize::MAX);
    let component_size = u16_be(data, pixmap + 36).unwrap_or(usize::MAX);
    if row_bytes_raw & 0x8000 == 0
        || row_bytes == 0
        || row_bytes > 8192
        || bounds.width() == 0
        || bounds.height() == 0
        || bounds.width() > MAX_CANVAS_SIDE
        || bounds.height() > MAX_CANVAS_SIDE
        || pixel_type != 16
        || ![16, 32].contains(&pixel_size)
        || ![3, 4].contains(&component_count)
        || ![5, 8].contains(&component_size)
    {
        return Err(PictFailure {
            malformed: false,
            diagnostic: diagnostic(
                "warning",
                "pict.directbits_unsupported_shape",
                "PICT DirectBits resource is not a supported 16-bit or 32-bit RGB pixmap.",
                "pict",
            )
            .with_offset(offset)
            .with_opcode(opcode)
            .with_variant("direct-bits"),
        });
    }
    let src_rect = Rect::parse(data, pixmap + 50).unwrap_or(bounds);
    let dst_rect = Rect::parse(data, pixmap + 58).unwrap_or(src_rect);
    let mut data_offset = pixmap + 68;
    if opcode == DIRECT_BITS_RGN {
        let region_size = u16_be(data, data_offset).unwrap_or(0);
        if region_size < 10 || data_offset + region_size > data.len() {
            return Err(PictFailure {
                malformed: true,
                diagnostic: diagnostic(
                    "error",
                    "pict.region_truncated",
                    "PICT DirectBitsRgn has a missing or truncated region before pixel data.",
                    "pict",
                )
                .with_offset(data_offset)
                .with_opcode(opcode),
            });
        }
        data_offset += region_size;
    }
    let next_offset = skip_packed_rows(data, data_offset, row_bytes, bounds.height());
    Ok(BitmapDrawCommand {
        opcode,
        next_offset,
        row_bytes,
        pixel_size,
        bounds,
        src_rect,
        dst_rect,
        format: format!("directbits-{pixel_size}-packbits"),
        data_offset,
        color_table_offset: None,
        color_table_flags: 0,
        color_count: 0,
        direct: true,
        packed: true,
    })
}

fn skip_packed_rows(data: &[u8], mut cursor: usize, row_bytes: usize, height: usize) -> usize {
    for _ in 0..height {
        if cursor >= data.len() {
            return data.len();
        }
        let packed_length = if row_bytes > 250 {
            let value = u16_be(data, cursor).unwrap_or(0);
            cursor += 2;
            value
        } else {
            let value = data[cursor] as usize;
            cursor += 1;
            value
        };
        cursor = cursor.saturating_add(packed_length.min(data.len().saturating_sub(cursor)));
    }
    cursor.min(data.len())
}

fn decode_bitmap_command(
    data: &[u8],
    command: &BitmapDrawCommand,
) -> std::result::Result<DecodedBitmap, PictFailure> {
    let image = if command.direct {
        decode_direct_bitmap_command(data, command)?
    } else if command.color_table_offset.is_some() {
        decode_indexed_bitmap_command(data, command)?
    } else {
        decode_mono_bitmap_command(data, command)?
    };
    Ok(DecodedBitmap {
        image,
        bounds: command.bounds,
    })
}

fn decode_indexed_bitmap_command(
    data: &[u8],
    command: &BitmapDrawCommand,
) -> std::result::Result<DecodedImage, PictFailure> {
    let color_table_offset = command.color_table_offset.unwrap_or(0);
    let mut palette = vec![[0u8, 0u8, 0u8]; command.color_count.max(1)];
    for index in 0..command.color_count {
        let offset = color_table_offset + 8 + index * 8;
        if offset + 8 > data.len() {
            break;
        }
        let color_index = color_table_palette_index(
            command.color_table_flags,
            index,
            u16_be(data, offset).unwrap_or(index),
            palette.len(),
        );
        if color_index < palette.len() {
            palette[color_index] = [
                (u16_be(data, offset + 2).unwrap_or(0) >> 8) as u8,
                (u16_be(data, offset + 4).unwrap_or(0) >> 8) as u8,
                (u16_be(data, offset + 6).unwrap_or(0) >> 8) as u8,
            ];
        }
    }
    let width = command.bounds.width().min(MAX_CANVAS_SIDE);
    let height = command.bounds.height().min(MAX_CANVAS_SIDE);
    let mut rgba = vec![0u8; width * height * 4];
    for (y, row) in bitmap_rows(data, command).enumerate() {
        if y >= height {
            continue;
        }
        for x in 0..width {
            let index = indexed_pixel(&row, x, command.pixel_size);
            let color = palette.get(index).copied().unwrap_or([0, 0, 0]);
            let out = (y * width + x) * 4;
            rgba[out] = color[0];
            rgba[out + 1] = color[1];
            rgba[out + 2] = color[2];
            rgba[out + 3] = 255;
        }
    }
    Ok(DecodedImage {
        width: width as u32,
        height: height as u32,
        rgba,
    })
}

fn decode_mono_bitmap_command(
    data: &[u8],
    command: &BitmapDrawCommand,
) -> std::result::Result<DecodedImage, PictFailure> {
    let width = command.bounds.width().min(MAX_CANVAS_SIDE);
    let height = command.bounds.height().min(MAX_CANVAS_SIDE);
    let mut rgba = vec![0u8; width * height * 4];
    for (y, row) in bitmap_rows(data, command).enumerate() {
        if y >= height {
            continue;
        }
        for x in 0..width {
            let bit = indexed_pixel(&row, x, 1);
            let value = if bit == 1 { 0 } else { 255 };
            let out = (y * width + x) * 4;
            rgba[out] = value;
            rgba[out + 1] = value;
            rgba[out + 2] = value;
            rgba[out + 3] = 255;
        }
    }
    Ok(DecodedImage {
        width: width as u32,
        height: height as u32,
        rgba,
    })
}

fn decode_direct_bitmap_command(
    data: &[u8],
    command: &BitmapDrawCommand,
) -> std::result::Result<DecodedImage, PictFailure> {
    let width = command.bounds.width().min(MAX_CANVAS_SIDE);
    let height = command.bounds.height().min(MAX_CANVAS_SIDE);
    let mut rgba = vec![0u8; width * height * 4];
    for (y, row) in bitmap_rows(data, command).enumerate() {
        if y >= height {
            continue;
        }
        for x in 0..width {
            let out = (y * width + x) * 4;
            if command.pixel_size == 16 {
                let source = x * 2;
                let pixel = u16::from_be_bytes([
                    row.get(source).copied().unwrap_or(0),
                    row.get(source + 1).copied().unwrap_or(0),
                ]);
                rgba[out] = five_bit_to_u8((pixel >> 10) & 0x1f);
                rgba[out + 1] = five_bit_to_u8((pixel >> 5) & 0x1f);
                rgba[out + 2] = five_bit_to_u8(pixel & 0x1f);
            } else {
                let source = x * 4;
                rgba[out] = row.get(source + 1).copied().unwrap_or(0);
                rgba[out + 1] = row.get(source + 2).copied().unwrap_or(0);
                rgba[out + 2] = row.get(source + 3).copied().unwrap_or(0);
            }
            rgba[out + 3] = 255;
        }
    }
    Ok(DecodedImage {
        width: width as u32,
        height: height as u32,
        rgba,
    })
}

fn bitmap_rows<'a>(
    data: &'a [u8],
    command: &'a BitmapDrawCommand,
) -> impl Iterator<Item = Vec<u8>> + 'a {
    let mut cursor = command.data_offset;
    let mut row = 0usize;
    std::iter::from_fn(move || {
        if row >= command.bounds.height() || cursor >= data.len() {
            return None;
        }
        row += 1;
        if command.packed {
            let packed_length = if command.row_bytes > 250 {
                let value = u16_be(data, cursor).unwrap_or(0);
                cursor += 2;
                value
            } else {
                let value = data[cursor] as usize;
                cursor += 1;
                value
            };
            let available = packed_length.min(data.len().saturating_sub(cursor));
            let decoded = decode_packbits_row(data, cursor, available, command.row_bytes);
            cursor += available;
            Some(decoded)
        } else {
            let end = (cursor + command.row_bytes).min(data.len());
            let mut decoded = data[cursor..end].to_vec();
            cursor = end;
            decoded.resize(command.row_bytes, 0);
            Some(decoded)
        }
    })
}

fn indexed_pixel(row: &[u8], x: usize, pixel_size: usize) -> usize {
    match pixel_size {
        8 => row.get(x).copied().unwrap_or(0) as usize,
        4 => {
            let byte = row.get(x / 2).copied().unwrap_or(0);
            if x % 2 == 0 {
                (byte >> 4) as usize
            } else {
                (byte & 0x0f) as usize
            }
        }
        2 => {
            let byte = row.get(x / 4).copied().unwrap_or(0);
            ((byte >> (6 - (x % 4) * 2)) & 0x03) as usize
        }
        _ => {
            let byte = row.get(x / 8).copied().unwrap_or(0);
            ((byte >> (7 - (x % 8))) & 0x01) as usize
        }
    }
}

fn find_indexed_packbits_rect(data: &[u8]) -> std::result::Result<PackBitsRect, PictFailure> {
    let mut first_supported_candidate = None;
    let mut first_known_opcode = None;
    for offset in (10..data.len().saturating_sub(80)).step_by(2) {
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
            || ![1, 2, 4, 8].contains(&pixel_size)
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
                            "PICT uses PackBits opcode 0x{opcode:04X}, but Providence only supports indexed 1-bit, 2-bit, 4-bit, and 8-bit pixmaps here. Found pixelType={pixel_type}, pixelSize={pixel_size}, componentCount={component_count}, componentSize={component_size}, rowBytes={row_bytes}."
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
        let color_table_flags = u16_be(data, color_table_offset + 4).unwrap_or(0);
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
        let width = rect_span(data, after_color_table + 2, after_color_table + 6);
        let height = rect_span(data, after_color_table, after_color_table + 4);
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
                color_table_flags,
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

fn find_direct_bits_rect(data: &[u8]) -> std::result::Result<DirectBitsRect, PictFailure> {
    let mut first_direct = None;
    for offset in (10..data.len().saturating_sub(130)).step_by(2) {
        let Some(opcode) = u16_be(data, offset) else {
            continue;
        };
        if opcode != DIRECT_BITS_RECT && opcode != DIRECT_BITS_RGN {
            continue;
        }
        first_direct.get_or_insert((offset, opcode));
        let pixmap = offset + 2;
        let row_bytes_raw = u16_be(data, pixmap + 4).unwrap_or(0);
        let row_bytes = row_bytes_raw & 0x3fff;
        let width = rect_span(data, pixmap + 8, pixmap + 12);
        let height = rect_span(data, pixmap + 6, pixmap + 10);
        let pixel_type = u16_be(data, pixmap + 30).unwrap_or(usize::MAX);
        let pixel_size = u16_be(data, pixmap + 32).unwrap_or(usize::MAX);
        let component_count = u16_be(data, pixmap + 34).unwrap_or(usize::MAX);
        let component_size = u16_be(data, pixmap + 36).unwrap_or(usize::MAX);
        if row_bytes_raw & 0x8000 == 0
            || row_bytes == 0
            || row_bytes > 8192
            || width == 0
            || height == 0
            || width > 2048
            || height > 2048
            || pixel_type != 16
            || ![16, 32].contains(&pixel_size)
            || ![3, 4].contains(&component_count)
            || ![5, 8].contains(&component_size)
        {
            continue;
        }
        let mut data_offset = pixmap + 50 + 18;
        if opcode == DIRECT_BITS_RGN {
            let region_size = u16_be(data, data_offset).unwrap_or(0);
            if region_size < 10 || data_offset + region_size >= data.len() {
                continue;
            }
            data_offset += region_size;
        }
        if data_offset < data.len() {
            return Ok(DirectBitsRect {
                opcode,
                row_bytes,
                width,
                height,
                data_offset,
                pixel_size,
            });
        }
    }
    if let Some((offset, opcode)) = first_direct {
        return Err(PictFailure {
            malformed: false,
            diagnostic: diagnostic(
                "warning",
                "pict.directbits_unsupported_shape",
                "PICT DirectBits resource is not a 32-bit PackBits RGB pixmap.",
                "pict",
            )
            .with_offset(offset)
            .with_opcode(opcode)
            .with_variant("direct-bits"),
        });
    }
    Err(PictFailure {
        malformed: true,
        diagnostic: diagnostic(
            "error",
            "pict.no_directbits_opcode",
            "PICT contains no DirectBits opcode.",
            "pict",
        ),
    })
}

fn find_one_bit_packbits_rect(data: &[u8]) -> std::result::Result<OneBitPackBitsRect, PictFailure> {
    for offset in 10..data.len().saturating_sub(40) {
        if data[offset] != 0x98 {
            continue;
        }
        let row_bytes = u16_be(data, offset + 1).unwrap_or(0);
        let width = rect_span(data, offset + 5, offset + 9);
        let height = rect_span(data, offset + 3, offset + 7);
        if row_bytes == 0
            || row_bytes > 512
            || width == 0
            || height == 0
            || width > 2048
            || height > 2048
            || row_bytes < width.div_ceil(8)
        {
            continue;
        }
        return Ok(OneBitPackBitsRect {
            opcode: 0x98,
            row_bytes,
            width,
            height,
            data_offset: offset + 29,
        });
    }
    Err(PictFailure {
        malformed: true,
        diagnostic: diagnostic(
            "error",
            "pict.no_one_bit_packbits",
            "PICT contains no old-style 1-bit PackBits bitmap opcode.",
            "pict",
        ),
    })
}

fn rect_span(data: &[u8], start_offset: usize, end_offset: usize) -> usize {
    (i32::from(i16_be(data, end_offset)) - i32::from(i16_be(data, start_offset))).max(0) as usize
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
        let color_index = color_table_palette_index(
            rect.color_table_flags,
            index,
            u16_be(data, offset).unwrap_or(index),
            palette.len(),
        );
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
            let index = indexed_pixel(&row, x, rect.pixel_size);
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

fn color_table_palette_index(
    flags: usize,
    entry_index: usize,
    color_index: usize,
    palette_len: usize,
) -> usize {
    if flags & 0x8000 != 0 || color_index >= palette_len {
        entry_index
    } else {
        color_index
    }
}

fn decode_direct_bits_rect(
    data: &[u8],
    rect: &DirectBitsRect,
) -> std::result::Result<DecodedImage, PictFailure> {
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
                    "PICT DirectBits pixel data ended before all rows were decoded.",
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
            let out = (y * width + x) * 4;
            if rect.pixel_size == 16 {
                let source = x * 2;
                let pixel = u16::from_be_bytes([
                    row.get(source).copied().unwrap_or(0),
                    row.get(source + 1).copied().unwrap_or(0),
                ]);
                rgba[out] = five_bit_to_u8((pixel >> 10) & 0x1f);
                rgba[out + 1] = five_bit_to_u8((pixel >> 5) & 0x1f);
                rgba[out + 2] = five_bit_to_u8(pixel & 0x1f);
            } else {
                let source = x * 4;
                rgba[out] = row.get(source + 1).copied().unwrap_or(0);
                rgba[out + 1] = row.get(source + 2).copied().unwrap_or(0);
                rgba[out + 2] = row.get(source + 3).copied().unwrap_or(0);
            }
            rgba[out + 3] = 255;
        }
    }
    Ok(DecodedImage {
        width: width as u32,
        height: height as u32,
        rgba,
    })
}

fn five_bit_to_u8(value: u16) -> u8 {
    ((u32::from(value) * 255 + 15) / 31) as u8
}

fn decode_one_bit_packbits_rect(
    data: &[u8],
    rect: &OneBitPackBitsRect,
) -> std::result::Result<DecodedImage, PictFailure> {
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
                    "PICT 1-bit PackBits pixel data ended before all rows were decoded.",
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
            let byte = row.get(x / 8).copied().unwrap_or(0);
            let bit = (byte >> (7 - (x % 8))) & 1;
            let value = if bit == 1 { 0 } else { 255 };
            let out = (y * width + x) * 4;
            rgba[out] = value;
            rgba[out + 1] = value;
            rgba[out + 2] = value;
            rgba[out + 3] = 255;
        }
    }
    Ok(DecodedImage {
        width: width as u32,
        height: height as u32,
        rgba,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn decodes_ordered_custom_landlook_palette_fixture() {
        let path =
            Path::new("F:/Realmz/base/Realmz/Scenarios/War in the Sword Lands/Scenario.rsrc");
        if !path.exists() {
            eprintln!("Skipping War in the Sword Lands PICT fixture; local fixture is absent.");
            return;
        }
        let data = std::fs::read(path).expect("fixture should be readable");
        let Some(pict) = resource_data(&data, b"PICT", 307) else {
            eprintln!("Skipping War in the Sword Lands PICT fixture; PICT 307 is absent.");
            return;
        };
        let rect = find_indexed_packbits_rect(&pict)
            .unwrap_or_else(|_| panic!("War PICT 307 should contain an indexed PackBits rect"));
        assert_ne!(
            rect.color_table_flags & 0x8000,
            0,
            "fixture should exercise an ordered ColorTable"
        );
        let image = decode_packbits_rect(&pict, &rect)
            .unwrap_or_else(|_| panic!("War PICT 307 should decode"));
        let nonblack_pixels = image
            .rgba
            .chunks_exact(4)
            .filter(|pixel| u16::from(pixel[0]) + u16::from(pixel[1]) + u16::from(pixel[2]) > 8)
            .count();
        assert!(
            nonblack_pixels
                > (usize::try_from(image.width).unwrap() * usize::try_from(image.height).unwrap())
                    / 2,
            "ordered ColorTable entries should not decode as an all-black atlas"
        );
    }

    #[test]
    fn decodes_reference_plains_atlas_to_picture_frame_size() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri should have a repository parent")
            .join("public/bundled-libraries/realmz-reference/The Family Jewels.rsrc");
        let data =
            std::fs::read(path).expect("bundled Realmz reference library should be readable");
        let pict = resource_data(&data, b"PICT", 300).expect("PICT 300 should exist");
        let decoded = decode_pict(&pict).expect("PICT 300 should decode");

        assert_eq!(decoded.image.width, 640);
        assert_eq!(decoded.image.height, 320);
        assert_eq!(decoded.row_bytes, 648);
    }

    #[test]
    fn decodes_old_style_one_bit_bits_rect() {
        let pict = bits_rect_fixture();
        let decoded = decode_pict(&pict).expect("synthetic BitsRect should decode");
        assert_eq!(decoded.format, "bits-bitmap-1");
        assert_eq!(decoded.pixel_size, 1);
        assert_eq!(decoded.image.width, 8);
        assert_eq!(decoded.image.height, 1);
        let first = &decoded.image.rgba[0..4];
        let second = &decoded.image.rgba[4..8];
        assert_eq!(first, &[0, 0, 0, 255]);
        assert_eq!(second, &[255, 255, 255, 255]);
    }

    #[test]
    fn decodes_two_bit_indexed_packbits_rect() {
        let pict = indexed_packbits_rect_fixture(2, &[0b00_01_10_11, 0, 0, 0, 0, 0, 0, 0], 32, 1);
        let command = parse_bitmap_command(&pict, 10, PACK_BITS_RECT)
            .expect("synthetic PackBitsRect command should parse");
        let rows = bitmap_rows(&pict, &command).collect::<Vec<_>>();
        assert_eq!(rows[0][0], 0b00_01_10_11);
        let decoded = decode_pict(&pict).expect("synthetic indexed PackBitsRect should decode");
        assert_eq!(decoded.format, "packbits-indexed-2");
        assert_eq!(decoded.pixel_size, 2);
        assert_eq!(decoded.image.width, 32);
        assert_eq!(decoded.image.height, 1);
        let colors = decoded.image.rgba.chunks_exact(4).collect::<Vec<_>>();
        assert_eq!(colors[0], &[0, 0, 0, 255]);
        assert_eq!(colors[1], &[255, 0, 0, 255]);
        assert_eq!(colors[2], &[0, 255, 0, 255]);
        assert_eq!(colors[3], &[0, 0, 255, 255]);
    }

    #[test]
    fn decodes_sixteen_bit_directbits_rect() {
        let pict = directbits16_rect_fixture();
        let decoded = decode_pict(&pict).expect("synthetic DirectBitsRect should decode");
        assert_eq!(decoded.format, "directbits-16-packbits");
        assert_eq!(decoded.pixel_size, 16);
        assert_eq!(decoded.image.width, 1);
        assert_eq!(decoded.image.height, 1);
        assert_eq!(&decoded.image.rgba[0..4], &[255, 0, 0, 255]);
    }

    fn pict_header(width: i16, height: i16) -> Vec<u8> {
        let mut bytes = Vec::new();
        push_u16(&mut bytes, 0);
        push_rect(&mut bytes, 0, 0, height, width);
        bytes
    }

    fn bits_rect_fixture() -> Vec<u8> {
        let mut bytes = pict_header(8, 1);
        push_u16(&mut bytes, BITS_RECT as u16);
        push_u16(&mut bytes, 1);
        push_rect(&mut bytes, 0, 0, 1, 8);
        push_rect(&mut bytes, 0, 0, 1, 8);
        push_rect(&mut bytes, 0, 0, 1, 8);
        push_u16(&mut bytes, 0);
        bytes.push(0b1010_1010);
        push_u16(&mut bytes, END_PICTURE as u16);
        bytes
    }

    fn indexed_packbits_rect_fixture(
        pixel_size: u16,
        raw_rows: &[u8],
        width: i16,
        height: i16,
    ) -> Vec<u8> {
        let mut bytes = pict_header(width, height);
        let row_bytes = raw_rows.len() / usize::try_from(height).unwrap_or(1);
        push_u16(&mut bytes, PACK_BITS_RECT as u16);
        push_u16(&mut bytes, 0x8000 | row_bytes as u16);
        push_rect(&mut bytes, 0, 0, height, width);
        push_u16(&mut bytes, 0);
        push_u16(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_u16(&mut bytes, 0);
        push_u16(&mut bytes, pixel_size);
        push_u16(&mut bytes, 1);
        push_u16(&mut bytes, pixel_size);
        push_u32(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_u16(&mut bytes, 0x8000);
        push_u16(&mut bytes, 3);
        push_color(&mut bytes, 0, 0, 0, 0);
        push_color(&mut bytes, 1, 0xffff, 0, 0);
        push_color(&mut bytes, 2, 0, 0xffff, 0);
        push_color(&mut bytes, 3, 0, 0, 0xffff);
        push_rect(&mut bytes, 0, 0, height, width);
        push_rect(&mut bytes, 0, 0, height, width);
        push_u16(&mut bytes, 0);
        for row in raw_rows.chunks_exact(row_bytes) {
            bytes.push((row.len() + 1) as u8);
            bytes.push((row.len() - 1) as u8);
            bytes.extend_from_slice(row);
        }
        push_u16(&mut bytes, END_PICTURE as u16);
        bytes
    }

    fn directbits16_rect_fixture() -> Vec<u8> {
        let mut bytes = pict_header(1, 1);
        push_u16(&mut bytes, DIRECT_BITS_RECT as u16);
        push_u32(&mut bytes, 0);
        push_u16(&mut bytes, 0x8002);
        push_rect(&mut bytes, 0, 0, 1, 1);
        push_u16(&mut bytes, 0);
        push_u16(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_u16(&mut bytes, 16);
        push_u16(&mut bytes, 16);
        push_u16(&mut bytes, 3);
        push_u16(&mut bytes, 5);
        push_u32(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_u32(&mut bytes, 0);
        push_rect(&mut bytes, 0, 0, 1, 1);
        push_rect(&mut bytes, 0, 0, 1, 1);
        push_u16(&mut bytes, 0);
        bytes.push(3);
        bytes.push(1);
        push_u16(&mut bytes, 0x7c00);
        push_u16(&mut bytes, END_PICTURE as u16);
        bytes
    }

    fn push_rect(bytes: &mut Vec<u8>, top: i16, left: i16, bottom: i16, right: i16) {
        push_u16(bytes, top as u16);
        push_u16(bytes, left as u16);
        push_u16(bytes, bottom as u16);
        push_u16(bytes, right as u16);
    }

    fn push_color(bytes: &mut Vec<u8>, index: u16, red: u16, green: u16, blue: u16) {
        push_u16(bytes, index);
        push_u16(bytes, red);
        push_u16(bytes, green);
        push_u16(bytes, blue);
    }

    fn push_u16(bytes: &mut Vec<u8>, value: u16) {
        bytes.extend_from_slice(&value.to_be_bytes());
    }

    fn push_u32(bytes: &mut Vec<u8>, value: u32) {
        bytes.extend_from_slice(&value.to_be_bytes());
    }

    fn resource_data(fork: &[u8], resource_type: &[u8; 4], resource_id: i16) -> Option<Vec<u8>> {
        let data_offset = u32_be_test(fork, 0)?;
        let map_offset = u32_be_test(fork, 4)?;
        let type_list_offset = map_offset + u16_be(fork, map_offset + 24)?;
        let type_count = u16_be(fork, type_list_offset)? + 1;
        for type_index in 0..type_count {
            let type_offset = type_list_offset + 2 + type_index * 8;
            if fork.get(type_offset..type_offset + 4)? != resource_type {
                continue;
            }
            let resource_count = u16_be(fork, type_offset + 4)? + 1;
            let reference_list_offset = type_list_offset + u16_be(fork, type_offset + 6)?;
            for resource_index in 0..resource_count {
                let reference_offset = reference_list_offset + resource_index * 12;
                if i16_be(fork, reference_offset) != resource_id {
                    continue;
                }
                let resource_offset =
                    data_offset + (u32_be_test(fork, reference_offset + 4)? & 0x00ff_ffff);
                let length = u32_be_test(fork, resource_offset)?;
                return Some(
                    fork.get(resource_offset + 4..resource_offset + 4 + length)?
                        .to_vec(),
                );
            }
        }
        None
    }

    fn u32_be_test(buffer: &[u8], offset: usize) -> Option<usize> {
        Some(u32::from_be_bytes(buffer.get(offset..offset + 4)?.try_into().ok()?) as usize)
    }
}
