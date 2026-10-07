use super::*;
use crate::catalogs::CatalogViews;
use crate::dispatch_result_with_catalogs;
use crate::dispatch_result_with_store;
use crate::media_problems::inspect_rebuilt_media_projection;
use crate::open_application_library_argument;
use crate::transport::serve_io_with_application;
use providence_core::model::ProjectSnapshot;
use providence_core::model::StableId;
use providence_core::session::EditorSession;
use providence_core::session::Revision;
use providence_storage::ReferenceCatalogStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::Value;
use serde_json::json;
use std::fs;

#[test]
fn application_media_library_is_reusable_complete_and_never_enters_project_truth() {
    let temporary = tempdir().expect("temporary application library");
    let source_directory = temporary.path().join("Realmz Data Files");
    let library_root = temporary.path().join("shared-application-library");
    write_application_source(&source_directory);
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "application-library-consumer".into(),
    )));
    assert_repeatable_application_import(&mut session, &source_directory, &library_root);
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().assets.is_empty());
    assert!(session.snapshot().classic_sources.is_empty());

    let (_, catalog) = ReferenceLibraryStore::open(&library_root).unwrap();
    let mut arguments = vec![
        "--application-library-root".to_string(),
        library_root.display().to_string(),
    ]
    .into_iter();
    let configured = open_application_library_argument(&mut arguments)
        .expect("valid application library argument")
        .expect("configured application library");
    assert_eq!(configured.catalog.assets.len(), 241);
    let input = b"{\"id\":7,\"method\":\"application-media.describe\",\"params\":{}}\n";
    let mut output = Vec::new();
    serve_io_with_application(
        &mut session,
        None,
        Some(&catalog),
        Some(&configured.store),
        Cursor::new(input),
        &mut output,
    )
    .expect("serve with configured application library");
    let response: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(response["id"], 7);
    assert_eq!(response["ok"], true);
    assert_eq!(response["result"]["configured"], true);
    assert_eq!(response["result"]["assets"], 241);
    assert_eq!(
        response["result"]["landlookAtlases"]["available"],
        json!([])
    );
    let report = inspect_rebuilt_media_projection(
        session.snapshot(),
        session.revision(),
        &empty_runtime_selection(),
        Some(&catalog),
        &json!({"limit": 200}),
    )
    .expect("strict layered report");
    assert_eq!(report["ready"], true);
    assert_eq!(report["counts"]["references"], 240);
    assert_eq!(report["counts"]["resolvedAssets"], 0);
    assert_eq!(report["counts"]["resolvedApplicationAssets"], 240);
    assert_eq!(report["counts"]["resolutions"]["stock-fallback"], 240);
    assert_eq!(report["counts"]["problemTargets"], 0);
}

#[test]
fn divinity_reference_catalog_is_bounded_read_only_and_separate_from_project_truth() {
    let temporary = tempdir().expect("temporary reference catalog");
    let source_directory = temporary.path().join("Divinity Data");
    let library_root = temporary.path().join("reference-catalog");
    write_reference_source(&source_directory);
    let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
        "reference-catalog-consumer".into(),
    )));
    let params = json!({
        "sourceDirectory": source_directory,
        "libraryRoot": library_root,
    });
    let imported = dispatch_result_with_store(
        &mut session,
        None,
        "reference-catalog.import-divinity",
        params.clone(),
    )
    .expect("import controlled reference catalog");
    assert_eq!(imported["counts"]["assets"], 2);
    assert_eq!(imported["counts"]["byKind"]["bag-item"], 1);
    assert_eq!(imported["counts"]["byKind"]["vault-icon"], 1);
    assert_eq!(imported["projectOwnership"], false);
    assert_eq!(session.revision(), Revision(0));
    assert!(session.snapshot().assets.is_empty());
    assert!(session.snapshot().classic_sources.is_empty());

    assert_reference_catalog_pages(&mut session, &library_root);
    let repeat = dispatch_result_with_store(
        &mut session,
        None,
        "reference-catalog.import-divinity",
        params,
    )
    .expect_err("catalog import must not overwrite an existing catalog");
    assert!(repeat.contains("non-empty directory"));
}

fn write_application_source(source_directory: &std::path::Path) {
    use providence_core::codecs::{ResourceEntry, encode_scenario_icon_cicn, write_resource_fork};
    fs::create_dir_all(source_directory).unwrap();
    let cicn = encode_scenario_icon_cicn(&vec![255; 32 * 32 * 4], 32, 32).unwrap();
    let resource_fork = |ids: std::ops::Range<i16>, label: &str| {
        write_resource_fork(
            &ids.map(|id| ResourceEntry {
                resource_type: *b"cicn",
                id,
                name: format!("{label} {id}"),
                attributes: 0,
                data: cicn.clone(),
            })
            .collect::<Vec<_>>(),
        )
        .unwrap()
    };
    fs::write(
        source_directory.join("The Family Jewels.rsrc"),
        resource_fork(6195..6196, "Stock item"),
    )
    .unwrap();
    fs::write(
        source_directory.join("Portraits.rsrc"),
        resource_fork(257..377, "Portrait"),
    )
    .unwrap();
    fs::write(
        source_directory.join("Tacticals.rsrc"),
        resource_fork(9000..9120, "Combat icon"),
    )
    .unwrap();
}

fn write_reference_source(source_directory: &std::path::Path) {
    use providence_core::codecs::{ResourceEntry, encode_scenario_icon_cicn, write_resource_fork};
    fs::create_dir_all(source_directory).unwrap();
    let cicn = encode_scenario_icon_cicn(&vec![255; 32 * 32 * 4], 32, 32).unwrap();
    let resource_fork = |id: i16, label: &str| {
        write_resource_fork(&[ResourceEntry {
            resource_type: *b"cicn",
            id,
            name: label.into(),
            attributes: 0,
            data: cicn.clone(),
        }])
        .unwrap()
    };
    fs::write(
        source_directory.join("Bag of Holding.rsrc"),
        resource_fork(31116, "Controlled bag item"),
    )
    .unwrap();
    fs::write(
        source_directory.join("Vault of Arcana.rsrc"),
        resource_fork(9000, "Controlled vault icon"),
    )
    .unwrap();
}

fn assert_repeatable_application_import(
    session: &mut EditorSession,
    source_directory: &std::path::Path,
    library_root: &std::path::Path,
) {
    let params = json!({
        "sourceDirectory": source_directory,
        "libraryRoot": library_root,
    });
    let first = dispatch_result_with_store(
        session,
        None,
        "application-media.import-classic-library",
        params.clone(),
    )
    .expect("first shared library import");
    let first_manifest = fs::read(first["catalogPath"].as_str().unwrap()).unwrap();
    let first_blob_count = fs::read_dir(library_root.join("blobs/sha256"))
        .unwrap()
        .count();
    let second = dispatch_result_with_store(
        session,
        None,
        "application-media.import-classic-library",
        params,
    )
    .expect("repeat shared library import");
    assert_eq!(first["manifestSha256"], second["manifestSha256"]);
    assert_eq!(
        first_manifest,
        fs::read(second["catalogPath"].as_str().unwrap()).unwrap()
    );
    assert_eq!(
        first_blob_count,
        fs::read_dir(library_root.join("blobs/sha256"))
            .unwrap()
            .count()
    );
    assert_eq!(first["counts"]["assets"], 241);
    assert_eq!(first["counts"]["appearanceRoots"], 240);
    assert_eq!(first["appearanceComplete"], true);
    assert_eq!(first["landlookAtlases"]["available"], json!([]));
    assert_eq!(
        first["landlookAtlases"]["missing"],
        json!([0, 1, 3, 4, 5, 6, 7, 8, 9, 10])
    );
    assert_eq!(first["landlookAtlases"]["dungeon"], false);
}

fn assert_reference_catalog_pages(session: &mut EditorSession, library_root: &std::path::Path) {
    let (catalog_store, catalog) = ReferenceCatalogStore::open(library_root).unwrap();
    let listed = dispatch_result_with_catalogs(
        session,
        None,
        CatalogViews {
            reference_catalog: Some(&catalog),
            reference_catalog_store: Some(&catalog_store),
            ..CatalogViews::default()
        },
        None,
        "reference-catalog.list",
        json!({"kind": "bag-item", "limit": 128}),
    )
    .expect("list bag items");
    assert_eq!(listed["total"], 1);
    assert_eq!(listed["items"][0]["identity"], "divinity:bag-item:31116");
    assert_eq!(listed["readOnly"], true);

    let preview = dispatch_result_with_catalogs(
        session,
        None,
        CatalogViews {
            reference_catalog: Some(&catalog),
            reference_catalog_store: Some(&catalog_store),
            ..CatalogViews::default()
        },
        None,
        "reference-catalog.preview",
        json!({"identity": "divinity:vault-icon:9000"}),
    )
    .expect("preview vault icon");
    assert_eq!(preview["mimeType"], "image/png");
    assert_eq!(preview["projectOwnership"], false);
    assert!(
        preview["base64"]
            .as_str()
            .is_some_and(|value| !value.is_empty())
    );
}
