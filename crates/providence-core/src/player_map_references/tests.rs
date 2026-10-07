use super::*;
use crate::model::{BlobId, StableId};
use crate::rebuilt::{ApplicationMediaAmbiguity, ApplicationMediaAsset, ApplicationMediaSource};

fn asset(id: i16, identity: &str, mime: &str) -> AssetDescriptor {
    AssetDescriptor {
        identity: StableId(identity.into()),
        label: identity.into(),
        kind: "icon".into(),
        mime_type: Some(mime.into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: i32::from(id),
        }),
        scenario_music_slot: None,
        blob: BlobId("fixture".into()),
        byte_length: 4,
        classic_payload_blob: None,
        classic_payload_byte_length: None,
        extension: None,
        width: Some(32),
        height: Some(32),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: "fixture".into(),
    }
}

fn query() -> MonsterReferenceQuery {
    MonsterReferenceQuery {
        field: "marker".into(),
        current_value: -99,
        search: String::new(),
        ownership: "all".into(),
        show_unavailable: true,
        offset: 0,
        seek_current: false,
        limit: 128,
    }
}

fn catalog() -> ApplicationMediaCatalog {
    let mut catalog = ApplicationMediaCatalog::empty(StableId("fixture-library".into()));
    for priority in [0, 1] {
        catalog.sources.push(ApplicationMediaSource {
            identity: StableId(format!("source-{priority}")),
            native_name: format!("Source {priority}"),
            priority,
            blob: BlobId("fixture".into()),
            byte_length: 4,
        });
        for id in 1..=8 {
            catalog.assets.push(ApplicationMediaAsset {
                source: StableId(format!("source-{priority}")),
                source_priority: priority,
                descriptor: asset(id, &format!("stock-{priority}-{id}"), "image/png"),
            });
        }
    }
    let collision = catalog.assets.last().unwrap().clone();
    catalog.assets.push(collision);
    catalog.ambiguous_resources.push(ApplicationMediaAmbiguity {
        source: StableId("source-1".into()),
        source_priority: 1,
        resource: ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: 7,
        },
        occurrences: 2,
    });
    catalog
}

#[test]
fn indexed_choices_agree_with_exact_resolution_under_shadowing_and_ambiguity() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("fixture".into()));
    let application = catalog();
    snapshot.assets.push(asset(1, "scenario-one", "image/png"));
    snapshot.assets.extend([
        asset(2, "scenario-two", "image/png"),
        asset(2, "scenario-two-b", "image/png"),
    ]);
    snapshot
        .assets
        .push(asset(3, "unusable-override", "audio/wav"));
    let page = choices(&snapshot, Some(&application), &query()).unwrap();
    assert_eq!(page.total, 9);
    for row in page.items {
        assert_eq!(
            row,
            choice(&snapshot, Some(&application), "marker", row.value).unwrap()
        );
    }
}

#[test]
fn signed_exact_search_and_paging_cover_a_large_catalog_without_losing_current() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("fixture".into()));
    for id in -3000..0 {
        snapshot
            .assets
            .push(asset(id, &format!("Marker {id}"), "image/png"));
    }
    let mut query = query();
    query.search = "-2999".into();
    let page = choices(&snapshot, None, &query).unwrap();
    assert_eq!(page.items[0].value, -2999);
    query.search.clear();
    query.seek_current = true;
    query.limit = 64;
    let started = std::time::Instant::now();
    let page = choices(&snapshot, None, &query).unwrap();
    assert!(page.items.iter().any(|row| row.value == -99));
    assert_eq!(page.total, 3000);
    assert!(page.items.len() <= 64);
    println!(
        "PLAYER_MAP_CATALOG_3000_US {}",
        started.elapsed().as_micros()
    );
}
