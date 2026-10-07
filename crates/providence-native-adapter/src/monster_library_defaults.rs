use crate::catalogs::OpenMonsterLibrary;
use providence_core::monster_library::{MonsterLibrarySession, decode_monster_scrapbook};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundledScrapbook {
    kind: String,
    format_version: u32,
    native_name: String,
    byte_length: u64,
    sha256: String,
    record_bytes: usize,
    record_count: usize,
    evidence_revision: String,
    evidence_path: String,
}

pub(crate) fn initialize(
    library: &mut OpenMonsterLibrary,
    manifest_path: &str,
) -> Result<(), String> {
    let catalog = library.session.catalog();
    // Provisioning is limited to a newly created, empty personal store. Existing
    // catalogs, overrides and independent history are never replaced at startup.
    if catalog.revision.0 != 0 || !catalog.sources.is_empty() || !catalog.custom_entries.is_empty()
    {
        return Ok(());
    }
    let path = Path::new(manifest_path);
    let manifest: BundledScrapbook =
        serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Invalid bundled Monster Library manifest: {e}"))?;
    if manifest.kind != "providence.bundled-monster-scrapbook"
        || manifest.format_version != 1
        || manifest.native_name != "Monster Scrap Book"
        || manifest.evidence_revision.len() != 40
    {
        return Err("Unsupported bundled Monster Library source manifest".into());
    }
    let bytes = fs::read(path.with_file_name("Monster Scrap Book")).map_err(|e| e.to_string())?;
    if bytes.len() as u64 != manifest.byte_length
        || format!("{:x}", Sha256::digest(&bytes)) != manifest.sha256
    {
        return Err("Bundled Monster Library source differs from its pinned manifest".into());
    }
    let decoded = decode_monster_scrapbook(
        &bytes,
        &manifest.native_name,
        &manifest.evidence_revision,
        &manifest.evidence_path,
    );
    if decoded.source.record_bytes != manifest.record_bytes
        || decoded.source.record_count != manifest.record_count
        || decoded.source.trailing_bytes != 0
    {
        return Err("Bundled Monster Library record geometry differs from its manifest".into());
    }
    let mut initialized = catalog.clone();
    library.store.put_blob(&bytes).map_err(|e| e.to_string())?;
    initialized.sources.push(decoded.source);
    initialized.built_ins = decoded.entries;
    let session = MonsterLibrarySession::new(initialized).map_err(|e| e.to_string())?;
    library
        .store
        .checkpoint_session(&session)
        .map_err(|e| e.to_string())?;
    library.session = session;
    Ok(())
}
