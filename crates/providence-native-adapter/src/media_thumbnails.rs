//! Bounded presentation derivatives; canonical media and exact native bytes stay untouched.

use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use serde_json::{Value, json};

pub(crate) fn batch(
    params: &Value,
    mut preview: impl FnMut(&str, Value) -> Result<Value, String>,
) -> Result<Value, String> {
    let items = params["items"]
        .as_array()
        .filter(|items| items.len() <= 4)
        .ok_or("Thumbnail requests accept at most four items.")?;
    let mut results = Vec::with_capacity(items.len());
    for item in items {
        let method = item["method"].as_str().unwrap_or("");
        let identity = item["identity"]
            .as_str()
            .ok_or("A thumbnail requires an identity.")?;
        if !matches!(
            method,
            "application-media.preview"
                | "personal-library.preview"
                | "reference-catalog.preview"
                | "picture.preview"
                | "icon.preview"
                | "special-land.preview"
                | "sound.preview"
                | "text-resource.preview"
        ) {
            return Err("Thumbnail requests allow media preview reads only.".into());
        }
        let result = preview(method, json!({"identity": identity})).and_then(thumbnail);
        results.push(match result {
            Ok(result) => json!({"identity": identity, "ok": true, "result": result}),
            Err(error) => json!({"identity": identity, "ok": false, "error": error}),
        });
    }
    Ok(json!({"items": results, "rendering": "thumbnail-96-v1"}))
}

fn thumbnail(mut result: Value) -> Result<Value, String> {
    if result["mimeType"].as_str() != Some("image/png") {
        return Ok(json!({"deferred": true}));
    }
    let encoded = result["base64"]
        .as_str()
        .filter(|encoded| encoded.len() <= 5_592_408)
        .ok_or("Image exceeds the thumbnail transport limit.")?;
    let bytes = BASE64.decode(encoded).map_err(|error| error.to_string())?;
    let decoded = crate::personal_image::decode(&bytes)?;
    let largest = decoded.width.max(decoded.height);
    let (width, height) = if largest <= 96 {
        (decoded.width, decoded.height)
    } else {
        (
            (decoded.width * 96 / largest).max(1),
            (decoded.height * 96 / largest).max(1),
        )
    };
    let mut rgba = Vec::with_capacity((width * height * 4) as usize);
    for y in 0..height {
        for x in 0..width {
            let index = ((y * decoded.height / height * decoded.width + x * decoded.width / width)
                * 4) as usize;
            rgba.extend_from_slice(&decoded.rgba[index..index + 4]);
        }
    }
    result["base64"] = json!(
        BASE64.encode(
            providence_core::codecs::encode_runtime_rgba_png(&rgba, width, height)
                .map_err(|error| error.to_string())?
        )
    );
    result["width"] = json!(decoded.width);
    result["height"] = json!(decoded.height);
    result["thumbnail"] = json!(true);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn batches_are_read_only_bounded_and_reduce_only_presentation_pixels() {
        assert!(batch(&json!({"items": vec![json!({}); 5]}), |_, _| unreachable!()).is_err());
        assert!(
            batch(
                &json!({"items":[{"method":"project.save", "identity":"x"}]}),
                |_, _| unreachable!()
            )
            .is_err()
        );
        let png =
            providence_core::codecs::encode_runtime_rgba_png(&vec![19; 640 * 320 * 4], 640, 320)
                .unwrap();
        let result =
            thumbnail(json!({"mimeType":"image/png", "base64":BASE64.encode(&png)})).unwrap();
        let resized = crate::personal_image::decode(
            &BASE64.decode(result["base64"].as_str().unwrap()).unwrap(),
        )
        .unwrap();
        assert_eq!((resized.width, resized.height), (96, 48));
        assert_eq!(resized.rgba, vec![19; 96 * 48 * 4]);
        assert_eq!(result["width"], 640);
    }
}
