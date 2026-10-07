use super::{ScenarioIconCodecError, encode_indexed_cicn};

pub const MONSTER_APPEARANCE_CANVAS_PRESETS: &[(u32, u32)] =
    &[(32, 32), (32, 64), (64, 32), (64, 64)];

pub fn encode_monster_appearance_cicn(
    rgba: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<u8>, ScenarioIconCodecError> {
    encode_monster_appearance_cicn_with_dither(rgba, width, height, false)
}

pub fn encode_monster_appearance_cicn_with_dither(
    rgba: &[u8],
    width: u32,
    height: u32,
    dither: bool,
) -> Result<Vec<u8>, ScenarioIconCodecError> {
    if !MONSTER_APPEARANCE_CANVAS_PRESETS.contains(&(width, height)) {
        return Err(ScenarioIconCodecError::InvalidDimensions { width, height });
    }
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or(ScenarioIconCodecError::InvalidDimensions { width, height })?;
    if rgba.len() != expected {
        return Err(ScenarioIconCodecError::InvalidRgbaLength {
            expected,
            actual: rgba.len(),
        });
    }
    encode_indexed_cicn(rgba, width as usize, height as usize, dither)
}

pub fn mirror_rgba_horizontally(
    rgba: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<u8>, ScenarioIconCodecError> {
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return Err(ScenarioIconCodecError::InvalidDimensions { width, height });
    }
    let expected = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or(ScenarioIconCodecError::InvalidDimensions { width, height })?;
    if rgba.len() != expected {
        return Err(ScenarioIconCodecError::InvalidRgbaLength {
            expected,
            actual: rgba.len(),
        });
    }
    let width = width as usize;
    let mut mirrored = vec![0; expected];
    for row in rgba
        .chunks_exact(width * 4)
        .zip(mirrored.chunks_exact_mut(width * 4))
    {
        let (source, target) = row;
        for x in 0..width {
            let source_offset = x * 4;
            let target_offset = (width - 1 - x) * 4;
            target[target_offset..target_offset + 4]
                .copy_from_slice(&source[source_offset..source_offset + 4]);
        }
    }
    Ok(mirrored)
}
