use super::*;

#[test]
fn all_authored_media_exports_exact_classic_payloads_and_rebuilt_catalog() {
    let mut f = Fixture::new();
    let image = f.png("front.png", [90, 20, 120, 180]);
    let reverse = f.png("reverse.png", [20, 130, 40, 255]);
    let text = f.temporary.path().join("scroll.txt");
    fs::write(&text, "Café by the river.\n".repeat(100)).unwrap();
    let sound = f.temporary.path().join("voice.wav");
    fs::write(
        &sound,
        providence_core::codecs::encode_runtime_pcm_wav(&[0, 40, 80, 120], 11025, 1, 8).unwrap(),
    )
    .unwrap();
    for (kind, id, source) in [
        ("picture", 30000, &image),
        ("icon", 30001, &image),
        ("special-land-tile", -30000, &image),
        ("sound", 490, &sound),
        ("text-resource", -32768, &text),
        ("combat-icon", 31000, &image),
    ] {
        f.commit(
            "media.import",
            json!({"destination":"scenario","expectedRevision":f.session.revision().0,
            "path":source,"reversePath":if kind=="combat-icon" {Some(&reverse)} else {None},
            "kind":kind,"name":"Authored media","resourceId":id,"width":64,"height":64}),
        );
    }
    f.add_style(-32768);
    verify_outputs(&f);
}

fn verify_outputs(f: &Fixture) {
    let directory = f.temporary.path().join("classic-output");
    crate::classic_compilation::compile_project_classic_slice(
        &f.session,
        &f.project,
        json!({"directory":directory}),
    )
    .unwrap();
    let resources = providence_core::codecs::parse_resource_entries(
        &fs::read(directory.join("Scenario.rsrc")).unwrap(),
    )
    .unwrap();
    for asset in &f.session.snapshot().assets {
        let key = asset.classic_resource.as_ref().unwrap();
        let resource = resources
            .iter()
            .find(|entry| {
                String::from_utf8_lossy(&entry.resource_type) == key.resource_type
                    && i32::from(entry.id) == key.resource_id
            })
            .unwrap_or_else(|| {
                panic!(
                    "Missing Classic resource for {:?}; emitted keys {:?}",
                    asset.identity,
                    resources
                        .iter()
                        .map(|row| (row.resource_type, row.id))
                        .collect::<Vec<_>>()
                )
            });
        assert_eq!(
            resource.data,
            f.project
                .read_blob(asset.classic_payload_blob.as_ref().unwrap())
                .unwrap()
        );
    }
    verify_rebuilt_outputs(f);
}

fn verify_rebuilt_outputs(f: &Fixture) {
    let index =
        providence_core::rebuilt::project_rebuilt_v3_asset_index(f.session.snapshot()).unwrap();
    let payloads =
        crate::rebuilt_publication::read_rebuilt_media_index(&f.project, &index).unwrap();
    assert_eq!(
        payloads.len(),
        index
            .assets
            .iter()
            .map(|asset| &asset.path)
            .collect::<std::collections::BTreeSet<_>>()
            .len()
    );
    assert_eq!(index.assets.len(), 8);
    assert_eq!(index.assets.len(), f.session.snapshot().assets.len());
    for asset in &index.assets {
        let original = f
            .session
            .snapshot()
            .assets
            .iter()
            .find(|row| row.identity == asset.id)
            .unwrap();
        let payload = payloads
            .iter()
            .find(|(path, _)| path == &asset.path)
            .unwrap();
        assert_eq!(payload.1, f.project.read_blob(&original.blob).unwrap());
        assert_eq!(
            asset.resource_id,
            Some(original.classic_resource.as_ref().unwrap().resource_id)
        );
    }
}

#[test]
fn original_only_rejects_reverse_without_losing_either_source() {
    let mut f = Fixture::new();
    let front = f.png("front.png", [1, 2, 3, 255]);
    let reverse = f.png("reverse.png", [4, 5, 6, 255]);
    let before = (fs::read(&front).unwrap(), fs::read(&reverse).unwrap());
    let response = f.request("media.import.prepare", json!({"destination":"personal","output":"original",
        "expectedLibraryRevision":0,"path":front,"reversePath":reverse,"kind":"combat-icon","name":"Original"}));
    assert_eq!(response["ok"], false);
    assert!(
        response["error"]
            .as_str()
            .unwrap()
            .contains("both monster artwork files")
    );
    assert_eq!(f.library.load_manifest().unwrap().revision(), 0);
    assert_eq!(
        (fs::read(front).unwrap(), fs::read(reverse).unwrap()),
        before
    );
}

#[test]
fn sound_review_distinguishes_original_and_prepared_format_without_writing() {
    let mut f = Fixture::new();
    let path = f.temporary.path().join("stereo.wav");
    let bytes =
        providence_core::codecs::encode_runtime_pcm_wav(&[0, 0, 0, 0].repeat(11025), 11025, 2, 16)
            .unwrap();
    fs::write(&path, &bytes).unwrap();
    let response = f.request(
        "media.import.prepare",
        json!({"destination":"scenario",
        "expectedRevision":0,"kind":"sound","resourceId":200,"path":path,"name":"Stream"}),
    );
    assert_eq!(response["ok"], true, "{response}");
    let source = &response["result"]["source"];
    assert_eq!(source["sampleRate"], 11025);
    assert_eq!(source["durationMs"], 1000);
    assert_eq!(source["channels"], 2);
    assert_eq!(source["bitsPerSample"], 16);
    let output = &response["result"]["media"]["primary"];
    assert_eq!(output["sampleRate"], 11025);
    assert_eq!(output["durationMs"], 1000);
    assert_eq!(output["channels"], 1);
    assert!(f.session.snapshot().assets.is_empty());
    assert_eq!(fs::read(path).unwrap(), bytes);
}
