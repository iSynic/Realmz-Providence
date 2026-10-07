use super::{ActionTarget, ActionTargetStatus};
use crate::{
    model::{ProjectSnapshot, StableId},
    monster_appearance::{
        MonsterAppearanceSourceRole, monster_appearance_candidate_ids, resolve_monster_appearance,
    },
    rebuilt::ApplicationMediaCatalog,
};

pub(super) fn targets(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
) -> Vec<ActionTarget> {
    monster_appearance_candidate_ids(snapshot, application)
        .into_iter()
        .filter_map(|value| target(snapshot, application, value))
        .collect()
}

fn target(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    value: i32,
) -> Option<ActionTarget> {
    let pair = resolve_monster_appearance(snapshot, application, i16::try_from(value).ok()?);
    let base = pair.base.as_ref()?;
    let facing = pair.facing.as_ref()?;
    let identity = base
        .asset
        .as_ref()
        .map(|asset| asset.identity.clone())
        .unwrap_or_else(|| StableId(format!("monster-appearance:{value}")));
    let label = base
        .asset
        .as_ref()
        .map(|asset| asset.label.trim())
        .filter(|label| !label.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("Monster Appearance {value}"));
    Some(ActionTarget {
        identity,
        value,
        label,
        detail: format!(
            "{} · cicn {value} and {}",
            pair_source(base.source_role, facing.source_role),
            value + pair.pair_offset
        ),
        status: target_status(base.source_role),
        preview: Some(format!("Facing cicn {}", value + pair.pair_offset)),
    })
}

fn pair_source(
    base: Option<MonsterAppearanceSourceRole>,
    facing: Option<MonsterAppearanceSourceRole>,
) -> &'static str {
    match (base, facing) {
        (
            Some(MonsterAppearanceSourceRole::Scenario),
            Some(MonsterAppearanceSourceRole::Scenario),
        ) => "scenario pair",
        (
            Some(MonsterAppearanceSourceRole::ClassicApplication),
            Some(MonsterAppearanceSourceRole::ClassicApplication),
        ) => "stock pair",
        _ => "scenario and stock pair",
    }
}

fn target_status(source: Option<MonsterAppearanceSourceRole>) -> ActionTargetStatus {
    match source {
        Some(MonsterAppearanceSourceRole::ClassicApplication) => {
            ActionTargetStatus::ApplicationResource
        }
        Some(MonsterAppearanceSourceRole::Scenario) => ActionTargetStatus::CompatibilityResource,
        None => ActionTargetStatus::Resolved,
    }
}
