use base64::{engine::general_purpose::STANDARD, Engine as _};
use realmz_providence_lib::resource_preview::inspect_resource_preview;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, io::Cursor, path::PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditResult {
    sha256: String,
    status: String,
    width: Option<u32>,
    height: Option<u32>,
    rgba_sha256: Option<String>,
    summary: BTreeMap<String, String>,
    diagnostic_codes: Vec<String>,
}

fn main() {
    let (input_dir, output_path) = args();
    let mut files = fs::read_dir(&input_dir)
        .unwrap_or_else(|error| panic!("read {}: {error}", input_dir.display()))
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("pict"))
        .collect::<Vec<_>>();
    files.sort();

    let mut results = Vec::new();
    for path in files {
        let bytes =
            fs::read(&path).unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
        let sha256 = hex::encode(Sha256::digest(&bytes));
        let preview = inspect_resource_preview("PICT", &bytes)
            .unwrap_or_else(|error| panic!("inspect {}: {error}", path.display()));
        let (width, height, rgba_sha256) = preview
            .data_url
            .as_deref()
            .and_then(decode_png_pixels)
            .map(|(width, height, rgba)| {
                (
                    Some(width),
                    Some(height),
                    Some(hex::encode(Sha256::digest(&rgba))),
                )
            })
            .unwrap_or((None, None, None));
        results.push(AuditResult {
            sha256,
            status: serde_json::to_value(&preview.status)
                .ok()
                .and_then(|value| value.as_str().map(str::to_string))
                .unwrap_or_else(|| "unknown".to_string()),
            width,
            height,
            rgba_sha256,
            summary: preview.summary,
            diagnostic_codes: preview
                .diagnostics
                .into_iter()
                .map(|diagnostic| diagnostic.code)
                .collect(),
        });
    }

    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .unwrap_or_else(|error| panic!("create {}: {error}", parent.display()));
    }
    fs::write(
        &output_path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&results).expect("serialize audit")
        ),
    )
    .unwrap_or_else(|error| panic!("write {}: {error}", output_path.display()));
    println!("Audited {} unique PICT payloads.", results.len());
}

fn args() -> (PathBuf, PathBuf) {
    let mut input_dir = None;
    let mut output_path = None;
    let values = std::env::args().skip(1).collect::<Vec<_>>();
    let mut index = 0;
    while index < values.len() {
        match values[index].as_str() {
            "--input-dir" => {
                index += 1;
                input_dir = values.get(index).map(PathBuf::from);
            }
            "--out" => {
                index += 1;
                output_path = values.get(index).map(PathBuf::from);
            }
            value => panic!("unknown argument: {value}"),
        }
        index += 1;
    }
    (
        input_dir.expect("--input-dir is required"),
        output_path.expect("--out is required"),
    )
}

fn decode_png_pixels(data_url: &str) -> Option<(u32, u32, Vec<u8>)> {
    let encoded = data_url.strip_prefix("data:image/png;base64,")?;
    let bytes = STANDARD.decode(encoded).ok()?;
    let decoder = png::Decoder::new(Cursor::new(bytes));
    let mut reader = decoder.read_info().ok()?;
    let mut buffer = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buffer).ok()?;
    let pixels = buffer[..info.buffer_size()].to_vec();
    Some((info.width, info.height, pixels))
}
