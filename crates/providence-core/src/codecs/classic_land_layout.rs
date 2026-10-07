use crate::model::LandLayout;

pub const LAND_LAYOUT_ROWS: usize = 8;
pub const LAND_LAYOUT_COLUMNS: usize = 16;
pub const LAND_LAYOUT_CELLS: usize = LAND_LAYOUT_ROWS * LAND_LAYOUT_COLUMNS;
pub const LAND_LAYOUT_CELL_BYTES: usize = 2;
pub const LAND_LAYOUT_BYTES: usize = LAND_LAYOUT_CELLS * LAND_LAYOUT_CELL_BYTES;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LandLayoutCodecError {
    Truncated { expected: usize, actual: usize },
    InvalidCellCount { expected: usize, actual: usize },
}

impl std::fmt::Display for LandLayoutCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Truncated { expected, actual } => write!(
                formatter,
                "Layout must contain at least {expected} bytes; found {actual}"
            ),
            Self::InvalidCellCount { expected, actual } => write!(
                formatter,
                "Layout must contain exactly {expected} cells; found {actual}"
            ),
        }
    }
}

impl std::error::Error for LandLayoutCodecError {}

pub fn decode_land_layout(bytes: &[u8]) -> Result<LandLayout, LandLayoutCodecError> {
    if bytes.len() < LAND_LAYOUT_BYTES {
        return Err(LandLayoutCodecError::Truncated {
            expected: LAND_LAYOUT_BYTES,
            actual: bytes.len(),
        });
    }
    Ok(LandLayout {
        cells: bytes[..LAND_LAYOUT_BYTES]
            .chunks_exact(LAND_LAYOUT_CELL_BYTES)
            .map(|cell| i16::from_be_bytes([cell[0], cell[1]]))
            .collect(),
    })
}

pub fn encode_land_layout(
    layout: &LandLayout,
    compatibility_source: Option<&[u8]>,
) -> Result<Vec<u8>, LandLayoutCodecError> {
    if layout.cells.len() != LAND_LAYOUT_CELLS {
        return Err(LandLayoutCodecError::InvalidCellCount {
            expected: LAND_LAYOUT_CELLS,
            actual: layout.cells.len(),
        });
    }
    if let Some(source) = compatibility_source
        && source.len() < LAND_LAYOUT_BYTES
    {
        return Err(LandLayoutCodecError::Truncated {
            expected: LAND_LAYOUT_BYTES,
            actual: source.len(),
        });
    }
    let mut output = compatibility_source
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| vec![0; LAND_LAYOUT_BYTES]);
    for (index, value) in layout.cells.iter().enumerate() {
        let offset = index * LAND_LAYOUT_CELL_BYTES;
        output[offset..offset + LAND_LAYOUT_CELL_BYTES].copy_from_slice(&value.to_be_bytes());
    }
    Ok(output)
}

pub fn classic_land_index(value: i16) -> Option<u32> {
    match value {
        0 => None,
        -1 => Some(0),
        positive if positive > 0 => Some(positive as u32),
        _ => None,
    }
}

pub fn classic_layout_value(native_index: u32) -> Option<i16> {
    match native_index {
        0 => Some(-1),
        value => i16::try_from(value).ok(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_edit_round_trip_preserves_the_runtime_grid_and_imported_suffix() {
        let mut source = vec![0xa5; LAND_LAYOUT_BYTES + 256];
        source[0..2].copy_from_slice(&(-1_i16).to_be_bytes());
        source[2..4].copy_from_slice(&17_i16.to_be_bytes());
        source[LAND_LAYOUT_BYTES - 2..LAND_LAYOUT_BYTES].copy_from_slice(&32767_i16.to_be_bytes());

        let decoded = decode_land_layout(&source).expect("decode Layout");
        let encoded = encode_land_layout(&decoded, Some(&source)).expect("encode Layout");

        assert_eq!(decoded.cells.len(), LAND_LAYOUT_CELLS);
        assert_eq!(decoded.cells[0], -1);
        assert_eq!(decoded.cells[1], 17);
        assert_eq!(decoded.cells[LAND_LAYOUT_CELLS - 1], 32767);
        assert_eq!(encoded, source);
    }

    #[test]
    fn one_cell_edit_changes_only_its_owned_big_endian_short() {
        let source = vec![0xa5; LAND_LAYOUT_BYTES + 3];
        let mut decoded = decode_land_layout(&source).expect("decode Layout");
        decoded.cells[37] = 9;

        let encoded = encode_land_layout(&decoded, Some(&source)).expect("encode Layout");
        let differences = source
            .iter()
            .zip(&encoded)
            .enumerate()
            .filter_map(|(index, (before, after))| (before != after).then_some(index))
            .collect::<Vec<_>>();

        assert_eq!(differences, vec![74, 75]);
        assert_eq!(&encoded[LAND_LAYOUT_BYTES..], &[0xa5; 3]);
    }

    #[test]
    fn native_level_zero_uses_minus_one_and_other_negative_values_are_invalid() {
        assert_eq!(classic_layout_value(0), Some(-1));
        assert_eq!(classic_layout_value(12), Some(12));
        assert_eq!(classic_layout_value(32768), None);
        assert_eq!(classic_land_index(-1), Some(0));
        assert_eq!(classic_land_index(12), Some(12));
        assert_eq!(classic_land_index(0), None);
        assert_eq!(classic_land_index(-2), None);
    }

    #[test]
    fn truncated_or_noncanonical_geometry_is_rejected() {
        assert_eq!(
            decode_land_layout(&vec![0; LAND_LAYOUT_BYTES - 1]),
            Err(LandLayoutCodecError::Truncated {
                expected: LAND_LAYOUT_BYTES,
                actual: LAND_LAYOUT_BYTES - 1,
            })
        );
        assert!(matches!(
            encode_land_layout(
                &LandLayout {
                    cells: vec![0; 127]
                },
                None
            ),
            Err(LandLayoutCodecError::InvalidCellCount { actual: 127, .. })
        ));
    }
}
