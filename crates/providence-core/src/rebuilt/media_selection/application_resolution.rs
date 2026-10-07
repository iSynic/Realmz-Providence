use super::scenario_resolution::is_battle_atlas;
use super::{
    ApplicationMediaCatalog, ApplicationMediaResolution, RebuiltV3MediaOwner,
    RebuiltV3MediaRelation, RebuiltV3MediaRequirement, RebuiltV3RuntimeMediaReference,
};
use crate::{model::ProjectSnapshot, references::ResolutionState};

// A present PICT 302 override owns the decision even when malformed; never fall through.
pub(super) fn resolve_application_reference(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
    reference: &mut RebuiltV3RuntimeMediaReference,
) {
    if reference.relation == RebuiltV3MediaRelation::BattleAtlas
        && snapshot
            .assets
            .iter()
            .any(|asset| asset.classic_resource == reference.classic_resource)
    {
        return;
    }
    if reference.resolution == ResolutionState::Resolved
        || !matches!(
            reference.requirement,
            RebuiltV3MediaRequirement::ApplicationRequired
                | RebuiltV3MediaRequirement::StockFallbackAllowed
                | RebuiltV3MediaRequirement::OptionalCompanion
        )
    {
        return;
    }
    let resolution = reference.classic_resource.as_ref().map_or_else(
        || {
            reference
                .asset_id
                .as_ref()
                .filter(|_| reference.relation == RebuiltV3MediaRelation::MapTileset)
                .map_or(ApplicationMediaResolution::Missing, |tileset_id| {
                    application_media.resolve_map_tileset(tileset_id)
                })
        },
        |resource| {
            application_media.resolve_resource(resource, reference.expected_asset_kind.as_deref())
        },
    );
    apply_application_resolution(reference, resolution);
}

fn apply_application_resolution(
    reference: &mut RebuiltV3RuntimeMediaReference,
    resolution: ApplicationMediaResolution<'_>,
) {
    match resolution {
        ApplicationMediaResolution::Resolved(asset)
            if reference.relation == RebuiltV3MediaRelation::BattleAtlas
                && !is_battle_atlas(&asset.descriptor) =>
        {
            reference.resolution = ResolutionState::Missing;
            reference.resolved_asset_id = None;
            reference.resolved_owner = None;
        }
        ApplicationMediaResolution::Resolved(asset) => {
            reference.resolution = ResolutionState::StockFallback;
            reference.resolved_asset_id = Some(asset.descriptor.identity.clone());
            reference.resolved_owner = Some(RebuiltV3MediaOwner::ClassicApplication);
        }
        ApplicationMediaResolution::Ambiguous => {
            reference.resolution = ResolutionState::Ambiguous;
            reference.resolved_asset_id = None;
            reference.resolved_owner = None;
        }
        ApplicationMediaResolution::WrongKind | ApplicationMediaResolution::Missing => {
            reference.resolution = ResolutionState::Missing;
            reference.resolved_asset_id = None;
            reference.resolved_owner = None;
        }
    }
}
