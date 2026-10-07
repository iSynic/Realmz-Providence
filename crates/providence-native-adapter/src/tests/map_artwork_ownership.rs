use super::*;

#[test]
fn exact_scenario_key_resolves_its_own_identity_and_never_falls_through_when_malformed() {
    let temporary = tempdir().unwrap();
    let mut snapshot = demo_snapshot();
    snapshot.world.maps[0].runtime = Some(land_renderer_runtime(0, 4));
    let store = ProjectStore::create(temporary.path().join("project"), &snapshot).unwrap();
    let bytes = crate::map_artwork::tests::png(640, 320);
    let blob = store.put_blob(&bytes).unwrap();
    let mut asset = scenario_atlas_descriptor(blob.clone(), &bytes);
    asset.identity = StableId("scenario:exact-picture:300".into());
    asset.classic_resource.as_mut().unwrap().resource_id = 300;
    snapshot.assets.push(asset.clone());
    let map = snapshot.world.maps[0].clone();
    let session = EditorSession::new(snapshot.clone());
    let resolved =
        crate::map_rendering::resolve_map_atlas(&session, Some(&store), None, None, &map).unwrap();
    assert_eq!(resolved["available"], true);
    assert_eq!(resolved["blob"], blob.0);
    for mutation in 0..4 {
        let mut candidate = snapshot.clone();
        match mutation {
            0 => candidate.assets.last_mut().unwrap().kind = "picture".into(),
            1 => candidate.assets.last_mut().unwrap().width = Some(32),
            2 => candidate.assets.push(asset.clone()),
            _ => {
                candidate.assets.last_mut().unwrap().blob =
                    store.put_blob(b"malformed present PNG").unwrap()
            }
        }
        let session = EditorSession::new(candidate);
        let unavailable =
            crate::map_rendering::resolve_map_atlas(&session, Some(&store), None, None, &map)
                .unwrap();
        assert_eq!(unavailable["available"], false);
        assert!(unavailable.get("base64").is_none());
        assert!(
            !unavailable["reason"]
                .as_str()
                .unwrap()
                .contains("Configure")
        );
    }
}
