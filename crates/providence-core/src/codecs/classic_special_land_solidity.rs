pub const SPECIAL_LAND_SOLIDITY_BYTES: usize = 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpecialLandSolidityCodecError {
    Length { expected: usize, actual: usize },
}

impl std::fmt::Display for SpecialLandSolidityCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Length { expected, actual } => write!(
                formatter,
                "Data Solids must contain exactly {expected} Boolean bytes; found {actual}"
            ),
        }
    }
}

impl std::error::Error for SpecialLandSolidityCodecError {}

pub fn decode_special_land_solidity(
    bytes: &[u8],
) -> Result<Vec<bool>, SpecialLandSolidityCodecError> {
    if bytes.len() != SPECIAL_LAND_SOLIDITY_BYTES {
        return Err(SpecialLandSolidityCodecError::Length {
            expected: SPECIAL_LAND_SOLIDITY_BYTES,
            actual: bytes.len(),
        });
    }
    Ok(bytes.iter().map(|value| *value != 0).collect())
}

pub fn encode_special_land_solidity(
    solid: &[bool],
    imported: Option<&[u8]>,
) -> Result<Vec<u8>, SpecialLandSolidityCodecError> {
    if solid.len() != SPECIAL_LAND_SOLIDITY_BYTES {
        return Err(SpecialLandSolidityCodecError::Length {
            expected: SPECIAL_LAND_SOLIDITY_BYTES,
            actual: solid.len(),
        });
    }
    let mut encoded = match imported {
        Some(bytes) => {
            decode_special_land_solidity(bytes)?;
            bytes.to_vec()
        }
        None => vec![0; SPECIAL_LAND_SOLIDITY_BYTES],
    };
    for (index, value) in solid.iter().copied().enumerate() {
        if (encoded[index] != 0) != value {
            encoded[index] = u8::from(value);
        }
    }
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_edit_preserves_noncanonical_boolean_bytes_and_one_edit_is_narrow() {
        let mut source = vec![0; SPECIAL_LAND_SOLIDITY_BYTES];
        source[13] = 0xff;
        source[88] = 2;
        let mut solid = decode_special_land_solidity(&source).expect("decode Data Solids");

        assert_eq!(
            encode_special_land_solidity(&solid, Some(&source)).unwrap(),
            source
        );
        solid[88] = false;
        let edited = encode_special_land_solidity(&solid, Some(&source)).unwrap();
        assert_eq!(edited[13], 0xff);
        assert_eq!(edited[88], 0);
        assert_eq!(
            edited
                .iter()
                .zip(source.iter())
                .filter(|(left, right)| left != right)
                .count(),
            1
        );
    }
}
