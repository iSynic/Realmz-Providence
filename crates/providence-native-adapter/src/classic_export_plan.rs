use providence_core::{
    codecs::NativeFileFamily,
    compiler::{ManifestSource, NativeManifest},
    session::Revision,
};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
struct PageRequest {
    #[serde(default)]
    offset: usize,
    #[serde(default = "super::rebuilt_export_plan::default_limit")]
    limit: usize,
}

pub(crate) fn project(
    manifest: &NativeManifest,
    revision: Revision,
    params: Value,
) -> Result<Value, String> {
    let request: PageRequest = serde_json::from_value(params)
        .map_err(|error| format!("invalid Classic file-plan parameters: {error}"))?;
    let limit = request.limit.clamp(1, 128);
    let total = manifest.files().len();
    let required_directory_name = manifest.files().find_map(|(name, entry)| {
        matches!(
            entry.source,
            ManifestSource::Generated {
                family: NativeFileFamily::ScenarioStartup
            }
        )
        .then_some(name)
    });
    let items = manifest
        .files()
        .skip(request.offset)
        .take(limit)
        .map(|(path, entry)| {
            let family = match &entry.source {
                ManifestSource::Generated { family } => Some(family),
                ManifestSource::CompatibilityAnnex { .. } => None,
            };
            json!({"path": path, "bytes": entry.bytes.len(), "family": family})
        })
        .collect::<Vec<_>>();
    Ok(json!({
        "revision": revision,
        "scope": "classic-slice",
        "completeScenario": false,
        "requiredDirectoryName": required_directory_name,
        "files": {
            "items": items,
            "offset": request.offset,
            "limit": limit,
            "total": total,
            "truncated": request.offset.saturating_add(limit) < total,
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::model::BlobId;

    #[test]
    fn every_native_file_is_paged_once_without_payload_or_annex_identifiers() {
        let mut manifest = NativeManifest::default();
        for index in 0..501 {
            manifest.insert_preserved(
                format!("Retained {index:03}"),
                BlobId("private-source-id".into()),
                vec![index as u8; index + 1],
            );
        }
        manifest.insert_generated("Example", NativeFileFamily::ScenarioStartup, vec![0; 20]);
        let mut paths = Vec::new();
        for offset in (0..502).step_by(64) {
            let plan = project(&manifest, Revision(7), json!({"offset": offset})).unwrap();
            assert_eq!(plan["requiredDirectoryName"], "Example");
            assert_eq!(plan["revision"], 7);
            assert_eq!(plan["completeScenario"], false);
            assert_eq!(plan["files"]["total"], 502);
            assert_eq!(plan["files"]["truncated"], offset + 64 < 502);
            for row in plan["files"]["items"].as_array().unwrap() {
                assert_eq!(row.as_object().unwrap().len(), 3);
                let path = row["path"].as_str().unwrap();
                assert_eq!(row["bytes"], manifest.get(path).unwrap().bytes.len());
                assert_eq!(row["family"].is_null(), path != "Example");
                paths.push(path.to_owned());
            }
            assert!(!plan.to_string().contains("private-source-id"));
        }
        assert_eq!(
            paths,
            manifest.files().map(|(path, _)| path).collect::<Vec<_>>()
        );
        for (offset, limit, count) in [(0, 0, 1), (0, usize::MAX, 128), (usize::MAX, 64, 0)] {
            let plan = project(
                &manifest,
                Revision(7),
                json!({"offset": offset, "limit": limit}),
            )
            .unwrap();
            assert_eq!(plan["files"]["items"].as_array().unwrap().len(), count);
        }
        assert!(project(&manifest, Revision(7), json!({"offset": -1})).is_err());
    }

    #[test]
    fn dispatched_plan_matches_published_files_without_writing_a_destination() {
        let temporary = tempfile::tempdir().unwrap();
        let mut session =
            providence_core::session::EditorSession::new(crate::demo::demo_snapshot());
        assert!(
            crate::dispatch_result_with_store(
                &mut session,
                None,
                "project.inspect-classic-plan",
                json!({})
            )
            .unwrap_err()
            .contains("requires serve-project")
        );
        crate::dispatch_result(&mut session, "action-reference.retarget", json!({
            "expectedRevision": 0, "source": "action-point:land:0:17", "slot": 0, "targetNativeId": 47
        })).unwrap();
        let store = providence_storage::ProjectStore::create(
            temporary.path().join("project"),
            session.snapshot(),
        )
        .unwrap();
        let before = session.snapshot().clone();
        let plan = crate::dispatch_result_with_store(
            &mut session,
            Some(&store),
            "project.inspect-classic-plan",
            json!({"limit": 2}),
        )
        .unwrap();
        assert_eq!(plan["files"]["total"], 6);
        assert_eq!(plan["files"]["items"].as_array().unwrap().len(), 2);
        assert_eq!(std::fs::read_dir(temporary.path()).unwrap().count(), 1);
        assert_eq!(session.snapshot(), &before);
        assert_eq!(session.revision(), Revision(1));
        let output = temporary.path().join("published");
        crate::dispatch_result_with_store(
            &mut session,
            Some(&store),
            "project.compile-classic-slice",
            json!({"directory": output}),
        )
        .unwrap();
        let full = crate::dispatch_result_with_store(
            &mut session,
            Some(&store),
            "project.inspect-classic-plan",
            json!({}),
        )
        .unwrap();
        assert_eq!(
            full["files"]["total"],
            std::fs::read_dir(&output).unwrap().count()
        );
        for row in full["files"]["items"].as_array().unwrap() {
            assert_eq!(
                row["bytes"],
                std::fs::metadata(output.join(row["path"].as_str().unwrap()))
                    .unwrap()
                    .len()
            );
        }
    }

    #[test]
    fn classic_publication_honors_an_expected_revision() {
        let temporary = tempfile::tempdir().unwrap();
        let mut session =
            providence_core::session::EditorSession::new(crate::demo::demo_snapshot());
        crate::dispatch_result(
            &mut session,
            "action-reference.retarget",
            json!({
                "expectedRevision": 0, "source": "action-point:land:0:17",
                "slot": 0, "targetNativeId": 47
            }),
        )
        .unwrap();
        let store = providence_storage::ProjectStore::create(
            temporary.path().join("project"),
            session.snapshot(),
        )
        .unwrap();
        let output = temporary.path().join("published");
        let error = crate::dispatch_result_with_store(
            &mut session,
            Some(&store),
            "project.compile-classic-slice",
            json!({"directory": output, "expectedRevision": 0}),
        )
        .unwrap_err();
        assert!(error.contains("revision conflict: expected 0, current 1"));
        assert!(!output.exists());
    }

    #[test]
    fn blocked_project_does_not_receive_a_ready_file_plan() {
        let temporary = tempfile::tempdir().unwrap();
        let mut session =
            providence_core::session::EditorSession::new(crate::demo::demo_snapshot());
        let store = providence_storage::ProjectStore::create(
            temporary.path().join("project"),
            session.snapshot(),
        )
        .unwrap();
        assert!(
            crate::dispatch_result_with_store(
                &mut session,
                Some(&store),
                "project.inspect-classic-plan",
                json!({})
            )
            .is_err()
        );
        assert_eq!(session.revision(), Revision(0));
        assert_eq!(std::fs::read_dir(temporary.path()).unwrap().count(), 1);
    }
}
