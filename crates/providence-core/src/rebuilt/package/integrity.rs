use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

use super::{
    REBUILT_V3_REQUIRED_DOCUMENTS, REBUILT_V3_SUPPORTED_CAPABILITIES, RebuiltV3FileInput,
    RebuiltV3FileIntegrity, RebuiltV3ManifestError,
};

pub(super) struct FileSet {
    pub entries: BTreeMap<String, RebuiltV3FileIntegrity>,
    pub content_id: String,
}

pub(super) fn project_files(
    inputs: &[RebuiltV3FileInput<'_>],
) -> Result<FileSet, RebuiltV3ManifestError> {
    let files_by_path = validated_files(inputs)?;
    for required in REBUILT_V3_REQUIRED_DOCUMENTS {
        if !files_by_path.contains_key(required) {
            return Err(RebuiltV3ManifestError::MissingDocument(required));
        }
    }
    let entries = files_by_path
        .iter()
        .map(|(path, bytes)| {
            (
                (*path).to_string(),
                RebuiltV3FileIntegrity {
                    bytes: bytes.len() as u64,
                    sha256: sha256_hex(bytes),
                },
            )
        })
        .collect();
    Ok(FileSet {
        entries,
        content_id: content_id(&files_by_path),
    })
}

pub(super) fn sorted_capabilities(
    capabilities: &[String],
) -> Result<Vec<String>, RebuiltV3ManifestError> {
    let supported = REBUILT_V3_SUPPORTED_CAPABILITIES
        .into_iter()
        .collect::<BTreeSet<_>>();
    let mut seen = BTreeSet::new();
    for capability in capabilities {
        if !supported.contains(capability.as_str()) {
            return Err(RebuiltV3ManifestError::UnsupportedCapability(
                capability.clone(),
            ));
        }
        if !seen.insert(capability.clone()) {
            return Err(RebuiltV3ManifestError::DuplicateCapability(
                capability.clone(),
            ));
        }
    }
    Ok(seen.into_iter().collect())
}

fn validated_files<'a>(
    inputs: &'a [RebuiltV3FileInput<'a>],
) -> Result<BTreeMap<&'a str, &'a [u8]>, RebuiltV3ManifestError> {
    let mut files = BTreeMap::new();
    for input in inputs {
        if !is_rebuilt_v3_package_path(input.path) {
            return Err(RebuiltV3ManifestError::InvalidPath(input.path.into()));
        }
        if files.insert(input.path, input.bytes).is_some() {
            return Err(RebuiltV3ManifestError::DuplicatePath(input.path.into()));
        }
        if let Some(expected) = rebuilt_v3_media_digest(input.path) {
            let actual = sha256_hex(input.bytes);
            if expected != actual {
                return Err(RebuiltV3ManifestError::MediaHashMismatch {
                    path: input.path.into(),
                    actual,
                });
            }
        }
    }
    Ok(files)
}

pub fn is_rebuilt_v3_package_path(path: &str) -> bool {
    REBUILT_V3_REQUIRED_DOCUMENTS.contains(&path) || rebuilt_v3_media_digest(path).is_some()
}

pub fn rebuilt_v3_media_digest(path: &str) -> Option<&str> {
    let name = path.strip_prefix("assets/media/")?;
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return None;
    }
    let (digest, extension) = name
        .split_once('.')
        .map_or((name, None), |(digest, extension)| {
            (digest, Some(extension))
        });
    if digest.len() != 64
        || !digest
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return None;
    }
    if extension.is_some_and(|extension| {
        extension.is_empty()
            || !extension
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    }) {
        return None;
    }
    Some(digest)
}

fn content_id(files: &BTreeMap<&str, &[u8]>) -> String {
    let mut hasher = Sha256::new();
    for path in REBUILT_V3_REQUIRED_DOCUMENTS {
        let bytes = files[path];
        hasher.update((path.len() as u64).to_be_bytes());
        hasher.update(path.as_bytes());
        hasher.update((bytes.len() as u64).to_be_bytes());
        hasher.update(bytes);
    }
    format!("{:x}", hasher.finalize())
}

pub(super) fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}
