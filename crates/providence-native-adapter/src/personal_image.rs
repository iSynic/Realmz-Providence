use std::io::Cursor;

pub(crate) struct Preview {
    pub width: u32,
    pub height: u32,
    pub png: Vec<u8>,
}

pub(crate) struct DecodedImage {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

pub(crate) fn classic_icon_preview(bytes: &[u8]) -> Result<Preview, String> {
    let original = decode(bytes)?;
    let native = providence_core::codecs::encode_scenario_icon_cicn(
        &original.rgba,
        original.width,
        original.height,
    )
    .map_err(|error| error.to_string())?;
    let decoded =
        providence_core::codecs::decode_cicn(&native).map_err(|error| error.to_string())?;
    let png = providence_core::codecs::encode_runtime_rgba_png(
        &decoded.rgba,
        decoded.width,
        decoded.height,
    )
    .map_err(|error| error.to_string())?;
    Ok(Preview {
        width: decoded.width,
        height: decoded.height,
        png,
    })
}

pub(crate) fn decode(bytes: &[u8]) -> Result<DecodedImage, String> {
    let mut decoder = png::Decoder::new_with_limits(
        Cursor::new(bytes),
        png::Limits {
            bytes: 32 * 1024 * 1024,
        },
    );
    decoder.set_ignore_text_chunk(true);
    decoder.set_ignore_iccp_chunk(true);
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder
        .read_info()
        .map_err(|_| "This file is not a readable PNG image.")?;
    let info = reader.info();
    let (width, height) = (info.width, info.height);
    if width == 0 || height == 0 || width > 2048 || height > 2048 {
        return Err("PNG images must be at most 2048 by 2048 pixels.".into());
    }
    if info.animation_control.is_some() {
        return Err("Animated PNG images are not supported yet. Choose a still image.".into());
    }
    let size = reader
        .output_buffer_size()
        .filter(|size| *size <= 16 * 1024 * 1024)
        .ok_or("The decoded image exceeds the preview limit.")?;
    let mut pixels = vec![0; size];
    let output = reader
        .next_frame(&mut pixels)
        .map_err(|_| "The PNG image is damaged or incomplete.")?;
    reader
        .finish()
        .map_err(|_| "The PNG image is damaged or incomplete.")?;
    let channels = match output.color_type {
        png::ColorType::Grayscale => 1,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Rgb => 3,
        png::ColorType::Rgba => 4,
        png::ColorType::Indexed => return Err("The PNG palette could not be decoded.".into()),
    };
    let mut rgba = Vec::with_capacity((width * height * 4) as usize);
    for pixel in pixels[..output.buffer_size()].chunks_exact(channels) {
        match channels {
            1 => rgba.extend_from_slice(&[pixel[0], pixel[0], pixel[0], 255]),
            2 => rgba.extend_from_slice(&[pixel[0], pixel[0], pixel[0], pixel[1]]),
            3 => rgba.extend_from_slice(&[pixel[0], pixel[1], pixel[2], 255]),
            _ => rgba.extend_from_slice(pixel),
        }
    }
    Ok(DecodedImage {
        width,
        height,
        rgba,
    })
}

pub(crate) fn preview(bytes: &[u8]) -> Result<Preview, String> {
    let decoded = decode(bytes)?;
    let (width, height) = (decoded.width, decoded.height);
    let longest = width.max(height);
    let preview_width = if longest > 256 {
        (width * 256 / longest).max(1)
    } else {
        width
    };
    let preview_height = if longest > 256 {
        (height * 256 / longest).max(1)
    } else {
        height
    };
    let mut rgba = Vec::with_capacity((preview_width * preview_height * 4) as usize);
    for y in 0..preview_height {
        for x in 0..preview_width {
            let source =
                (((y * height / preview_height) * width + x * width / preview_width) as usize) * 4;
            rgba.extend_from_slice(&decoded.rgba[source..source + 4]);
        }
    }
    let png =
        providence_core::codecs::encode_runtime_rgba_png(&rgba, preview_width, preview_height)
            .map_err(|error| error.to_string())?;
    Ok(Preview { width, height, png })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_preserves_small_rgba_and_bounds_large_images() {
        for (width, height) in [(2, 1), (512, 256)] {
            let pixels = [20, 40, 60, 128].repeat((width * height) as usize);
            let original =
                providence_core::codecs::encode_runtime_rgba_png(&pixels, width, height).unwrap();
            let result = preview(&original).unwrap();
            assert_eq!((result.width, result.height), (width, height));
            let mut reader = png::Decoder::new(Cursor::new(result.png))
                .read_info()
                .unwrap();
            assert!(reader.info().width <= 256 && reader.info().height <= 256);
            let mut decoded = vec![0; reader.output_buffer_size().unwrap()];
            reader.next_frame(&mut decoded).unwrap();
            assert!(
                decoded
                    .chunks_exact(4)
                    .all(|pixel| pixel == [20, 40, 60, 128])
            );
        }
    }

    #[test]
    fn corrupt_and_truncated_images_are_rejected() {
        assert!(preview(b"not an image").is_err());
        let mut original =
            providence_core::codecs::encode_runtime_rgba_png(&[0, 0, 0, 255], 1, 1).unwrap();
        original.truncate(original.len() - 12);
        assert!(preview(&original).is_err());
        let oversized =
            providence_core::codecs::encode_runtime_rgba_png(&[0, 0, 0, 255].repeat(2049), 2049, 1)
                .unwrap();
        assert!(preview(&oversized).err().unwrap().contains("2048"));
    }
}
