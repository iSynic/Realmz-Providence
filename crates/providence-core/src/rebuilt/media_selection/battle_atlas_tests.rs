use super::tests::{asset, complete_application_appearance_catalog, scenario};
use super::*;
use crate::model::AssetDescriptor;
use crate::rebuilt::ApplicationMediaAsset;

fn atlas() -> AssetDescriptor {
    let mut atlas = asset("shared-map-resource", "tileset", Some("PICT"), 302);
    atlas.width = Some(640);
    atlas.height = Some(640);
    atlas.tile_width = Some(32);
    atlas.tile_height = Some(32);
    atlas.columns = Some(20);
    atlas.rows = Some(20);
    atlas
}

fn application() -> ApplicationMediaCatalog {
    let mut application = complete_application_appearance_catalog();
    application.assets.push(ApplicationMediaAsset {
        source: application.sources[0].identity.clone(),
        source_priority: 0,
        descriptor: atlas(),
    });
    application
}

fn select(
    snapshot: &ProjectSnapshot,
    application: &ApplicationMediaCatalog,
) -> Result<RebuiltV3ReachableMediaSelection, RebuiltV3ReachableMediaError> {
    project_rebuilt_v3_reachable_media_with_application(
        snapshot,
        application,
        &scenario(),
        &[],
        &[],
        &[],
        &[],
        true,
    )
}

#[test]
fn battles_require_the_complete_exact_resource_with_scenario_precedence() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-media".into()));
    let application = application();
    let selected = select(&snapshot, &application).unwrap();
    assert!(selected.assets.assets.is_empty());
    let reference = selected
        .references
        .iter()
        .find(|reference| reference.relation == RebuiltV3MediaRelation::BattleAtlas)
        .unwrap();
    assert_eq!(
        reference.requirement,
        RebuiltV3MediaRequirement::ApplicationRequired
    );
    assert_eq!(
        reference.resolved_owner,
        Some(RebuiltV3MediaOwner::ClassicApplication)
    );
    assert_eq!(reference.classic_resource, atlas().classic_resource);
    snapshot.assets.push(atlas());
    let selected = select(&snapshot, &application).unwrap();
    assert_eq!(selected.assets.assets.len(), 1);
    assert!(
        selected
            .references
            .iter()
            .any(
                |reference| reference.relation == RebuiltV3MediaRelation::BattleAtlas
                    && reference.resolved_owner == Some(RebuiltV3MediaOwner::ScenarioPackage)
            )
    );
}

#[test]
fn malformed_or_ambiguous_scenario_atlas_never_falls_through_to_stock() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("battle-media".into()));
    let application = application();
    for invalid in ["size", "grid", "kind", "mime"] {
        snapshot.assets = vec![atlas()];
        match invalid {
            "size" => snapshot.assets[0].width = Some(64),
            "grid" => snapshot.assets[0].tile_width = Some(16),
            "kind" => snapshot.assets[0].kind = "picture".into(),
            _ => snapshot.assets[0].mime_type = Some("application/octet-stream".into()),
        }
        assert!(
            matches!(
                select(&snapshot, &application),
                Err(RebuiltV3ReachableMediaError::UnresolvedRequired(_))
            ),
            "{invalid} override cannot fall through"
        );
    }
    snapshot.assets = vec![atlas(), atlas()];
    snapshot.assets[1].identity = StableId("duplicate-resource".into());
    assert!(matches!(
        select(&snapshot, &application),
        Err(RebuiltV3ReachableMediaError::Ambiguous(_))
    ));
}

#[test]
fn absent_malformed_or_ambiguous_stock_atlas_blocks_required_presentation() {
    let snapshot = ProjectSnapshot::new_authored(StableId("battle-media".into()));
    let mut application = complete_application_appearance_catalog();
    assert!(matches!(
        select(&snapshot, &application),
        Err(RebuiltV3ReachableMediaError::UnresolvedRequired(_))
    ));
    application = self::application();
    application.assets.last_mut().unwrap().descriptor.width = Some(64);
    assert!(matches!(
        select(&snapshot, &application),
        Err(RebuiltV3ReachableMediaError::UnresolvedRequired(_))
    ));
    application.assets.last_mut().unwrap().descriptor = atlas();
    let mut duplicate = application.assets.last().unwrap().clone();
    duplicate.descriptor.identity = StableId("duplicate-application-resource".into());
    application.assets.push(duplicate);
    assert!(matches!(
        select(&snapshot, &application),
        Err(RebuiltV3ReachableMediaError::Ambiguous(_))
    ));
}

#[test]
fn queued_spell_requires_exact_atlas_without_a_battle_record() {
    let mut snapshot = ProjectSnapshot::new_authored(StableId("spell-media".into()));
    let application = application();
    let mut spell = queue_spell();
    for queue in [1, 10, 200u8 as i8] {
        spell.queue_icon = queue;
        let refs = derive_rebuilt_v3_reachable_media_references_with_application(
            &snapshot,
            &application,
            &scenario(),
            &[],
            &[spell.clone()],
            &[],
            &[],
            false,
        );
        let reference = refs
            .iter()
            .find(|r| r.field_path == "queueIcon.battleAtlas")
            .unwrap();
        assert_eq!(reference.classic_resource, atlas().classic_resource);
        assert_eq!(
            reference.resolved_owner,
            Some(RebuiltV3MediaOwner::ClassicApplication)
        );
        snapshot.assets = vec![atlas()];
        snapshot.assets[0].width = Some(64);
        let refs = derive_rebuilt_v3_reachable_media_references_with_application(
            &snapshot,
            &application,
            &scenario(),
            &[],
            &[spell.clone()],
            &[],
            &[],
            false,
        );
        assert_eq!(
            refs.iter()
                .find(|r| r.field_path == "queueIcon.battleAtlas")
                .unwrap()
                .resolution,
            ResolutionState::Missing
        );
        snapshot.assets.clear();
    }
    spell.queue_icon = 0;
    let refs = derive_rebuilt_v3_reachable_media_references(
        &snapshot,
        &scenario(),
        &[],
        &[spell],
        &[],
        &[],
        false,
    );
    assert!(!refs.iter().any(|r| r.field_path == "queueIcon.battleAtlas"));
}

fn queue_spell() -> RebuiltV3SpellDefinition {
    let definition = crate::session::spell_authoring::new_scenario_spell(0).unwrap();
    let mut serialized = serde_json::to_value(definition).unwrap();
    serialized["canRotate"] = serde_json::json!(false);
    let spell: RebuiltV3SpellDefinition = serde_json::from_value(serialized).unwrap();
    spell
}
