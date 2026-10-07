use std::collections::{BTreeMap, BTreeSet};

use crate::model::{AssetDescriptor, StableId};

use super::{
    CLASSIC_SCENARIO_RESOURCE_SOURCE, ResourceEntry, ResourceForkError, empty_resource_fork,
    merge_resource_entries_preserving_unowned_duplicates,
    parse_resource_entries_preserving_duplicates,
};

#[cfg(test)]
use super::parse_resource_entries;

#[path = "classic_scenario_pictures/indexed_writer.rs"]
mod indexed_writer;
#[path = "classic_scenario_pictures/landlook_palette.rs"]
mod landlook_palette;
pub use landlook_palette::encode_landlook_artwork_pict;

#[cfg(test)]
#[path = "classic_scenario_pictures/packbits_tests.rs"]
mod packbits_boundaries;

pub const SCENARIO_PICTURE_MIN_ID: i16 = 30_000;
pub const SCENARIO_DISPLAY_PICTURE_MAX_ID: i16 = 30_127;
pub const SCENARIO_SPLASH_PICTURE_ID: i16 = 30_128;
pub const SCENARIO_PICTURE_MAX_ID: i16 = SCENARIO_SPLASH_PICTURE_ID;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScenarioPictureCodecError {
    InvalidDimensions {
        width: u32,
        height: u32,
    },
    InvalidRgbaLength {
        expected: usize,
        actual: usize,
    },
    InvalidResourceIdentity(StableId),
    DuplicateResourceId(i16),
    MissingClassicPayload(StableId),
    ClassicPayloadLengthMismatch {
        identity: StableId,
        expected: u64,
        actual: u64,
    },
    ResourceFork(ResourceForkError),
}

impl std::fmt::Display for ScenarioPictureCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidDimensions { width, height } => {
                write!(
                    formatter,
                    "invalid scenario picture dimensions {width} x {height}"
                )
            }
            Self::InvalidRgbaLength { expected, actual } => write!(
                formatter,
                "scenario picture RGBA payload has {actual} bytes; expected {expected}"
            ),
            Self::InvalidResourceIdentity(identity) => write!(
                formatter,
                "asset '{}' is not a scenario PICT resource in the certified 30000-30128 range",
                identity.0
            ),
            Self::DuplicateResourceId(resource_id) => write!(
                formatter,
                "duplicate scenario PICT resource ID {resource_id}"
            ),
            Self::MissingClassicPayload(identity) => write!(
                formatter,
                "scenario picture '{}' has no compiled Classic PICT payload",
                identity.0
            ),
            Self::ClassicPayloadLengthMismatch {
                identity,
                expected,
                actual,
            } => write!(
                formatter,
                "scenario picture '{}' declares {expected} Classic bytes but its payload contains {actual}",
                identity.0
            ),
            Self::ResourceFork(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for ScenarioPictureCodecError {}

impl From<ResourceForkError> for ScenarioPictureCodecError {
    fn from(error: ResourceForkError) -> Self {
        Self::ResourceFork(error)
    }
}

pub fn encode_scenario_picture_pict(
    rgba: &[u8],
    width: u32,
    height: u32,
    dither: bool,
) -> Result<Vec<u8>, ScenarioPictureCodecError> {
    if width == 0 || height == 0 || width > i16::MAX as u32 || height > i16::MAX as u32 {
        return Err(ScenarioPictureCodecError::InvalidDimensions { width, height });
    }
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or(ScenarioPictureCodecError::InvalidDimensions { width, height })?;
    if rgba.len() != expected {
        return Err(ScenarioPictureCodecError::InvalidRgbaLength {
            expected,
            actual: rgba.len(),
        });
    }

    let (indices, palette) = quantize_rgba_to_palette(rgba, width as usize, dither);
    Ok(indexed_writer::encode(&indices, &palette, width, height))
}

pub fn compile_scenario_picture_resource_fork(
    assets: &[AssetDescriptor],
    payloads: &BTreeMap<String, Vec<u8>>,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, ScenarioPictureCodecError> {
    let original = compatibility_source
        .map(ToOwned::to_owned)
        .unwrap_or_else(empty_resource_fork);
    let original_entries = parse_resource_entries_preserving_duplicates(&original)?;
    let mut updates = Vec::new();
    let mut owned_ids = BTreeSet::new();
    for asset in assets.iter().filter(|asset| asset.kind == "picture") {
        let Some(resource) = &asset.classic_resource else {
            return Err(ScenarioPictureCodecError::InvalidResourceIdentity(
                asset.identity.clone(),
            ));
        };
        let Ok(resource_id) = i16::try_from(resource.resource_id) else {
            return Err(ScenarioPictureCodecError::InvalidResourceIdentity(
                asset.identity.clone(),
            ));
        };
        if resource.resource_type != "PICT" {
            return Err(ScenarioPictureCodecError::InvalidResourceIdentity(
                asset.identity.clone(),
            ));
        }
        if !owned_ids.insert(resource_id) {
            return Err(ScenarioPictureCodecError::DuplicateResourceId(resource_id));
        }
        let blob = asset.classic_payload_blob.as_ref().ok_or_else(|| {
            ScenarioPictureCodecError::MissingClassicPayload(asset.identity.clone())
        })?;
        let payload = payloads.get(&blob.0).ok_or_else(|| {
            ScenarioPictureCodecError::MissingClassicPayload(asset.identity.clone())
        })?;
        if let Some(expected) = asset.classic_payload_byte_length
            && expected != payload.len() as u64
        {
            return Err(ScenarioPictureCodecError::ClassicPayloadLengthMismatch {
                identity: asset.identity.clone(),
                expected,
                actual: payload.len() as u64,
            });
        }
        if original_entries.iter().any(|entry| {
            entry.resource_type == *b"PICT" && entry.id == resource_id && entry.data == *payload
        }) {
            continue;
        }
        updates.push(ResourceEntry {
            resource_type: *b"PICT",
            id: resource_id,
            name: if asset.source == CLASSIC_SCENARIO_RESOURCE_SOURCE {
                original_entries
                    .iter()
                    .find(|entry| entry.resource_type == *b"PICT" && entry.id == resource_id)
                    .map_or_else(|| asset.label.clone(), |entry| entry.name.clone())
            } else {
                asset.label.clone()
            },
            attributes: original_entries
                .iter()
                .find(|entry| entry.resource_type == *b"PICT" && entry.id == resource_id)
                .map_or(0, |entry| entry.attributes),
            data: payload.clone(),
        });
    }
    merge_resource_entries_preserving_unowned_duplicates(&original, updates).map_err(Into::into)
}

#[derive(Clone)]
struct QuantizedColor {
    color: [u8; 3],
    count: usize,
}

pub(super) fn quantize_rgba_to_palette(
    rgba: &[u8],
    width: usize,
    dither: bool,
) -> (Vec<u8>, Vec<[u8; 3]>) {
    let palette = adaptive_palette(rgba);
    let indices = if dither {
        quantize_with_floyd_steinberg(rgba, width, &palette)
    } else {
        quantize_nearest(rgba, &palette)
    };
    (indices, palette)
}

fn adaptive_palette(rgba: &[u8]) -> Vec<[u8; 3]> {
    let mut histogram = BTreeMap::<[u8; 3], usize>::new();
    for pixel in rgba.chunks_exact(4) {
        let color = [pixel[0] & 0xf8, pixel[1] & 0xf8, pixel[2] & 0xf8];
        *histogram.entry(color).or_insert(0) += 1;
    }
    let colors = histogram
        .into_iter()
        .map(|(color, count)| QuantizedColor { color, count })
        .collect::<Vec<_>>();
    if colors.is_empty() {
        return vec![[0, 0, 0]];
    }
    if colors.len() <= 256 {
        return colors.into_iter().map(|entry| entry.color).collect();
    }
    let mut buckets = vec![colors];
    while buckets.len() < 256 {
        let Some(index) = buckets
            .iter()
            .enumerate()
            .filter(|(_, bucket)| bucket.len() > 1)
            .max_by_key(|(_, bucket)| bucket_score(bucket))
            .map(|(index, _)| index)
        else {
            break;
        };
        let bucket = buckets.swap_remove(index);
        let (left, right) = split_color_bucket(bucket);
        if left.is_empty() || right.is_empty() {
            buckets.push([left, right].concat());
            break;
        }
        buckets.push(left);
        buckets.push(right);
    }
    let mut palette = buckets
        .iter()
        .map(|bucket| weighted_average_color(bucket))
        .collect::<Vec<_>>();
    palette.sort();
    palette.truncate(256);
    palette
}

fn bucket_score(bucket: &[QuantizedColor]) -> usize {
    let (minimum, maximum) = bucket_bounds(bucket);
    let range = (0..3)
        .map(|channel| usize::from(maximum[channel]) - usize::from(minimum[channel]))
        .max()
        .unwrap_or(0);
    range * bucket.iter().map(|entry| entry.count).sum::<usize>()
}

fn split_color_bucket(
    mut bucket: Vec<QuantizedColor>,
) -> (Vec<QuantizedColor>, Vec<QuantizedColor>) {
    let (minimum, maximum) = bucket_bounds(&bucket);
    let channel = (0..3)
        .max_by_key(|channel| usize::from(maximum[*channel]) - usize::from(minimum[*channel]))
        .unwrap_or(0);
    bucket.sort_by_key(|entry| entry.color[channel]);
    let total = bucket.iter().map(|entry| entry.count).sum::<usize>();
    let mut running = 0;
    let mut split = 1;
    for (index, entry) in bucket.iter().enumerate() {
        running += entry.count;
        if running >= total / 2 {
            split = (index + 1).clamp(1, bucket.len().saturating_sub(1));
            break;
        }
    }
    let right = bucket.split_off(split);
    (bucket, right)
}

fn bucket_bounds(bucket: &[QuantizedColor]) -> ([u8; 3], [u8; 3]) {
    let mut minimum = [u8::MAX; 3];
    let mut maximum = [u8::MIN; 3];
    for entry in bucket {
        for channel in 0..3 {
            minimum[channel] = minimum[channel].min(entry.color[channel]);
            maximum[channel] = maximum[channel].max(entry.color[channel]);
        }
    }
    (minimum, maximum)
}

fn weighted_average_color(bucket: &[QuantizedColor]) -> [u8; 3] {
    let total = bucket.iter().map(|entry| entry.count).sum::<usize>().max(1);
    let mut sums = [0usize; 3];
    for entry in bucket {
        for (channel, sum) in sums.iter_mut().enumerate() {
            *sum += usize::from(entry.color[channel]) * entry.count;
        }
    }
    [
        (sums[0] / total) as u8,
        (sums[1] / total) as u8,
        (sums[2] / total) as u8,
    ]
}

fn quantize_nearest(rgba: &[u8], palette: &[[u8; 3]]) -> Vec<u8> {
    rgba.chunks_exact(4)
        .map(|pixel| nearest_palette_index(palette, [pixel[0], pixel[1], pixel[2]]))
        .collect()
}

fn quantize_with_floyd_steinberg(rgba: &[u8], width: usize, palette: &[[u8; 3]]) -> Vec<u8> {
    let pixels = rgba.len() / 4;
    let height = pixels.div_ceil(width);
    let mut work = rgba
        .chunks_exact(4)
        .map(|pixel| [pixel[0] as f32, pixel[1] as f32, pixel[2] as f32])
        .collect::<Vec<_>>();
    let mut indices = vec![0u8; pixels];
    for y in 0..height {
        for x in 0..width {
            let index = y * width + x;
            if index >= pixels {
                continue;
            }
            let old = [
                work[index][0].clamp(0.0, 255.0) as u8,
                work[index][1].clamp(0.0, 255.0) as u8,
                work[index][2].clamp(0.0, 255.0) as u8,
            ];
            let palette_index = nearest_palette_index(palette, old);
            let new = palette[usize::from(palette_index)];
            indices[index] = palette_index;
            let error = [
                old[0] as f32 - new[0] as f32,
                old[1] as f32 - new[1] as f32,
                old[2] as f32 - new[2] as f32,
            ];
            diffuse_error(&mut work, pixels, width, x + 1, y, error, 7.0 / 16.0);
            if x > 0 {
                diffuse_error(&mut work, pixels, width, x - 1, y + 1, error, 3.0 / 16.0);
            }
            diffuse_error(&mut work, pixels, width, x, y + 1, error, 5.0 / 16.0);
            diffuse_error(&mut work, pixels, width, x + 1, y + 1, error, 1.0 / 16.0);
        }
    }
    indices
}

fn diffuse_error(
    work: &mut [[f32; 3]],
    pixels: usize,
    width: usize,
    x: usize,
    y: usize,
    error: [f32; 3],
    factor: f32,
) {
    let index = y * width + x;
    if index >= pixels {
        return;
    }
    for (channel, value) in error.iter().enumerate() {
        work[index][channel] += value * factor;
    }
}

fn nearest_palette_index(palette: &[[u8; 3]], color: [u8; 3]) -> u8 {
    palette
        .iter()
        .enumerate()
        .min_by_key(|(_, candidate)| {
            let red = i32::from(color[0]) - i32::from(candidate[0]);
            let green = i32::from(color[1]) - i32::from(candidate[1]);
            let blue = i32::from(color[2]) - i32::from(candidate[2]);
            red * red + green * green + blue * blue
        })
        .map(|(index, _)| index as u8)
        .unwrap_or(0)
}

fn packbits(row: &[u8]) -> Vec<u8> {
    let mut output = Vec::new();
    let mut cursor = 0;
    while cursor < row.len() {
        let mut run = 1;
        while cursor + run < row.len() && row[cursor + run] == row[cursor] && run < 128 {
            run += 1;
        }
        if run >= 3 {
            output.push((257 - run) as u8);
            output.push(row[cursor]);
            cursor += run;
            continue;
        }
        let literal_start = cursor;
        cursor += run;
        while cursor < row.len() {
            let mut next_run = 1;
            while cursor + next_run < row.len()
                && row[cursor + next_run] == row[cursor]
                && next_run < 128
            {
                next_run += 1;
            }
            if next_run >= 3 || cursor - literal_start >= 128 {
                break;
            }
            cursor += next_run.min(128 - (cursor - literal_start));
        }
        let length = cursor - literal_start;
        output.push((length - 1) as u8);
        output.extend_from_slice(&row[literal_start..cursor]);
    }
    output
}

fn push_rect(output: &mut Vec<u8>, top: i16, left: i16, bottom: i16, right: i16) {
    output.extend_from_slice(&top.to_be_bytes());
    output.extend_from_slice(&left.to_be_bytes());
    output.extend_from_slice(&bottom.to_be_bytes());
    output.extend_from_slice(&right.to_be_bytes());
}

fn write_rect(buffer: &mut [u8], offset: usize, top: i16, left: i16, bottom: i16, right: i16) {
    buffer[offset..offset + 2].copy_from_slice(&top.to_be_bytes());
    buffer[offset + 2..offset + 4].copy_from_slice(&left.to_be_bytes());
    buffer[offset + 4..offset + 6].copy_from_slice(&bottom.to_be_bytes());
    buffer[offset + 6..offset + 8].copy_from_slice(&right.to_be_bytes());
}

fn push_u16(output: &mut Vec<u8>, value: usize) {
    output.extend_from_slice(&(value as u16).to_be_bytes());
}

fn push_u32(output: &mut Vec<u8>, value: usize) {
    output.extend_from_slice(&(value as u32).to_be_bytes());
}

#[cfg(test)]
mod tests {
    use crate::model::{BlobId, ClassicResourceKey};

    use super::*;

    fn picture(blob: &str, bytes: usize) -> AssetDescriptor {
        AssetDescriptor {
            identity: StableId("picture:30000".into()),
            label: "The Observatory Door Beyond the Long Western Passage".into(),
            kind: "picture".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "PICT".into(),
                resource_id: 30_000,
            }),
            scenario_music_slot: None,
            blob: BlobId(format!("sha256:{}", "a".repeat(64))),
            byte_length: 8,
            classic_payload_blob: Some(BlobId(blob.into())),
            classic_payload_byte_length: Some(bytes as u64),
            extension: Some("png".into()),
            width: Some(2),
            height: Some(2),
            duration_ms: None,
            sample_rate: None,
            channels: None,
            tile_width: None,
            tile_height: None,
            columns: None,
            rows: None,
            landlook: None,
            base_tile: None,
            source: "controlled RGBA fixture".into(),
        }
    }

    #[test]
    fn pict_encoder_is_deterministic_and_names_exact_geometry() {
        let rgba = [0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255];
        let first = encode_scenario_picture_pict(&rgba, 2, 2, true).unwrap();
        let second = encode_scenario_picture_pict(&rgba, 2, 2, true).unwrap();
        assert_eq!(first, second);
        assert_eq!(&first[2..10], &[0, 0, 0, 0, 0, 2, 0, 2]);
        assert_eq!(&first[10..16], &[0, 0x11, 2, 0xff, 0x0c, 0]);
        assert_eq!(&first[first.len() - 2..], &[0, 255]);
        let decoded = super::super::decode_classic_pict(&first).unwrap();
        assert_eq!(
            decoded.stream_version,
            super::super::PictStreamVersion::Version2
        );
        assert_eq!((decoded.width, decoded.height), (2, 2));
    }

    #[test]
    fn no_edit_resource_merge_preserves_the_container_byte_for_byte() {
        let payload = vec![1, 2, 3, 4];
        let source = super::super::write_resource_fork(&[
            ResourceEntry {
                resource_type: *b"PICT",
                id: 30_000,
                name: "Existing".into(),
                attributes: 0,
                data: payload.clone(),
            },
            ResourceEntry {
                resource_type: *b"STR#",
                id: 800,
                name: "Preserve me".into(),
                attributes: 7,
                data: vec![9, 8, 7],
            },
        ])
        .unwrap();
        let blob = format!("sha256:{}", "b".repeat(64));
        let output = compile_scenario_picture_resource_fork(
            &[picture(&blob, payload.len())],
            &BTreeMap::from([(blob, payload)]),
            Some(&source),
        )
        .unwrap();
        assert_eq!(output, source);
    }

    #[test]
    fn edited_picture_preserves_every_unrelated_resource() {
        let source = super::super::write_resource_fork(&[
            ResourceEntry {
                resource_type: *b"PICT",
                id: 30_000,
                name: "Old".into(),
                attributes: 0,
                data: vec![1, 2],
            },
            ResourceEntry {
                resource_type: *b"STR#",
                id: 800,
                name: "Preserve me".into(),
                attributes: 7,
                data: vec![9, 8, 7],
            },
        ])
        .unwrap();
        let blob = format!("sha256:{}", "c".repeat(64));
        let output = compile_scenario_picture_resource_fork(
            &[picture(&blob, 3)],
            &BTreeMap::from([(blob, vec![4, 5, 6])]),
            Some(&source),
        )
        .unwrap();
        let entries = parse_resource_entries(&output).unwrap();
        assert_eq!(
            entries
                .iter()
                .find(|entry| entry.resource_type == *b"PICT")
                .unwrap()
                .data,
            vec![4, 5, 6]
        );
        let preserved = entries
            .iter()
            .find(|entry| entry.resource_type == *b"STR#")
            .unwrap();
        assert_eq!(preserved.name, "Preserve me");
        assert_eq!(preserved.attributes, 7);
        assert_eq!(preserved.data, vec![9, 8, 7]);
    }

    #[test]
    fn duplicate_picture_ids_are_rejected_before_resource_assembly() {
        let blob = format!("sha256:{}", "d".repeat(64));
        let mut duplicate = picture(&blob, 3);
        duplicate.identity = StableId("picture:duplicate".into());

        let error = compile_scenario_picture_resource_fork(
            &[picture(&blob, 3), duplicate],
            &BTreeMap::from([(blob, vec![4, 5, 6])]),
            None,
        )
        .unwrap_err();

        assert_eq!(
            error,
            ScenarioPictureCodecError::DuplicateResourceId(30_000)
        );
    }
}
