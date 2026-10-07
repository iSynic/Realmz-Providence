use std::{fs, path::Path};

use providence_core::{
    codecs::{SCENARIO_MUSIC_FILES, scenario_music_asset},
    session::{EditorCommand, EditorSession, ExpectedRevisionCommand},
};
use providence_storage::ProjectStore;

use crate::scenario_preflight::resolve_classic_native_file;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ScenarioMusicOmission {
    pub native_path: String,
    pub reason: String,
}

pub(super) fn import_into(
    session: &mut EditorSession,
    store: &ProjectStore,
    directory: &Path,
) -> Result<Vec<ScenarioMusicOmission>, String> {
    let mut assets = Vec::new();
    let mut omissions = Vec::new();
    for (index, name) in SCENARIO_MUSIC_FILES.iter().enumerate() {
        let Some(path) = resolve_classic_native_file(directory, name) else {
            continue;
        };
        let bytes = fs::read(&path).map_err(|error| format!("could not read {name}: {error}"))?;
        let blob = store.put_blob(&bytes).map_err(|error| error.to_string())?;
        match scenario_music_asset(index as u8 + 1, &bytes, blob) {
            Ok(asset) => assets.push(asset),
            Err(error) => omissions.push(ScenarioMusicOmission {
                native_path: name.to_string(),
                reason: error.to_string(),
            }),
        }
    }
    for asset in assets {
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::UpsertAsset {
                    asset: Box::new(asset),
                },
            })
            .map_err(|error| error.to_string())?;
    }
    Ok(omissions)
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::{
        compiler::{
            ClassicCompatibilitySources, certify_classic_no_edit_manifest_with_asset_payloads,
        },
        model::{ProjectSnapshot, StableId},
    };
    use std::collections::BTreeMap;

    use crate::scenario_import::capture_scenario_sources;

    #[test]
    fn music_import_captures_sources_and_exports_exact_native_bytes() {
        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("scenario");
        fs::create_dir(&source).unwrap();
        let mut bytes = vec![0; 1084 + 64 * 4 * 4];
        bytes[..4].copy_from_slice(b"Song");
        bytes[950] = 1;
        bytes[1080..1084].copy_from_slice(b"M.K.");
        let mut expected = BTreeMap::new();
        for name in SCENARIO_MUSIC_FILES {
            fs::write(source.join(name), &bytes).unwrap();
            expected.insert(name.to_string(), bytes.clone());
        }
        let snapshot = ProjectSnapshot::new_authored(StableId("music-import".into()));
        let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
        let mut session = EditorSession::new(snapshot);
        import_into(&mut session, &store, &source).unwrap();
        let (sources, _, unowned) = capture_scenario_sources(&store, &source, "scenario").unwrap();
        assert_eq!(sources.len(), 3);
        assert!(unowned.is_empty());
        let payloads = session
            .snapshot()
            .assets
            .iter()
            .map(|asset| {
                let payload = store.read_blob(&asset.blob).unwrap();
                assert_eq!(payload, bytes);
                (asset.blob.0.clone(), payload)
            })
            .collect::<BTreeMap<_, _>>();
        assert_eq!(session.snapshot().assets.len(), 3);
        assert_eq!(payloads.len(), 1);
        certify_classic_no_edit_manifest_with_asset_payloads(
            session.snapshot(),
            ClassicCompatibilitySources::default(),
            &payloads,
            &expected,
        )
        .unwrap();
        let prior = session.snapshot().clone();
        fs::write(source.join("Custom 3 Music"), b"unsupported module").unwrap();
        let omissions = import_into(&mut session, &store, &source).unwrap();
        assert_eq!(omissions.len(), 1);
        assert_eq!(omissions[0].native_path, "Custom 3 Music");
        assert!(!omissions[0].reason.is_empty());
        assert_eq!(session.snapshot(), &prior);
    }
}
