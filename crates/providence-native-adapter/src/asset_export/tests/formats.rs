use super::*;

fn converted_bytes(result: &Value) -> Vec<Vec<u8>> {
    manifest(result)["files"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|file| {
            file["formats"]
                .as_array()
                .unwrap()
                .iter()
                .any(|format| format == "converted")
        })
        .map(|file| {
            fs::read(
                Path::new(result["directory"].as_str().unwrap())
                    .join(file["path"].as_str().unwrap()),
            )
            .unwrap()
        })
        .collect()
}

#[test]
fn sound_export_retains_stereo_16_bit_samples_instead_of_preview_pcm8() {
    let mut bytes = b"RIFF".to_vec();
    bytes.extend_from_slice(&44u32.to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    for value in [1u16, 2] {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    for value in [44100u32, 176400] {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    for value in [4u16, 16] {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&8u32.to_le_bytes());
    for sample in [-32768i16, 32767, 12345, -23456] {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    let mut f = Fixture::new();
    f.add("asset:stereo", "sound", "audio/wav", &bytes, None);
    let result = f.write(f.selection(vec!["sounds"]));
    assert_eq!(result["issueCount"], 0);
    assert_eq!(result["files"], 1);
    assert_eq!(converted_bytes(&result), vec![bytes]);
}

#[test]
fn mod_export_preserves_patterns_samples_and_trailing_source_bytes() {
    let mut module = vec![0; 1084 + 1024];
    module[950] = 1;
    module[1080..1084].copy_from_slice(b"M.K.");
    module.extend_from_slice(b"retained original tail");
    let mut f = Fixture::new();
    f.add("asset:music", "music", "audio/x-mod", &module, None);
    let result = f.write(f.selection(vec!["music"]));
    assert_eq!(result["issueCount"], 0);
    assert_eq!(result["files"], 1);
    assert_eq!(converted_bytes(&result), vec![module]);
}

#[test]
fn individual_text_export_includes_only_its_exact_existing_style_companion() {
    let mut f = Fixture::new();
    f.add(
        "asset:text",
        "text-resource",
        "text/plain",
        b"scroll",
        Some(b"native TEXT"),
    );
    f.add(
        "asset:style",
        "text-style-resource",
        "application/octet-stream",
        b"native style",
        None,
    );
    let mut asset = f
        .session
        .snapshot()
        .assets
        .iter()
        .find(|asset| asset.identity.0 == "asset:style")
        .unwrap()
        .clone();
    asset.classic_resource = Some(ClassicResourceKey {
        resource_type: "styl".into(),
        resource_id: 128,
    });
    f.session
        .execute(ExpectedRevisionCommand {
            expected_revision: f.session.revision(),
            command: EditorCommand::UpsertAsset {
                asset: Box::new(asset),
            },
        })
        .unwrap();
    f.add(
        "asset:unrelated",
        "text-resource",
        "text/plain",
        b"other scroll",
        None,
    );
    let mut params = f.selection(vec!["text"]);
    params["selection"]["identity"] = json!("asset:text");
    let result = f.write(params);
    assert_eq!(result["assets"], 2);
    assert_eq!(result["files"], 3);
    assert_eq!(result["issueCount"], 1);
    assert_eq!(converted_bytes(&result), vec![b"scroll".to_vec()]);
}
