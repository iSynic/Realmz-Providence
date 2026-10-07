use super::scenario_resolution::{push_asset, push_resource, push_resource_of_kind};
use super::{RebuiltV3MediaRelation, RebuiltV3MediaRequirement, RebuiltV3RuntimeMediaReference};
use crate::model::{ProjectSnapshot, StableId};

pub(super) fn append_appearance(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
) {
    for resource_id in 257..377 {
        push_resource_of_kind(
            references,
            snapshot,
            StableId("runtime:appearance-catalog".into()),
            format!("portraits[{resource_id}]"),
            RebuiltV3MediaRelation::AppearanceCatalog,
            RebuiltV3MediaRequirement::ApplicationRequired,
            "cicn",
            resource_id,
            "portrait",
        );
    }
    for resource_id in 9000..9120 {
        push_resource_of_kind(
            references,
            snapshot,
            StableId("runtime:appearance-catalog".into()),
            format!("combatIcons[{resource_id}]"),
            RebuiltV3MediaRelation::AppearanceCatalog,
            RebuiltV3MediaRequirement::ApplicationRequired,
            "cicn",
            resource_id,
            "combat-icon",
        );
    }
}

pub(super) fn append_campaign(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    has_reachable_battles: bool,
) {
    if let Some(campaign) = &snapshot.campaign
        && !campaign.splash_asset_id.is_empty()
    {
        push_asset(
            references,
            snapshot,
            snapshot.project_id.clone(),
            "campaign.splashAssetId".into(),
            RebuiltV3MediaRelation::CampaignSplash,
            RebuiltV3MediaRequirement::PackageRequired,
            StableId(campaign.splash_asset_id.clone()),
        );
    }
    if has_reachable_battles {
        push_resource(
            references,
            snapshot,
            StableId("runtime:combat-presentation".into()),
            "battleAtlas".into(),
            RebuiltV3MediaRelation::BattleAtlas,
            RebuiltV3MediaRequirement::ApplicationRequired,
            "PICT",
            302,
        );
    }
}

pub(super) fn append_music(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
) {
    for asset in snapshot
        .assets
        .iter()
        .filter(|asset| asset.scenario_music_slot.is_some())
    {
        push_asset(
            references,
            snapshot,
            snapshot.project_id.clone(),
            format!("scenarioMusic[{}]", asset.scenario_music_slot.unwrap()),
            RebuiltV3MediaRelation::ScenarioMusic,
            RebuiltV3MediaRequirement::PackageRequired,
            asset.identity.clone(),
        );
    }
}
