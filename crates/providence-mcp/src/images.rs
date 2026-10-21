//! Native preview bytes travel as bounded MCP images, not duplicate JSON strings.
use rmcp::model::{CallToolResult, ContentBlock};
use serde_json::{Value, json};

pub(crate) fn result(mut value: Value) -> CallToolResult {
    let mut images = Vec::new();
    if let Some(image) = extract(&mut value) {
        images.push(image);
    }
    if value["format"] == "providence.monster-appearance.v1" {
        for field in ["base", "facing"] {
            if let Some(image) = extract(&mut value[field]) {
                images.push(image);
            }
        }
    }
    media_images(&mut value, &mut images);
    for group in ["results", "changePreviews"] {
        if let Some(results) = value.get_mut(group).and_then(Value::as_object_mut) {
            for result in results.values_mut() {
                media_images(result, &mut images);
            }
        }
    }
    let mut result = CallToolResult::structured(value);
    for (data, mime) in images {
        result.content.push(ContentBlock::image(data, mime));
    }
    result
}
fn media_images(value: &mut Value, images: &mut Vec<(String, String)>) {
    if value.pointer("/media/primary").is_none() {
        return;
    }
    for path in ["/source", "/preview/primary", "/preview/companion"] {
        if let Some(preview) = value.pointer_mut(path)
            && let Some(image) = extract(preview)
        {
            images.push(image);
        }
    }
}
fn extract(value: &mut Value) -> Option<(String, String)> {
    let object = value.as_object_mut()?;
    let data = object.get("base64")?.as_str()?;
    if data.len() > 4 * 1024 * 1024 {
        object.remove("base64");
        object.insert(
            "imageUnavailableReason".into(),
            json!("The preview exceeds the MCP image bound; request a smaller preview."),
        );
        return None;
    }
    let mime = object
        .get("mimeType")
        .and_then(Value::as_str)
        .unwrap_or("image/png");
    if !matches!(mime, "image/png" | "image/jpeg" | "image/webp") {
        object.remove("base64");
        object.insert(
            "imageUnavailableReason".into(),
            json!("This payload is not a supported MCP image format."),
        );
        return None;
    }
    let image = (data.to_string(), mime.to_string());
    object.remove("base64");
    object.insert("imageIncluded".into(), json!(true));
    Some(image)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn grouped_media_extracts_only_known_previews_and_keeps_resource_identities() {
        let output = result(json!({"results":{"review":{
            "media":{"primary":{"identity":"picture:30000"}},
            "source":{"base64":"aGVsbG8=","mimeType":"image/png"},
            "preview":{"primary":{"base64":"aGVsbG8=","identity":"picture:30000"}}
        },"story":{"base64":"scenario content"}},
        "changePreviews":{"audio":{"media":{"primary":{"identity":"sound:200"}},
            "preview":{"primary":{"base64":"aGVsbG8=","mimeType":"audio/wav"}}}}}));
        let value = output.structured_content.as_ref().unwrap();
        assert_eq!(output.content.len(), 3);
        assert_eq!(
            value["results"]["review"]["media"]["primary"]["identity"],
            "picture:30000"
        );
        assert_eq!(
            value["results"]["review"]["preview"]["primary"]["imageIncluded"],
            true
        );
        assert_eq!(value["results"]["story"]["base64"], "scenario content");
        let audio = &value["changePreviews"]["audio"]["preview"]["primary"];
        assert!(audio.get("base64").is_none());
        assert!(audio["imageUnavailableReason"].is_string());
    }
    #[test]
    fn preview_has_one_image_and_retains_revision_and_dimensions() {
        let output = result(json!({"revision":4,"width":180,"height":180,"base64":"aGVsbG8="}));
        assert_eq!(output.structured_content.as_ref().unwrap()["revision"], 4);
        assert!(
            output
                .structured_content
                .as_ref()
                .unwrap()
                .get("base64")
                .is_none()
        );
        assert_eq!(output.content.len(), 2);
    }

    #[test]
    fn monster_pair_images_keep_their_exact_resource_metadata_without_duplicate_base64() {
        let output = result(
            json!({"format":"providence.monster-appearance.v1","revision":4,
            "base":{"identity":"base-resource","base64":"aGVsbG8=","mimeType":"image/png"},
            "facing":{"identity":"facing-resource","base64":"aGVsbG8=","mimeType":"image/png"}}),
        );
        let value = output.structured_content.as_ref().unwrap();
        assert_eq!(value["base"]["identity"], "base-resource");
        assert_eq!(value["facing"]["identity"], "facing-resource");
        assert_eq!(value["base"]["imageIncluded"], true);
        assert!(value["base"].get("base64").is_none() && value["facing"].get("base64").is_none());
        assert_eq!(output.content.len(), 3);
    }
}
