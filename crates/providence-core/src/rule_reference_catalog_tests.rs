use super::*;
use crate::model::StableId;
use crate::rebuilt::ApplicationMediaAsset;

fn asset(id: i32, kind: &str) -> AssetDescriptor {
    serde_json::from_value(serde_json::json!({"identity":format!("exact:cicn:{id}"),"label":format!("Portrait {id}"),
        "kind":kind,"mimeType":"image/png","classicResource":{"resourceType":"cicn","resourceId":id},
        "blob":"preview","byteLength":4,"classicPayloadBlob":"native","classicPayloadByteLength":5,
        "width":32,"height":40,"source":"controlled descriptor"})).unwrap()
}
fn snapshot() -> ProjectSnapshot {
    ProjectSnapshot::new_authored(StableId("rule-picker".into()))
}
fn query(field: &str, value: i16, search: &str) -> MonsterReferenceQuery {
    MonsterReferenceQuery {
        field: field.into(),
        current_value: value,
        search: search.into(),
        ownership: "all".into(),
        show_unavailable: false,
        offset: 0,
        seek_current: true,
        limit: 64,
    }
}

#[test]
fn rule_portrait_sets_require_six_exact_resources_and_search_resource_aliases() {
    let mut project = snapshot();
    project
        .assets
        .extend((257..263).map(|id| asset(id, "portrait")));
    let choice = portrait_choice(&project, None, "defaultIconSet", 1).unwrap();
    assert!(choice.available);
    assert_eq!(choice.resources.len(), 6);
    assert_eq!(
        choice.resources[0].identity.as_deref(),
        Some("exact:cicn:257")
    );
    let page = rule_choices(&project, None, &[], &query("defaultIconSet", 1, "260")).unwrap();
    assert_eq!(page["items"][0]["value"], 1);
    project.assets.pop();
    assert!(
        !portrait_choice(&project, None, "defaultIconSet", 1)
            .unwrap()
            .available
    );
    assert!(
        rule_choices(&project, None, &[], &query("defaultIconSet", 1, "260")).unwrap()["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let mut unavailable = query("defaultIconSet", 1, "260");
    unavailable.show_unavailable = true;
    assert!(
        rule_choices(&project, None, &[], &unavailable).unwrap()["items"][0]["reason"]
            .as_str()
            .unwrap()
            .contains("262")
    );
}

#[test]
fn rule_signed_direct_identities_and_source_filters_remain_distinct() {
    let mut project = snapshot();
    project
        .assets
        .extend([-14, 14, 257].map(|id| asset(id, "portrait")));
    let page = rule_choices(&project, None, &[], &query("defaultIcon", 257, "-14")).unwrap();
    assert_eq!(page["items"][0]["value"], -14);
    assert_eq!(page["items"][0]["targetIdentity"], "exact:cicn:-14");
    let mut stock = query("defaultIcon", 257, "");
    stock.ownership = "stock".into();
    assert_eq!(
        rule_choices(&project, None, &[], &stock).unwrap()["total"],
        0
    );
    assert_eq!(
        rule_choices(
            &project,
            None,
            &[],
            &query("defaultIcon", 257, "no matches")
        )
        .unwrap()["total"],
        0
    );
    assert!(portrait_choice(&project, None, "defaultIcon", i32::MAX).is_err());
}

#[test]
fn rule_scenario_wrong_kind_and_ambiguity_block_stock_fallback() {
    let mut application = ApplicationMediaCatalog::empty(StableId("controlled-library".into()));
    application
        .sources
        .push(crate::rebuilt::ApplicationMediaSource {
            identity: StableId("stock".into()),
            native_name: "controlled".into(),
            priority: 0,
            blob: crate::model::BlobId("source".into()),
            byte_length: 1,
        });
    application.assets.push(ApplicationMediaAsset {
        source: StableId("stock".into()),
        source_priority: 0,
        descriptor: asset(257, "portrait"),
    });
    let mut project = snapshot();
    assert!(
        portrait_choice(&project, Some(&application), "defaultIcon", 257)
            .unwrap()
            .available
    );
    project.assets.push(asset(257, "sound"));
    let choice = portrait_choice(&project, Some(&application), "defaultIcon", 257).unwrap();
    assert!(!choice.available);
    assert_eq!(choice.ownership, "scenario");
    assert!(choice.reason.contains("wrong kind"));
    project.assets.push(asset(257, "portrait"));
    assert!(
        portrait_choice(&project, Some(&application), "defaultIcon", 257)
            .unwrap()
            .reason
            .contains("ambiguous")
    );
}
