use std::path::Path;

pub(crate) fn portable_extension(path: &str) -> Result<Option<String>, String> {
    let extension = Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|extension| !extension.is_empty());
    if extension.as_ref().is_some_and(|extension| {
        !extension
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    }) {
        return Err("asset file extension must contain only ASCII letters and digits".into());
    }
    Ok(extension)
}

pub(crate) fn mime_type_for_image_extension(extension: Option<&str>) -> &'static str {
    match extension {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        _ => "image/png",
    }
}
