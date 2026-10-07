use super::*;
use crate::model::{AssetDescriptor, BlobId, ProjectSnapshot, StableId};
use crate::rebuilt::{ApplicationMediaAsset, ApplicationMediaCatalog, ApplicationMediaSource};

fn asset(identity: &str, kind: &str, resource_type: &str, id: i32) -> AssetDescriptor {
    serde_json::from_value(serde_json::json!({
        "identity": identity, "label": identity, "kind": kind,
        "classicResource": {"resourceType": resource_type, "resourceId": id},
        "blob": "fixture", "byteLength": 1, "source": "controlled fixture"
    }))
    .unwrap()
}

fn sound_targets(snapshot: &ProjectSnapshot) -> Vec<ActionTarget> {
    list_targets(
        snapshot,
        &ActionTargetQuery {
            kind: ActionTargetKind::Sound,
            search: String::new(),
            cursor: None,
            limit: 128,
            context: Default::default(),
        },
    )
    .unwrap()
    .items
}

fn sound_preview(snapshot: &ProjectSnapshot, value: i16) -> Option<ActionValuePreview> {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.9".into(),
            target_native_id: value,
            values: Default::default(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap()
    .fields[0]
        .preview
        .clone()
}

fn stock_catalog(assets: Vec<ApplicationMediaAsset>) -> ApplicationMediaCatalog {
    let mut catalog = ApplicationMediaCatalog::empty(StableId("stock".into()));
    catalog.sources = vec![
        ApplicationMediaSource {
            identity: StableId("family-jewels".into()),
            native_name: "The Family Jewels.rsrc".into(),
            priority: 1,
            blob: BlobId("source-low".into()),
            byte_length: 1,
        },
        ApplicationMediaSource {
            identity: StableId("tacticals".into()),
            native_name: "Tacticals.rsrc".into(),
            priority: 3,
            blob: BlobId("source-high".into()),
            byte_length: 1,
        },
    ];
    catalog.assets = assets;
    catalog
}

fn stock_sound(identity: &str, source: &str, priority: u32, id: i32) -> ApplicationMediaAsset {
    ApplicationMediaAsset {
        source: StableId(source.into()),
        source_priority: priority,
        descriptor: asset(identity, "sound", "snd ", id),
    }
}

// Classic misc.c:1875: GetResource('snd ', abs(value)) uses both type and ID.
#[test]
fn media_pickers_require_the_exact_resource_type_and_presentation_role() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("media-keys".into()));
    snapshot.assets = vec![
        asset("wrong-type", "sound", "PICT", 33),
        asset("wrong-role", "picture", "snd ", 34),
        asset("actual-sound", "sound", "snd ", 35),
        asset("same-id-picture", "picture", "PICT", 35),
        asset("negative-key", "sound", "snd ", -36),
    ];
    let items = sound_targets(&snapshot);
    assert_eq!(
        items
            .iter()
            .map(|t| t.identity.0.as_str())
            .collect::<Vec<_>>(),
        ["actual-sound"]
    );
    assert!(sound_preview(&snapshot, 33).is_none());
    assert!(sound_preview(&snapshot, 34).is_none());
    assert_eq!(
        sound_preview(&snapshot, -35).unwrap().identity.0,
        "actual-sound"
    );
    assert!(sound_preview(&snapshot, -36).is_none());
}

#[test]
fn ambiguous_media_keys_never_pick_an_arbitrary_asset_even_with_different_roles() {
    for other_kind in ["sound", "picture"] {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("media-ambiguity".into()));
        snapshot.assets = vec![
            asset("first", "sound", "snd ", 33),
            asset("second", other_kind, "snd ", 33),
        ];
        let before = snapshot.clone();
        assert!(sound_targets(&snapshot).is_empty());
        assert!(sound_preview(&snapshot, 33).is_none());
        snapshot.assets.reverse();
        assert!(sound_targets(&snapshot).is_empty());
        assert!(sound_preview(&snapshot, -33).is_none());
        snapshot.assets.reverse();
        assert_eq!(snapshot, before);
    }
}

#[test]
fn stock_sound_targets_are_source_qualified_and_follow_application_priority() {
    let snapshot = ProjectSnapshot::new_authored(StableId("stock-sounds".into()));
    let catalog = stock_catalog(vec![
        stock_sound("low-147", "family-jewels", 1, 147),
        stock_sound("high-147", "tacticals", 3, 147),
    ]);
    let page = list_targets_with_application(
        &snapshot,
        Some(&catalog),
        &ActionTargetQuery {
            kind: ActionTargetKind::Sound,
            search: String::new(),
            cursor: None,
            limit: 128,
            context: Default::default(),
        },
    )
    .unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].identity.0, "high-147");
    assert_eq!(
        page.items[0].status,
        ActionTargetStatus::ApplicationResource
    );
    assert!(page.items[0].detail.contains("Tacticals.rsrc"));

    let description = describe_action_form_with_application(
        &snapshot,
        Some(&catalog),
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.9".into(),
            target_native_id: -147,
            values: Default::default(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap();
    let preview = description.fields[0].preview.as_ref().unwrap();
    assert_eq!(preview.identity.0, "high-147");
    assert_eq!(preview.status, ActionTargetStatus::ApplicationResource);
}

#[test]
fn any_exact_scenario_sound_key_blocks_stock_fallback_before_role_selection() {
    let catalog = stock_catalog(vec![stock_sound("stock-147", "tacticals", 3, 147)]);
    for scenario in [
        vec![asset("scenario-147", "sound", "snd ", 147)],
        vec![asset("wrong-role-147", "picture", "snd ", 147)],
        vec![
            asset("duplicate-a", "sound", "snd ", 147),
            asset("duplicate-b", "sound", "snd ", 147),
        ],
    ] {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("scenario-shadow".into()));
        snapshot.assets = scenario;
        let page = list_targets_with_application(
            &snapshot,
            Some(&catalog),
            &ActionTargetQuery {
                kind: ActionTargetKind::Sound,
                search: String::new(),
                cursor: None,
                limit: 128,
                context: Default::default(),
            },
        )
        .unwrap();
        assert!(page.items.iter().all(|item| item.identity.0 != "stock-147"));
        let description = describe_action_form_with_application(
            &snapshot,
            Some(&catalog),
            &ActionFormDescribeQuery {
                action_identity: "realmz.action.9".into(),
                target_native_id: 147,
                values: Default::default(),
                secondary_values: Default::default(),
                context: Default::default(),
            },
        )
        .unwrap();
        let preview = description.fields[0].preview.as_ref();
        if snapshot.assets.len() == 1 && snapshot.assets[0].kind == "sound" {
            assert_eq!(preview.unwrap().identity.0, "scenario-147");
        } else {
            assert!(preview.is_none());
        }
    }
}
