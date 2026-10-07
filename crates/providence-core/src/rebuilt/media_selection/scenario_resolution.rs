use super::{
    RebuiltV3MediaOwner, RebuiltV3MediaRelation, RebuiltV3MediaRequirement,
    RebuiltV3RuntimeMediaReference,
};
use crate::{
    model::{AssetDescriptor, ClassicResourceKey, ProjectSnapshot, StableId},
    references::ResolutionState,
};

pub(super) fn push_sound(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    source: StableId,
    field_path: String,
    sound_id: i16,
    relation: RebuiltV3MediaRelation,
) {
    if sound_id != 0 {
        push_resource(
            references,
            snapshot,
            source,
            field_path,
            relation,
            RebuiltV3MediaRequirement::StockFallbackAllowed,
            "snd ",
            i32::from(sound_id).abs(),
        );
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn push_resource_if_nonzero(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    source: StableId,
    field_path: String,
    relation: RebuiltV3MediaRelation,
    resource_type: &str,
    resource_id: i32,
) {
    if resource_id != 0 {
        push_resource(
            references,
            snapshot,
            source,
            field_path,
            relation,
            RebuiltV3MediaRequirement::StockFallbackAllowed,
            resource_type,
            resource_id,
        );
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn push_resource(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    source: StableId,
    field_path: String,
    relation: RebuiltV3MediaRelation,
    requirement: RebuiltV3MediaRequirement,
    resource_type: &str,
    resource_id: i32,
) {
    push_resource_with_kind(
        references,
        snapshot,
        source,
        field_path,
        relation,
        requirement,
        resource_type,
        resource_id,
        None,
    );
}

#[allow(clippy::too_many_arguments)]
pub(super) fn push_resource_of_kind(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    source: StableId,
    field_path: String,
    relation: RebuiltV3MediaRelation,
    requirement: RebuiltV3MediaRequirement,
    resource_type: &str,
    resource_id: i32,
    expected_asset_kind: &str,
) {
    push_resource_with_kind(
        references,
        snapshot,
        source,
        field_path,
        relation,
        requirement,
        resource_type,
        resource_id,
        Some(expected_asset_kind),
    );
}

#[allow(clippy::too_many_arguments)]
fn push_resource_with_kind(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    source: StableId,
    field_path: String,
    relation: RebuiltV3MediaRelation,
    requirement: RebuiltV3MediaRequirement,
    resource_type: &str,
    resource_id: i32,
    expected_asset_kind: Option<&str>,
) {
    let classic_resource = ClassicResourceKey {
        resource_type: resource_type.into(),
        resource_id,
    };
    let matches = snapshot
        .assets
        .iter()
        .filter(|asset| {
            asset.classic_resource.as_ref() == Some(&classic_resource)
                && expected_asset_kind.is_none_or(|kind| asset.kind == kind)
        })
        .collect::<Vec<_>>();
    let (resolution, resolved_asset_id, resolved_owner) = match matches.as_slice() {
        [asset] if relation != RebuiltV3MediaRelation::BattleAtlas || is_battle_atlas(asset) => (
            ResolutionState::Resolved,
            Some(asset.identity.clone()),
            Some(RebuiltV3MediaOwner::ScenarioPackage),
        ),
        [_] => (ResolutionState::Missing, None, None),
        [] if requirement == RebuiltV3MediaRequirement::StockFallbackAllowed => {
            (ResolutionState::StockFallback, None, None)
        }
        [] => (ResolutionState::Missing, None, None),
        _ => (ResolutionState::Ambiguous, None, None),
    };
    references.push(RebuiltV3RuntimeMediaReference {
        source,
        field_path,
        relation,
        requirement,
        asset_id: None,
        classic_resource: Some(classic_resource),
        expected_asset_kind: expected_asset_kind.map(str::to_owned),
        resolution,
        resolved_asset_id,
        resolved_owner,
    });
}

pub(super) fn is_battle_atlas(asset: &AssetDescriptor) -> bool {
    asset.kind == "tileset"
        && asset.mime_type.as_deref() == Some("image/png")
        && asset.width == Some(640)
        && asset.height == Some(640)
        && asset.tile_width == Some(32)
        && asset.tile_height == Some(32)
        && asset.columns == Some(20)
        && asset.rows == Some(20)
}

#[allow(clippy::too_many_arguments)]
pub(super) fn push_asset(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    source: StableId,
    field_path: String,
    relation: RebuiltV3MediaRelation,
    requirement: RebuiltV3MediaRequirement,
    asset_id: StableId,
) {
    push_asset_with_kind(
        references,
        snapshot,
        source,
        field_path,
        relation,
        requirement,
        asset_id,
        None,
    );
}

#[allow(clippy::too_many_arguments)]
pub(super) fn push_asset_of_kind(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    source: StableId,
    field_path: String,
    relation: RebuiltV3MediaRelation,
    requirement: RebuiltV3MediaRequirement,
    asset_id: StableId,
    expected_asset_kind: &str,
) {
    push_asset_with_kind(
        references,
        snapshot,
        source,
        field_path,
        relation,
        requirement,
        asset_id,
        Some(expected_asset_kind),
    );
}

#[allow(clippy::too_many_arguments)]
fn push_asset_with_kind(
    references: &mut Vec<RebuiltV3RuntimeMediaReference>,
    snapshot: &ProjectSnapshot,
    source: StableId,
    field_path: String,
    relation: RebuiltV3MediaRelation,
    requirement: RebuiltV3MediaRequirement,
    asset_id: StableId,
    expected_asset_kind: Option<&str>,
) {
    let matches = snapshot
        .assets
        .iter()
        .filter(|asset| {
            asset.identity == asset_id && expected_asset_kind.is_none_or(|kind| asset.kind == kind)
        })
        .collect::<Vec<_>>();
    let (resolution, resolved_asset_id, resolved_owner) = match matches.as_slice() {
        [asset] => (
            ResolutionState::Resolved,
            Some(asset.identity.clone()),
            Some(RebuiltV3MediaOwner::ScenarioPackage),
        ),
        [] if requirement == RebuiltV3MediaRequirement::StockFallbackAllowed => {
            (ResolutionState::StockFallback, None, None)
        }
        [] => (ResolutionState::Missing, None, None),
        _ => (ResolutionState::Ambiguous, None, None),
    };
    references.push(RebuiltV3RuntimeMediaReference {
        source,
        field_path,
        relation,
        requirement,
        asset_id: Some(asset_id),
        classic_resource: None,
        expected_asset_kind: expected_asset_kind.map(str::to_owned),
        resolution,
        resolved_asset_id,
        resolved_owner,
    });
}
