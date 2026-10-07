use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::{
    model::{AssetDescriptor, ClassicResourceKey, ProjectSnapshot},
    rebuilt::{ApplicationMediaCatalog, ApplicationMediaResolution},
};

pub const MONSTER_ICON_PAIR_OFFSET: i32 = 308;

/// Gold, Gems, Jewelry in the donor reward-row order; these are not actor pairs.
pub fn resolve_monster_reward_icons(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
) -> [MonsterAppearanceResource; 3] {
    [2002, 2014, 2012].map(|id| resolve_resource(snapshot, application, id))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MonsterAppearancePairState {
    Complete,
    Incomplete,
    NoIcon,
    InvalidIcon,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MonsterAppearanceResolution {
    Resolved,
    Missing,
    Ambiguous,
    UnsupportedPreview,
    WrongKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MonsterAppearanceSourceRole {
    Scenario,
    ClassicApplication,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterAppearanceResource {
    pub resource_id: i32,
    pub resolution: MonsterAppearanceResolution,
    pub source_role: Option<MonsterAppearanceSourceRole>,
    pub asset: Option<AssetDescriptor>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonsterAppearancePair {
    pub icon_id: i16,
    pub pair_offset: i32,
    pub state: MonsterAppearancePairState,
    pub base: Option<MonsterAppearanceResource>,
    pub facing: Option<MonsterAppearanceResource>,
}

impl MonsterAppearancePair {
    pub fn complete(&self) -> bool {
        self.state == MonsterAppearancePairState::Complete
    }
}

pub fn resolve_monster_appearance(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    icon_id: i16,
) -> MonsterAppearancePair {
    if icon_id == 0 {
        return MonsterAppearancePair {
            icon_id,
            pair_offset: MONSTER_ICON_PAIR_OFFSET,
            state: MonsterAppearancePairState::NoIcon,
            base: None,
            facing: None,
        };
    }
    let base_id = i32::from(icon_id);
    let Some(facing_id) = base_id.checked_add(MONSTER_ICON_PAIR_OFFSET) else {
        return invalid_pair(icon_id);
    };
    if base_id <= 0 || facing_id > i32::from(i16::MAX) {
        return invalid_pair(icon_id);
    }
    let base = resolve_resource(snapshot, application, base_id);
    let facing = resolve_resource(snapshot, application, facing_id);
    let state = if base.resolution == MonsterAppearanceResolution::Resolved
        && facing.resolution == MonsterAppearanceResolution::Resolved
    {
        MonsterAppearancePairState::Complete
    } else {
        MonsterAppearancePairState::Incomplete
    };
    MonsterAppearancePair {
        icon_id,
        pair_offset: MONSTER_ICON_PAIR_OFFSET,
        state,
        base: Some(base),
        facing: Some(facing),
    }
}

pub fn monster_appearance_candidate_ids(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
) -> Vec<i32> {
    let mut candidates = snapshot
        .monster_sets
        .iter()
        .flat_map(|set| set.monsters.iter())
        .filter_map(|monster| valid_base_id(monster.icon_id))
        .collect::<BTreeSet<_>>();

    let scenario_ids = snapshot
        .assets
        .iter()
        .filter_map(cicn_resource_id)
        .filter(|id| *id > 0)
        .collect::<BTreeSet<_>>();
    add_complete_pair_bases(&mut candidates, &scenario_ids, false);

    if let Some(application) = application {
        let application_ids = application
            .assets
            .iter()
            .filter_map(|asset| cicn_resource_id(&asset.descriptor))
            .filter(|id| is_classic_actor_or_creature_icon_id(*id))
            .collect::<BTreeSet<_>>();
        add_complete_pair_bases(&mut candidates, &application_ids, true);
    }
    candidates.into_iter().collect()
}

pub fn is_classic_actor_or_creature_icon_id(resource_id: i32) -> bool {
    matches!(
        resource_id,
        379..=461 | 464..=496 | 500..=590 | 600..=619 | 692..=824
    )
}

fn invalid_pair(icon_id: i16) -> MonsterAppearancePair {
    MonsterAppearancePair {
        icon_id,
        pair_offset: MONSTER_ICON_PAIR_OFFSET,
        state: MonsterAppearancePairState::InvalidIcon,
        base: None,
        facing: None,
    }
}

fn valid_base_id(icon_id: i16) -> Option<i32> {
    let base = i32::from(icon_id);
    (base > 0 && base + MONSTER_ICON_PAIR_OFFSET <= i32::from(i16::MAX)).then_some(base)
}

fn add_complete_pair_bases(candidates: &mut BTreeSet<i32>, ids: &BTreeSet<i32>, actor_only: bool) {
    for base in ids {
        if actor_only && !is_classic_actor_or_creature_icon_id(*base) {
            continue;
        }
        if *base <= 0
            || *base + MONSTER_ICON_PAIR_OFFSET > i32::from(i16::MAX)
            || !ids.contains(&(*base + MONSTER_ICON_PAIR_OFFSET))
            || ids.contains(&(*base - MONSTER_ICON_PAIR_OFFSET))
        {
            continue;
        }
        candidates.insert(*base);
    }
}

fn cicn_resource_id(asset: &AssetDescriptor) -> Option<i32> {
    asset
        .classic_resource
        .as_ref()
        .filter(|resource| resource.resource_type == "cicn")
        .map(|resource| resource.resource_id)
}

fn resolve_resource(
    snapshot: &ProjectSnapshot,
    application: Option<&ApplicationMediaCatalog>,
    resource_id: i32,
) -> MonsterAppearanceResource {
    let key = ClassicResourceKey {
        resource_type: "cicn".into(),
        resource_id,
    };
    let scenario = snapshot
        .assets
        .iter()
        .filter(|asset| asset.classic_resource.as_ref() == Some(&key))
        .collect::<Vec<_>>();
    match scenario.as_slice() {
        [asset] => {
            return resolved_or_unsupported(
                resource_id,
                MonsterAppearanceSourceRole::Scenario,
                (*asset).clone(),
            );
        }
        [] => {}
        _ => {
            return MonsterAppearanceResource {
                resource_id,
                resolution: MonsterAppearanceResolution::Ambiguous,
                source_role: Some(MonsterAppearanceSourceRole::Scenario),
                asset: None,
            };
        }
    }

    let Some(application) = application else {
        return missing_resource(resource_id);
    };
    match application.resolve_resource(&key, None) {
        ApplicationMediaResolution::Resolved(asset) => resolved_or_unsupported(
            resource_id,
            MonsterAppearanceSourceRole::ClassicApplication,
            asset.descriptor.clone(),
        ),
        ApplicationMediaResolution::Ambiguous => MonsterAppearanceResource {
            resource_id,
            resolution: MonsterAppearanceResolution::Ambiguous,
            source_role: Some(MonsterAppearanceSourceRole::ClassicApplication),
            asset: None,
        },
        ApplicationMediaResolution::WrongKind => MonsterAppearanceResource {
            resource_id,
            resolution: MonsterAppearanceResolution::WrongKind,
            source_role: Some(MonsterAppearanceSourceRole::ClassicApplication),
            asset: None,
        },
        ApplicationMediaResolution::Missing => missing_resource(resource_id),
    }
}

fn resolved_or_unsupported(
    resource_id: i32,
    source_role: MonsterAppearanceSourceRole,
    asset: AssetDescriptor,
) -> MonsterAppearanceResource {
    let resolution = if asset
        .mime_type
        .as_deref()
        .is_some_and(|mime| mime.starts_with("image/"))
    {
        MonsterAppearanceResolution::Resolved
    } else {
        MonsterAppearanceResolution::UnsupportedPreview
    };
    MonsterAppearanceResource {
        resource_id,
        resolution,
        source_role: Some(source_role),
        asset: Some(asset),
    }
}

fn missing_resource(resource_id: i32) -> MonsterAppearanceResource {
    MonsterAppearanceResource {
        resource_id,
        resolution: MonsterAppearanceResolution::Missing,
        source_role: None,
        asset: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        model::{BlobId, StableId},
        rebuilt::{ApplicationMediaAsset, ApplicationMediaSource},
    };

    fn asset(id: i32, identity: &str, source: &str) -> AssetDescriptor {
        AssetDescriptor {
            identity: StableId(identity.into()),
            label: format!("cicn {id}"),
            kind: "icon".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id: id,
            }),
            scenario_music_slot: None,
            blob: BlobId(format!("sha256:{}", "a".repeat(64))),
            byte_length: 4,
            classic_payload_blob: Some(BlobId(format!("sha256:{}", "b".repeat(64)))),
            classic_payload_byte_length: Some(4),
            extension: Some("png".into()),
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
            source: source.into(),
        }
    }

    fn application(ids: &[i32]) -> ApplicationMediaCatalog {
        let source = ApplicationMediaSource {
            identity: StableId("application:family-jewels".into()),
            native_name: "The Family Jewels.rsrc".into(),
            priority: 0,
            blob: BlobId(format!("sha256:{}", "c".repeat(64))),
            byte_length: 8,
        };
        ApplicationMediaCatalog {
            format_version: crate::rebuilt::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
            library_id: StableId("application:test".into()),
            sources: vec![source.clone()],
            assets: ids
                .iter()
                .map(|id| ApplicationMediaAsset {
                    source: source.identity.clone(),
                    source_priority: 0,
                    descriptor: asset(*id, &format!("application:cicn:{id}"), "application"),
                })
                .collect(),
            ambiguous_resources: Vec::new(),
            failures: Vec::new(),
        }
    }

    #[test]
    fn application_pair_resolves_exact_classic_facing_offset() {
        let snapshot = ProjectSnapshot::new_authored(StableId("appearance".into()));
        let application = application(&[392, 700]);
        let pair = resolve_monster_appearance(&snapshot, Some(&application), 392);
        assert!(pair.complete());
        assert_eq!(pair.base.unwrap().resource_id, 392);
        assert_eq!(pair.facing.unwrap().resource_id, 700);
    }

    #[test]
    fn reward_icons_are_independent_exact_keys_with_existing_shadow_policy() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("rewards".into()));
        let application = application(&[2002, 2014, 2012]);
        let rewards = resolve_monster_reward_icons(&snapshot, Some(&application));
        assert_eq!(
            rewards.each_ref().map(|row| row.resource_id),
            [2002, 2014, 2012]
        );
        assert!(
            rewards
                .iter()
                .all(|row| row.resolution == MonsterAppearanceResolution::Resolved)
        );
        snapshot
            .assets
            .push(asset(2014, "scenario:gems", "scenario"));
        let rewards = resolve_monster_reward_icons(&snapshot, Some(&application));
        assert_eq!(
            rewards[1].source_role,
            Some(MonsterAppearanceSourceRole::Scenario)
        );
        assert_eq!(
            rewards[0].source_role,
            Some(MonsterAppearanceSourceRole::ClassicApplication)
        );
        snapshot
            .assets
            .push(asset(2014, "scenario:duplicate-gems", "scenario"));
        assert_eq!(
            resolve_monster_reward_icons(&snapshot, Some(&application))[1].resolution,
            MonsterAppearanceResolution::Ambiguous
        );
    }

    #[test]
    fn each_scenario_resource_shadows_only_its_exact_application_key() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("shadow".into()));
        snapshot
            .assets
            .push(asset(392, "scenario:cicn:392", "scenario"));
        let application = application(&[392, 700]);
        let pair = resolve_monster_appearance(&snapshot, Some(&application), 392);
        assert!(pair.complete());
        assert_eq!(
            pair.base.unwrap().source_role,
            Some(MonsterAppearanceSourceRole::Scenario)
        );
        assert_eq!(
            pair.facing.unwrap().source_role,
            Some(MonsterAppearanceSourceRole::ClassicApplication)
        );
    }

    #[test]
    fn ambiguous_scenario_key_blocks_application_fallback() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("ambiguous".into()));
        snapshot.assets.push(asset(392, "scenario:one", "scenario"));
        snapshot.assets.push(asset(392, "scenario:two", "scenario"));
        let application = application(&[392, 700]);
        let pair = resolve_monster_appearance(&snapshot, Some(&application), 392);
        assert_eq!(pair.state, MonsterAppearancePairState::Incomplete);
        assert_eq!(
            pair.base.unwrap().resolution,
            MonsterAppearanceResolution::Ambiguous
        );
    }

    #[test]
    fn candidate_list_includes_referenced_missing_and_complete_default_pairs() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("candidates".into()));
        let mut set = crate::codecs::decode_monster_set(
            &[0; crate::codecs::MONSTER_RECORD_BYTES],
            "Data MD",
            0,
        );
        set.monsters[0].icon_id = 600;
        snapshot.monster_sets.push(set);
        let application = application(&[392, 700]);
        assert_eq!(
            monster_appearance_candidate_ids(&snapshot, Some(&application)),
            vec![392, 600]
        );
    }

    #[test]
    fn nonpositive_and_overflowing_ids_are_not_previewed_as_runtime_pairs() {
        let snapshot = ProjectSnapshot::new_authored(StableId("invalid".into()));
        assert_eq!(
            resolve_monster_appearance(&snapshot, None, 0).state,
            MonsterAppearancePairState::NoIcon
        );
        assert_eq!(
            resolve_monster_appearance(&snapshot, None, -1).state,
            MonsterAppearancePairState::InvalidIcon
        );
        assert_eq!(
            resolve_monster_appearance(&snapshot, None, i16::MAX).state,
            MonsterAppearancePairState::InvalidIcon
        );
    }
}
