use crate::personal_image::DecodedImage;
use serde_json::Value;

pub(super) fn convert(
    source: &DecodedImage,
    width: u32,
    height: u32,
    settings: &Value,
    opaque: bool,
) -> Result<DecodedImage, String> {
    if width == 0 || height == 0 || width > 2048 || height > 2048 {
        return Err("Output dimensions must be between 1 and 2048 pixels.".into());
    }
    let (fit, filter, transparency) = choices(settings, opaque)?;
    let (sx, sy) = (
        width as f64 / source.width as f64,
        height as f64 / source.height as f64,
    );
    let (scale_x, scale_y) = match fit {
        "pad" => (sx.min(sy), sx.min(sy)),
        "crop" => (sx.max(sy), sx.max(sy)),
        _ => (sx, sy),
    };
    let (left, top) = (
        (width as f64 - source.width as f64 * scale_x) / 2.,
        (height as f64 - source.height as f64 * scale_y) / 2.,
    );
    let mut rgba = Vec::with_capacity((width * height * 4) as usize);
    for y in 0..height {
        for x in 0..width {
            let (px, py) = (
                (x as f64 + 0.5 - left) / scale_x - 0.5,
                (y as f64 + 0.5 - top) / scale_y - 0.5,
            );
            let mut pixel = if px < -0.5
                || py < -0.5
                || px >= source.width as f64 - 0.5
                || py >= source.height as f64 - 0.5
            {
                [0, 0, 0, 0]
            } else if filter == "smooth" {
                bilinear(source, px, py)
            } else {
                pixel(source, px.round() as i32, py.round() as i32)
            };
            composite(&mut pixel, transparency);
            rgba.extend_from_slice(&pixel);
        }
    }
    Ok(DecodedImage {
        width,
        height,
        rgba,
    })
}

fn composite(pixel: &mut [u8; 4], transparency: &str) {
    if transparency != "keep" {
        let background = if transparency == "white" { 255 } else { 0 };
        for color in 0..3 {
            pixel[color] = ((u32::from(pixel[color]) * u32::from(pixel[3])
                + background * (255 - u32::from(pixel[3]))
                + 127)
                / 255) as u8;
        }
        pixel[3] = 255;
    }
}

fn choices(settings: &Value, opaque: bool) -> Result<(&str, &str, &str), String> {
    let fit = settings["fit"].as_str().unwrap_or("pad");
    if !matches!(fit, "pad" | "crop" | "stretch") {
        return Err("Choose padding, crop or stretch for the image fit.".into());
    }
    let filter = settings["filter"].as_str().unwrap_or("crisp");
    if !matches!(filter, "crisp" | "smooth") {
        return Err("Choose crisp pixels or smooth scaling.".into());
    }
    let transparency =
        settings["transparency"]
            .as_str()
            .unwrap_or(if opaque { "white" } else { "keep" });
    if !matches!(transparency, "white" | "black" | "keep") || opaque && transparency == "keep" {
        return Err("Pictures require an opaque white or black background.".into());
    }
    Ok((fit, filter, transparency))
}

fn pixel(image: &DecodedImage, x: i32, y: i32) -> [u8; 4] {
    let x = x.clamp(0, image.width as i32 - 1) as u32;
    let y = y.clamp(0, image.height as i32 - 1) as u32;
    let offset = ((y * image.width + x) * 4) as usize;
    image.rgba[offset..offset + 4]
        .try_into()
        .expect("decoded RGBA pixel")
}

fn bilinear(image: &DecodedImage, x: f64, y: f64) -> [u8; 4] {
    let (left, top) = (x.floor() as i32, y.floor() as i32);
    let (fx, fy) = (x - x.floor(), y - y.floor());
    let samples = [
        (pixel(image, left, top), (1. - fx) * (1. - fy)),
        (pixel(image, left + 1, top), fx * (1. - fy)),
        (pixel(image, left, top + 1), (1. - fx) * fy),
        (pixel(image, left + 1, top + 1), fx * fy),
    ];
    let alpha = samples.iter().map(|(p, w)| p[3] as f64 * w).sum::<f64>();
    let mut output = [0, 0, 0, alpha.round().clamp(0., 255.) as u8];
    if alpha > 0. {
        for channel in 0..3 {
            output[channel] = (samples
                .iter()
                .map(|(p, w)| p[channel] as f64 * p[3] as f64 * w)
                .sum::<f64>()
                / alpha)
                .round()
                .clamp(0., 255.) as u8;
        }
    }
    output
}
