use super::super::scenario_resolution::push_resource;
use super::super::*;
use super::fixtures::asset;
use crate::model::ClassicResourceKey;

#[test]
fn ambiguous_optional_companions_do_not_refuse_package_selection() {
    let snapshot = ProjectSnapshot::new_authored(StableId("optional-media".into()));
    let reference = RebuiltV3RuntimeMediaReference {
        source: StableId("player-map:0".into()),
        field_path: "markers[0].icon".into(),
        relation: RebuiltV3MediaRelation::PlayerMap,
        requirement: RebuiltV3MediaRequirement::OptionalCompanion,
        asset_id: None,
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id: -130,
        }),
        expected_asset_kind: None,
        resolution: ResolutionState::Ambiguous,
        resolved_asset_id: None,
        resolved_owner: None,
    };

    let selection =
        project_rebuilt_v3_reachable_media_from_references(&snapshot, vec![reference.clone()])
            .expect("optional companion ambiguity is not a package blocker");
    assert_eq!(selection.references, vec![reference]);
    assert!(selection.assets.assets.is_empty());
}

#[test]
fn ambiguous_optional_override_is_refused_instead_of_falling_through() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("ambiguous".into()));
    snapshot.assets = vec![
        asset("sound:first", "sound", Some("snd "), 612),
        asset("sound:second", "sound", Some("snd "), 612),
    ];
    let mut references = Vec::new();
    push_resource(
        &mut references,
        &snapshot,
        StableId("classic.item.1".into()),
        "soundId+600".into(),
        RebuiltV3MediaRelation::ItemSound,
        RebuiltV3MediaRequirement::StockFallbackAllowed,
        "snd ",
        612,
    );
    assert_eq!(references[0].resolution, ResolutionState::Ambiguous);
}

#[test]
fn required_ambiguity_precedes_absence_and_keeps_the_first_exact_caller() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("competing-media".into()));
    snapshot.assets = vec![
        asset("picture:first", "picture", Some("PICT"), 501),
        asset("picture:second", "picture", Some("PICT"), 501),
    ];
    let mut references = Vec::new();
    for (field, resource) in [("missing", 502), ("first", 501), ("second", 501)] {
        push_resource(
            &mut references,
            &snapshot,
            StableId("trigger:1".into()),
            field.into(),
            RebuiltV3MediaRelation::CampaignSplash,
            RebuiltV3MediaRequirement::PackageRequired,
            "PICT",
            resource,
        );
    }
    let error =
        project_rebuilt_v3_reachable_media_from_references(&snapshot, references).unwrap_err();
    let RebuiltV3ReachableMediaError::Ambiguous(problems) = error else {
        panic!("required ambiguity must precede absence");
    };
    assert_eq!(problems.len(), 1);
    assert_eq!(problems[0].field_path, "first");
}

#[test]
fn imported_absent_presentation_is_retained_but_required_campaign_media_stays_strict() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("absent-media".into()));
    let mut references = Vec::new();
    push_resource(
        &mut references,
        &snapshot,
        StableId("land:0".into()),
        "tileset".into(),
        RebuiltV3MediaRelation::MapTileset,
        RebuiltV3MediaRequirement::ApplicationRequired,
        "PICT",
        301,
    );
    assert!(matches!(
        project_rebuilt_v3_reachable_media_from_references(&snapshot, references.clone()),
        Err(RebuiltV3ReachableMediaError::UnresolvedRequired(_))
    ));
    snapshot.origin = crate::model::ProjectOrigin::Imported {
        compatibility_annex: crate::model::BlobId(format!("sha256:{}", "f".repeat(64))),
    };
    let selection =
        project_rebuilt_v3_reachable_media_from_references(&snapshot, references.clone()).unwrap();
    assert_eq!(selection.references, references);
    references[0].relation = RebuiltV3MediaRelation::CampaignSplash;
    assert!(matches!(
        project_rebuilt_v3_reachable_media_from_references(&snapshot, references),
        Err(RebuiltV3ReachableMediaError::UnresolvedRequired(_))
    ));
}
