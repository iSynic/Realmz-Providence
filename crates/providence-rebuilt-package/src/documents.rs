use crate::{
    RebuiltScenarioArchiveDocument, RebuiltV3ArchiveError, integrity::parse_canonical_json,
};
use providence_core::rebuilt::{
    RebuiltV3AssetIndex, RebuiltV3ContentDocument, RebuiltV3Manifest, RebuiltV3WorldDocument,
    rebuilt_v3_media_digest,
};
use std::collections::{BTreeMap, BTreeSet};

pub(crate) struct Documents {
    pub content: RebuiltV3ContentDocument,
    pub world: RebuiltV3WorldDocument,
    pub scenario: RebuiltScenarioArchiveDocument,
    pub assets: RebuiltV3AssetIndex,
}

impl Documents {
    pub fn parse(bytes: &BTreeMap<String, Vec<u8>>) -> Result<Self, RebuiltV3ArchiveError> {
        let (_, content) = parse_canonical_json("content.json", &bytes["content.json"])?;
        let (_, world) = parse_canonical_json("world.json", &bytes["world.json"])?;
        let (_, scenario) = parse_canonical_json("scenario.json", &bytes["scenario.json"])?;
        let (_, assets) = parse_canonical_json("assets/index.json", &bytes["assets/index.json"])?;
        Ok(Self {
            content,
            world,
            scenario,
            assets,
        })
    }

    pub fn validate(&self, manifest: &RebuiltV3Manifest) -> Result<(), RebuiltV3ArchiveError> {
        validate_headers(
            manifest,
            &self.content,
            &self.world,
            &self.scenario,
            &self.assets,
        )?;
        validate_content(manifest, &self.content)?;
        validate_start(manifest, &self.world)?;
        validate_hooks(&self.scenario)?;
        validate_assets(manifest, &self.assets)
    }
}

fn validate_headers(
    manifest: &RebuiltV3Manifest,
    content: &RebuiltV3ContentDocument,
    world: &RebuiltV3WorldDocument,
    scenario: &RebuiltScenarioArchiveDocument,
    asset_index: &RebuiltV3AssetIndex,
) -> Result<(), RebuiltV3ArchiveError> {
    for (path, kind, version) in [
        (
            "content.json",
            content.kind.as_str(),
            content.schema_version,
        ),
        ("world.json", world.kind.as_str(), world.schema_version),
        (
            "scenario.json",
            scenario.kind.as_str(),
            scenario.schema_version,
        ),
        (
            "assets/index.json",
            asset_index.kind.as_str(),
            asset_index.schema_version,
        ),
    ] {
        let expected_kind = match path {
            "content.json" => "realmz2.content",
            "world.json" => "realmz2.world",
            "scenario.json" => "realmz2.scenario",
            _ => "realmz2.assets",
        };
        if kind != expected_kind || version != manifest.schema_version {
            return Err(RebuiltV3ArchiveError::InvalidDocument {
                path: path.into(),
                reason: format!(
                    "kind or schemaVersion does not match schema v{}",
                    manifest.schema_version
                ),
            });
        }
    }
    Ok(())
}

fn validate_content(
    manifest: &RebuiltV3Manifest,
    content: &RebuiltV3ContentDocument,
) -> Result<(), RebuiltV3ArchiveError> {
    validate_monster_schema_ranges(manifest.schema_version, content)?;
    if content.campaign.id != manifest.campaign_id {
        return Err(RebuiltV3ArchiveError::InvalidDocument {
            path: "content.json".into(),
            reason: "campaign identity differs from manifest.json".into(),
        });
    }
    Ok(())
}

fn validate_start(
    manifest: &RebuiltV3Manifest,
    world: &RebuiltV3WorldDocument,
) -> Result<(), RebuiltV3ArchiveError> {
    let start_map = world
        .maps
        .iter()
        .find(|map| map.id == manifest.start.map_id)
        .ok_or_else(|| RebuiltV3ArchiveError::InvalidDocument {
            path: "world.json".into(),
            reason: "manifest start map is absent".into(),
        })?;
    if u16::from(manifest.start.x) >= start_map.width
        || u16::from(manifest.start.y) >= start_map.height
    {
        return Err(RebuiltV3ArchiveError::InvalidDocument {
            path: "world.json".into(),
            reason: "manifest start coordinate is outside its map".into(),
        });
    }
    Ok(())
}

fn validate_hooks(scenario: &RebuiltScenarioArchiveDocument) -> Result<(), RebuiltV3ArchiveError> {
    let program_ids = scenario
        .programs
        .iter()
        .map(|program| &program.id)
        .collect::<BTreeSet<_>>();
    for hook in [
        &scenario.application_hooks.start_game,
        &scenario.application_hooks.party_death,
        &scenario.application_hooks.end_adventure,
        &scenario.application_hooks.shop,
        &scenario.application_hooks.temple,
    ]
    .into_iter()
    .flatten()
    {
        if !program_ids.contains(hook) {
            return Err(RebuiltV3ArchiveError::InvalidDocument {
                path: "scenario.json".into(),
                reason: format!("application hook '{}' has no program", hook.0),
            });
        }
    }
    Ok(())
}

fn validate_assets(
    manifest: &RebuiltV3Manifest,
    asset_index: &RebuiltV3AssetIndex,
) -> Result<(), RebuiltV3ArchiveError> {
    let declared_media = manifest
        .files
        .keys()
        .filter(|path| rebuilt_v3_media_digest(path).is_some())
        .collect::<BTreeSet<_>>();
    let indexed_media = asset_index
        .assets
        .iter()
        .map(|asset| &asset.path)
        .collect::<BTreeSet<_>>();
    if indexed_media != declared_media {
        return Err(RebuiltV3ArchiveError::InvalidDocument {
            path: "assets/index.json".into(),
            reason: "media path set differs from manifest.json".into(),
        });
    }
    for asset in &asset_index.assets {
        let integrity = &manifest.files[&asset.path];
        if asset.bytes != integrity.bytes || asset.sha256 != integrity.sha256 {
            return Err(RebuiltV3ArchiveError::InvalidDocument {
                path: "assets/index.json".into(),
                reason: format!(
                    "asset '{}' integrity differs from manifest.json",
                    asset.id.0
                ),
            });
        }
    }
    Ok(())
}

fn validate_monster_schema_ranges(
    schema_version: u8,
    content: &RebuiltV3ContentDocument,
) -> Result<(), RebuiltV3ArchiveError> {
    let monsters = content.monsters.iter().chain(
        content
            .monster_sets
            .iter()
            .flat_map(|set| set.monsters.iter()),
    );
    for monster in monsters {
        let invalid = match schema_version {
            3 => monster.magic_to_hit < 0 || monster.random_weapon_table > 10,
            4 | 5 => monster.random_weapon_table > 32_768,
            _ => true,
        };
        if invalid {
            return Err(RebuiltV3ArchiveError::InvalidDocument {
                path: "content.json".into(),
                reason: format!(
                    "monster '{}' contains a numeric value outside schema v{schema_version}",
                    monster.id.0
                ),
            });
        }
    }
    Ok(())
}
