use super::*;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

pub(super) fn export(
    inventory: &catalog::Inventory<'_>,
    selected: &Selection,
    entries: &[Entry],
    prepared: &Value,
    directory: &str,
) -> Result<Value, String> {
    let parent =
        fs::canonicalize(directory).map_err(|_| "Choose an existing destination folder.")?;
    if !parent.is_dir() {
        return Err("Export destination must be a folder.".into());
    }
    for root in inventory.source_roots() {
        let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
        if parent.starts_with(root) {
            return Err(
                "Choose a destination outside the scenario and asset-library stores.".into(),
            );
        }
    }
    let scratch = tempfile::Builder::new()
        .prefix("Providence Assets-")
        .tempdir_in(&parent)
        .map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    let mut issues = Vec::new();
    for entry in entries {
        export_entry(
            inventory,
            selected,
            entry,
            scratch.path(),
            &mut files,
            &mut issues,
        )?;
    }
    let manifest = json!({"formatVersion":1,"kind":"providence.asset-export","outputContract":OUTPUT_CONTRACT,"reviewHash":prepared["reviewHash"],
        "selection":selected,"revision":inventory.revision,"libraryRevision":inventory.library_revision,
        "assets":entries.iter().map(|e|json!({"scope":e.scope,"asset":e.asset,"sourceOriginal":e.source_original})).collect::<Vec<_>>(),
        "files":files,"issues":issues});
    write_file(
        &scratch.path().join("export-manifest.json"),
        &serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?,
    )?;
    // A failed export owns only this fresh child. TempDir removes it on every error;
    // publication keeps the complete folder, never overwriting the chosen parent.
    let path = scratch.keep();
    Ok(
        json!({"directory":display_path(&path),"assets":entries.len(),"files":files.len(),"issueCount":issues.len(),
        "issues":issues.into_iter().take(20).collect::<Vec<_>>(),"manifest":"export-manifest.json"}),
    )
}

fn display_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    if cfg!(windows) {
        if let Some(unc) = path.strip_prefix("\\\\?\\UNC\\") {
            return format!("\\\\{unc}");
        }
        return path.strip_prefix("\\\\?\\").unwrap_or(&path).to_owned();
    }
    path.into_owned()
}

#[derive(Clone)]
struct WrittenPayload {
    file_index: usize,
    sha256: String,
    png_fingerprint: Option<[u8; 32]>,
}

struct PayloadFormat<'a> {
    mode: &'static str,
    extension: &'a str,
    original: Option<&'a WrittenPayload>,
    png_fingerprint: Option<[u8; 32]>,
}

fn export_entry(
    inventory: &catalog::Inventory<'_>,
    selected: &Selection,
    entry: &Entry,
    root: &Path,
    files: &mut Vec<Value>,
    issues: &mut Vec<Value>,
) -> Result<(), String> {
    let original = if selected.originals {
        export_original(inventory, entry, root, files, issues)?
    } else {
        None
    };
    if selected.converted {
        record_payload(
            conversion::convert(inventory, entry),
            entry,
            root,
            PayloadFormat {
                mode: "converted",
                extension: conversion::extension(&entry.asset).unwrap_or("bin"),
                original: original.as_ref(),
                png_fingerprint: None,
            },
            files,
            issues,
        )?;
    }
    Ok(())
}

fn export_original(
    inventory: &catalog::Inventory<'_>,
    entry: &Entry,
    root: &Path,
    files: &mut Vec<Value>,
    issues: &mut Vec<Value>,
) -> Result<Option<WrittenPayload>, String> {
    let source = original::read(inventory, entry);
    let extension = source
        .as_ref()
        .map(|p| p.extension.as_str())
        .unwrap_or("bin")
        .to_owned();
    let png_fingerprint = source.as_ref().ok().and_then(|p| p.png_fingerprint);
    record_payload(
        source.map(|p| p.bytes),
        entry,
        root,
        PayloadFormat {
            mode: "originals",
            extension: &extension,
            original: None,
            png_fingerprint,
        },
        files,
        issues,
    )
}

fn shared_output(
    bytes: &[u8],
    sha256: &str,
    format: &PayloadFormat<'_>,
    files: &mut [Value],
) -> Option<WrittenPayload> {
    let original = format.original?;
    let equivalent = original.sha256 == sha256
        || (format.extension == "png"
            && original.png_fingerprint.is_some_and(|fingerprint| {
                conversion::png_fingerprint(bytes) == Some(fingerprint)
            }));
    if !equivalent {
        return None;
    }
    // One physical file may satisfy both requested formats; retain both roles in the receipt.
    files[original.file_index]["formats"]
        .as_array_mut()
        .expect("export formats")
        .push(json!(format.mode));
    Some(original.clone())
}

fn record_payload(
    payload: Result<Vec<u8>, String>,
    entry: &Entry,
    root: &Path,
    format: PayloadFormat<'_>,
    files: &mut Vec<Value>,
    issues: &mut Vec<Value>,
) -> Result<Option<WrittenPayload>, String> {
    let bytes = match payload {
        Ok(bytes) => bytes,
        Err(reason) => {
            issues.push(json!({"scope":entry.scope,"identity":entry.asset.identity,
            "label":entry.asset.label,"format":format.mode,"reason":reason}));
            return Ok(None);
        }
    };
    let sha256 = format!("{:x}", Sha256::digest(&bytes));
    if let Some(original) = shared_output(&bytes, &sha256, &format, files) {
        return Ok(Some(original));
    }
    let scope = match entry.scope {
        Scope::Scenario => "Scenario",
        Scope::Library => "Library",
        Scope::Stock => "Stock",
    };
    let relative = PathBuf::from(scope)
        .join(catalog::category(&entry.asset))
        .join(format.mode)
        .join(filename(entry, format.extension));
    let output = root.join(&relative);
    fs::create_dir_all(output.parent().expect("export file parent")).map_err(|e| e.to_string())?;
    write_file(&output, &bytes)?;
    files.push(
        json!({"scope":entry.scope,"identity":entry.asset.identity,"format":format.mode,"formats":[format.mode],
        "path":relative.to_string_lossy().replace('\\',"/"),"bytes":bytes.len(),
        "sha256":sha256}),
    );
    Ok(Some(WrittenPayload {
        file_index: files.len() - 1,
        sha256,
        png_fingerprint: format.png_fingerprint,
    }))
}

fn filename(entry: &Entry, extension: &str) -> String {
    let label: String = entry
        .asset
        .label
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .take(60)
        .collect();
    let identity = format!("{:x}", Sha256::digest(entry.asset.identity.0.as_bytes()));
    let resource = entry
        .asset
        .classic_resource
        .as_ref()
        .map(|key| format!("{}-", key.resource_id))
        .unwrap_or_default();
    format!("{resource}{label}-{}.{extension}", &identity[..16])
}

fn write_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())
}
