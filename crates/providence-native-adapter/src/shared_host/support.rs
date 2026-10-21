//! Compare immutable support bytes, not merely matching configuration strings.
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub(super) fn identities(options: &[String]) -> Result<Value, String> {
    if !options.len().is_multiple_of(2) {
        return Err("application-support options require values".into());
    }
    let mut rows = Vec::new();
    for pair in options.chunks_exact(2) {
        let root = canonical_location(Path::new(&pair[1]))?;
        let files: &[&str] = match pair[0].as_str() {
            "--application-library-root" => &["classic-application-media.json"],
            "--reference-catalog-root" => &["reference-catalog.providence.json"],
            "--application-rules-root" => &[
                "Data ID",
                "Data ID.rsrc",
                "Data Race",
                "Data Caste",
                "Data S",
                "Custom Names.rsrc",
                "Combat Data BD",
                "Data P BD",
                "Data SUB BD",
                "Data Castle BD",
                "Data Desert BD",
                "Data Swamp BD",
                "Data Snow BD",
            ],
            "--monster-scrapbook-manifest" => &[""],
            "--monster-library-root"
            | "--personal-monster-library-root"
            | "--personal-library-root" => &[],
            other => return Err(format!("unsupported application-support option: {other}")),
        };
        let mut content = Vec::new();
        for file in files {
            let path = if file.is_empty() {
                root.clone()
            } else {
                root.join(file)
            };
            content.push(json!({"file":file,"sha256":hash(&path)?}));
        }
        rows.push(json!({"option":pair[0],"path":root,"content":content}));
    }
    rows.sort_by_key(|r| r["option"].as_str().unwrap().to_owned());
    Ok(json!(rows))
}
fn canonical_location(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return path.canonicalize().map_err(|e| e.to_string());
    }
    let parent = path
        .parent()
        .filter(|r| !r.as_os_str().is_empty())
        .ok_or("support path must have a parent")?;
    Ok(canonical_location(parent)?
        .join(path.file_name().ok_or("support path requires a filename")?))
}
fn hash(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 16384];
    loop {
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(Some(format!("{:x}", digest.finalize())))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn same_path_with_replaced_support_is_a_different_input() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("classic-application-media.json");
        fs::write(&path, b"first").unwrap();
        let options = vec![
            "--application-library-root".into(),
            root.path().to_string_lossy().into_owned(),
        ];
        let before = identities(&options).unwrap();
        fs::write(&path, b"changed").unwrap();
        assert_ne!(before, identities(&options).unwrap());
    }
}
