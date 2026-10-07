use std::io::Cursor;

pub(crate) fn validate_png(
    bytes: &[u8],
    width: Option<u32>,
    height: Option<u32>,
) -> Result<(), String> {
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("The map picture exceeds the preview limit.".into());
    }
    let decoder = png::Decoder::new(Cursor::new(bytes));
    let mut reader = decoder
        .read_info()
        .map_err(|error| format!("The map picture cannot be decoded: {error}"))?;
    if Some(reader.info().width) != width || Some(reader.info().height) != height {
        return Err("The map picture's pixels do not match its declared grid.".into());
    }
    let size = reader
        .output_buffer_size()
        .ok_or("The map picture exceeds the decoder limit.")?;
    if size > 4 * 1024 * 1024 {
        return Err("The map picture exceeds the preview limit.".into());
    }
    let mut buffer = vec![0; size];
    reader
        .next_frame(&mut buffer)
        .map_err(|error| format!("The map picture cannot be decoded: {error}"))?;
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn png(width: u32, height: u32) -> Vec<u8> {
        let mut result = Vec::new();
        let mut encoder = png::Encoder::new(&mut result, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().unwrap();
        writer
            .write_image_data(&vec![255; (width * height * 4) as usize])
            .unwrap();
        drop(writer);
        result
    }

    #[test]
    fn decoder_rejects_malformed_and_misdeclared_present_resources() {
        assert!(validate_png(b"not a PNG", Some(640), Some(320)).is_err());
        let bytes = png(640, 320);
        assert!(validate_png(&bytes, Some(640), Some(320)).is_ok());
        assert!(validate_png(&bytes, Some(640), Some(640)).is_err());
    }
}
