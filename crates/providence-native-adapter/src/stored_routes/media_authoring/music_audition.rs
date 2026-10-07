use super::*;
use std::{fs, io::Write, path::Path};

pub(super) fn prepare(
    session: &EditorSession,
    project: Option<&ProjectStore>,
    catalogs: CatalogViews<'_>,
    params: &Value,
) -> Result<Value, String> {
    let identity = required_string(params, "identity")?;
    let bytes = match required_string(params, "scope")?.as_str() {
        "scenario" => {
            super::check_project(session, params)?;
            let asset = super::asset(session, &identity)?;
            if asset.kind != "music" {
                return Err("Select a music entry before playing.".into());
            }
            let bytes = project
                .ok_or("Open the scenario before playing its music.")?
                .read_blob(&asset.blob)
                .map_err(|e| e.to_string())?;
            if bytes.len() as u64 != asset.byte_length {
                return Err("The retained music has an incorrect length.".into());
            }
            bytes
        }
        "personal" => personal(catalogs, params, &identity)?,
        "stock" => stock(catalogs, &identity)?,
        _ => return Err("Choose Scenario, My Library or Stock music.".into()),
    };
    if bytes.len() > 64 * 1024 * 1024 {
        return Err("Music playback supports modules up to 64 MiB.".into());
    }
    let checked = music::prepare(&bytes, "Audition", 1)?;
    let root = required_string(params, "jobRoot")?;
    let root = Path::new(&root);
    if !root.is_absolute() {
        return Err("Music playback needs an absolute scratch directory.".into());
    }
    // A fresh directory and create-new file prevent overwriting another audition or authored file.
    fs::create_dir(root)
        .map_err(|e| format!("Could not create the music audition directory: {e}"))?;
    let path = root.join("source.mod");
    let written = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .and_then(|mut file| file.write_all(&bytes));
    if let Err(error) = written {
        let _ = fs::remove_file(&path);
        let _ = fs::remove_dir(root);
        return Err(format!("Could not prepare music playback: {error}"));
    }
    Ok(json!({"identity":identity,"sourcePath":path,"jobRoot":root,
        "sourceBlob":checked.source,"sourceBytes":bytes.len(),"mimeType":"audio/x-mod"}))
}

fn personal(catalogs: CatalogViews<'_>, params: &Value, identity: &str) -> Result<Vec<u8>, String> {
    let store = catalogs
        .personal_library
        .ok_or("Open My Library before playing music.")?;
    let library = store.load_manifest().map_err(|e| e.to_string())?;
    if required_u64(params, "expectedLibraryRevision")? != library.revision() {
        return Err("My Library changed. Reselect the music before playing.".into());
    }
    let entry = library
        .asset(&StableId(identity.into()))
        .ok_or("The library music no longer exists.")?;
    if entry
        .media
        .as_ref()
        .map(|media| media.primary.kind.as_str())
        .or(entry.import_kind.as_deref())
        != Some("music")
    {
        return Err("Select a music entry before playing.".into());
    }
    let blob = entry
        .media
        .as_ref()
        .map(|media| &media.primary.blob)
        .unwrap_or(&entry.original);
    store.read_original(blob).map_err(|e| e.to_string())
}

fn stock(catalogs: CatalogViews<'_>, identity: &str) -> Result<Vec<u8>, String> {
    let catalog = catalogs
        .application_media
        .ok_or("Open the Stock library before playing music.")?;
    let asset = catalog
        .assets
        .iter()
        .find(|entry| entry.descriptor.identity.0 == identity)
        .ok_or("The Stock music no longer exists.")?;
    if asset.descriptor.kind != "music" {
        return Err("Select a music entry before playing.".into());
    }
    catalogs
        .application_media_store
        .ok_or("The Stock music payload is unavailable.")?
        .read_blob(&asset.descriptor.blob)
        .map_err(|e| e.to_string())
}
