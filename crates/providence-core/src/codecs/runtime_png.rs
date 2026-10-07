#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimePngError {
    InvalidDimensions { width: u32, height: u32 },
    InvalidRgbaLength { expected: usize, actual: usize },
    PayloadTooLarge,
}

impl std::fmt::Display for RuntimePngError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidDimensions { width, height } => {
                write!(formatter, "invalid PNG dimensions {width} x {height}")
            }
            Self::InvalidRgbaLength { expected, actual } => {
                write!(
                    formatter,
                    "RGBA payload has {actual} bytes; expected {expected}"
                )
            }
            Self::PayloadTooLarge => write!(formatter, "PNG payload exceeds the bounded encoder"),
        }
    }
}

impl std::error::Error for RuntimePngError {}

pub fn encode_runtime_rgba_png(
    rgba: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<u8>, RuntimePngError> {
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return Err(RuntimePngError::InvalidDimensions { width, height });
    }
    let row_bytes = (width as usize)
        .checked_mul(4)
        .ok_or(RuntimePngError::PayloadTooLarge)?;
    let expected = row_bytes
        .checked_mul(height as usize)
        .ok_or(RuntimePngError::PayloadTooLarge)?;
    if rgba.len() != expected {
        return Err(RuntimePngError::InvalidRgbaLength {
            expected,
            actual: rgba.len(),
        });
    }

    let filtered_row_bytes = row_bytes
        .checked_add(1)
        .ok_or(RuntimePngError::PayloadTooLarge)?;
    let filtered_length = filtered_row_bytes
        .checked_mul(height as usize)
        .ok_or(RuntimePngError::PayloadTooLarge)?;
    let mut filtered = Vec::with_capacity(filtered_length);
    for row in rgba.chunks_exact(row_bytes) {
        filtered.push(0);
        filtered.extend_from_slice(row);
    }

    let mut zlib = Vec::with_capacity(
        filtered
            .len()
            .checked_add(filtered.len().div_ceil(u16::MAX as usize) * 5 + 6)
            .ok_or(RuntimePngError::PayloadTooLarge)?,
    );
    zlib.extend_from_slice(&[0x78, 0x01]);
    let block_count = filtered.len().div_ceil(u16::MAX as usize);
    for (index, block) in filtered.chunks(u16::MAX as usize).enumerate() {
        zlib.push(if index + 1 == block_count { 1 } else { 0 });
        let length = block.len() as u16;
        zlib.extend_from_slice(&length.to_le_bytes());
        zlib.extend_from_slice(&(!length).to_le_bytes());
        zlib.extend_from_slice(block);
    }
    zlib.extend_from_slice(&adler32(&filtered).to_be_bytes());

    let mut png = Vec::with_capacity(
        zlib.len()
            .checked_add(57)
            .ok_or(RuntimePngError::PayloadTooLarge)?,
    );
    png.extend_from_slice(b"\x89PNG\r\n\x1a\n");
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    push_chunk(&mut png, *b"IHDR", &ihdr)?;
    push_chunk(&mut png, *b"IDAT", &zlib)?;
    push_chunk(&mut png, *b"IEND", &[])?;
    Ok(png)
}

fn push_chunk(png: &mut Vec<u8>, chunk_type: [u8; 4], data: &[u8]) -> Result<(), RuntimePngError> {
    let length = u32::try_from(data.len()).map_err(|_| RuntimePngError::PayloadTooLarge)?;
    png.extend_from_slice(&length.to_be_bytes());
    png.extend_from_slice(&chunk_type);
    png.extend_from_slice(data);
    let mut crc = Crc32::new();
    crc.update(&chunk_type);
    crc.update(data);
    png.extend_from_slice(&crc.finish().to_be_bytes());
    Ok(())
}

fn adler32(bytes: &[u8]) -> u32 {
    const MODULUS: u32 = 65_521;
    let mut first = 1u32;
    let mut second = 0u32;
    for byte in bytes {
        first = (first + u32::from(*byte)) % MODULUS;
        second = (second + first) % MODULUS;
    }
    (second << 16) | first
}

struct Crc32(u32);

impl Crc32 {
    fn new() -> Self {
        Self(u32::MAX)
    }

    fn update(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.0 ^= u32::from(*byte);
            for _ in 0..8 {
                self.0 = if self.0 & 1 == 1 {
                    (self.0 >> 1) ^ 0xedb8_8320
                } else {
                    self.0 >> 1
                };
            }
        }
    }

    fn finish(self) -> u32 {
        !self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn png_is_byte_deterministic_and_round_trips_stored_rgba_rows() {
        let rgba = [
            255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 248, 240, 232, 255,
        ];
        let first = encode_runtime_rgba_png(&rgba, 2, 2).unwrap();
        let second = encode_runtime_rgba_png(&rgba, 2, 2).unwrap();
        assert_eq!(first, second);
        assert_eq!(&first[..8], b"\x89PNG\r\n\x1a\n");
        let (width, height, decoded) = decode_stored_rgba_png(&first);
        assert_eq!((width, height), (2, 2));
        assert_eq!(decoded, rgba);
    }

    #[test]
    fn png_uses_multiple_valid_stored_blocks_for_large_images() {
        let rgba = vec![37; 256 * 256 * 4];
        let png = encode_runtime_rgba_png(&rgba, 256, 256).unwrap();
        let (width, height, decoded) = decode_stored_rgba_png(&png);
        assert_eq!((width, height), (256, 256));
        assert_eq!(decoded, rgba);
    }

    #[test]
    fn png_refuses_invalid_geometry_and_payload_length() {
        assert_eq!(
            encode_runtime_rgba_png(&[], 0, 1),
            Err(RuntimePngError::InvalidDimensions {
                width: 0,
                height: 1,
            })
        );
        assert_eq!(
            encode_runtime_rgba_png(&[0; 7], 2, 1),
            Err(RuntimePngError::InvalidRgbaLength {
                expected: 8,
                actual: 7,
            })
        );
    }

    fn decode_stored_rgba_png(png: &[u8]) -> (u32, u32, Vec<u8>) {
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
        let mut offset = 8;
        let mut width = 0;
        let mut height = 0;
        let mut idat = Vec::new();
        while offset < png.len() {
            let length = u32::from_be_bytes(png[offset..offset + 4].try_into().unwrap()) as usize;
            let chunk_type: [u8; 4] = png[offset + 4..offset + 8].try_into().unwrap();
            let data = &png[offset + 8..offset + 8 + length];
            let expected_crc = u32::from_be_bytes(
                png[offset + 8 + length..offset + 12 + length]
                    .try_into()
                    .unwrap(),
            );
            let mut crc = Crc32::new();
            crc.update(&chunk_type);
            crc.update(data);
            assert_eq!(crc.finish(), expected_crc);
            match &chunk_type {
                b"IHDR" => {
                    width = u32::from_be_bytes(data[0..4].try_into().unwrap());
                    height = u32::from_be_bytes(data[4..8].try_into().unwrap());
                    assert_eq!(&data[8..], &[8, 6, 0, 0, 0]);
                }
                b"IDAT" => idat.extend_from_slice(data),
                b"IEND" => break,
                _ => panic!("unexpected PNG chunk"),
            }
            offset += 12 + length;
        }
        assert_eq!(&idat[..2], &[0x78, 0x01]);
        let expected_adler = u32::from_be_bytes(idat[idat.len() - 4..].try_into().unwrap());
        let mut compressed_offset = 2;
        let mut filtered = Vec::new();
        loop {
            let header = idat[compressed_offset];
            compressed_offset += 1;
            assert_eq!(header & 0x06, 0);
            let length = u16::from_le_bytes(
                idat[compressed_offset..compressed_offset + 2]
                    .try_into()
                    .unwrap(),
            );
            let inverse = u16::from_le_bytes(
                idat[compressed_offset + 2..compressed_offset + 4]
                    .try_into()
                    .unwrap(),
            );
            assert_eq!(length, !inverse);
            compressed_offset += 4;
            filtered.extend_from_slice(
                &idat[compressed_offset..compressed_offset + usize::from(length)],
            );
            compressed_offset += usize::from(length);
            if header & 1 == 1 {
                break;
            }
        }
        assert_eq!(compressed_offset + 4, idat.len());
        assert_eq!(adler32(&filtered), expected_adler);
        let row_bytes = width as usize * 4;
        let mut rgba = Vec::with_capacity(row_bytes * height as usize);
        for row in filtered.chunks_exact(row_bytes + 1) {
            assert_eq!(row[0], 0);
            rgba.extend_from_slice(&row[1..]);
        }
        (width, height, rgba)
    }
}
