use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::model::{AssetDescriptor, ClassicResourceKey, ProjectSnapshot, StableId};

use super::{
    ApplicationMediaCatalog, ApplicationMediaResolution, rebuilt_application_special_land_identity,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3AssetRecord {
    pub id: StableId,
    pub label: String,
    pub kind: String,
    pub mime_type: Option<String>,
    pub resource_type: Option<String>,
    pub resource_id: Option<i32>,
    pub scenario_music_slot: Option<u8>,
    pub bytes: u64,
    pub sha256: String,
    pub path: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration_ms: Option<u32>,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
    pub tile_width: Option<u32>,
    pub tile_height: Option<u32>,
    pub columns: Option<u32>,
    pub rows: Option<u32>,
    pub landlook: Option<i8>,
    pub base_tile: Option<i16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV3AssetIndex {
    pub kind: String,
    pub schema_version: u8,
    pub assets: Vec<RebuiltV3AssetRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RebuiltV3AssetError {
    InvalidBlobId(StableId),
    InvalidExtension(StableId),
    DuplicateAssetId(StableId),
    MissingAssetId(StableId),
    AmbiguousAssetId(StableId),
    MissingClassicResource(ClassicResourceKey),
    AmbiguousClassicResource(ClassicResourceKey),
}

impl std::fmt::Display for RebuiltV3AssetError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidBlobId(id) => {
                write!(
                    formatter,
                    "asset '{}' has an invalid SHA-256 blob identity",
                    id.0
                )
            }
            Self::InvalidExtension(id) => write!(
                formatter,
                "asset '{}' has a non-portable media extension",
                id.0
            ),
            Self::DuplicateAssetId(id) => {
                write!(
                    formatter,
                    "selected asset identity '{}' is duplicated",
                    id.0
                )
            }
            Self::MissingAssetId(id) => {
                write!(formatter, "required asset '{}' is unavailable", id.0)
            }
            Self::AmbiguousAssetId(id) => {
                write!(formatter, "asset identity '{}' is ambiguous", id.0)
            }
            Self::MissingClassicResource(resource) => write!(
                formatter,
                "required Classic {} resource {} is unavailable",
                resource.resource_type, resource.resource_id
            ),
            Self::AmbiguousClassicResource(resource) => write!(
                formatter,
                "Classic {} resource {} is ambiguous",
                resource.resource_type, resource.resource_id
            ),
        }
    }
}

pub fn project_rebuilt_v3_selected_assets(
    snapshot: &ProjectSnapshot,
    selected_ids: &BTreeSet<StableId>,
) -> Result<RebuiltV3AssetIndex, RebuiltV3AssetError> {
    let mut selected = Vec::with_capacity(selected_ids.len());
    for id in selected_ids {
        let matches = snapshot
            .assets
            .iter()
            .filter(|asset| asset.identity == *id)
            .collect::<Vec<_>>();
        match matches.as_slice() {
            [] => return Err(RebuiltV3AssetError::MissingAssetId(id.clone())),
            [asset] => selected.push(*asset),
            _ => return Err(RebuiltV3AssetError::AmbiguousAssetId(id.clone())),
        }
    }
    let assets = selected
        .into_iter()
        .map(asset_projection)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(RebuiltV3AssetIndex {
        kind: "realmz2.assets".into(),
        schema_version: 3,
        assets,
    })
}

pub fn project_rebuilt_v3_selected_classic_resources(
    snapshot: &ProjectSnapshot,
    required: &BTreeSet<ClassicResourceKey>,
    optional: &BTreeSet<ClassicResourceKey>,
) -> Result<RebuiltV3AssetIndex, RebuiltV3AssetError> {
    let mut selected = Vec::new();
    for key in required.iter().chain(optional) {
        let matches = snapshot
            .assets
            .iter()
            .filter(|asset| asset.classic_resource.as_ref() == Some(key))
            .collect::<Vec<_>>();
        match matches.as_slice() {
            [] if required.contains(key) => {
                return Err(RebuiltV3AssetError::MissingClassicResource(key.clone()));
            }
            [] => {}
            [asset] => selected.push(*asset),
            _ => return Err(RebuiltV3AssetError::AmbiguousClassicResource(key.clone())),
        }
    }
    selected.sort_by_key(|asset| asset.identity.clone());
    if let Some(pair) = selected
        .windows(2)
        .find(|pair| pair[0].identity == pair[1].identity)
    {
        return Err(RebuiltV3AssetError::DuplicateAssetId(
            pair[0].identity.clone(),
        ));
    }
    let assets = selected
        .into_iter()
        .map(asset_projection)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(RebuiltV3AssetIndex {
        kind: "realmz2.assets".into(),
        schema_version: 3,
        assets,
    })
}

impl std::error::Error for RebuiltV3AssetError {}

pub fn project_rebuilt_v3_asset_index(
    snapshot: &ProjectSnapshot,
) -> Result<RebuiltV3AssetIndex, RebuiltV3AssetError> {
    let mut assets = snapshot.assets.iter().collect::<Vec<_>>();
    assets.sort_by_key(|asset| asset.identity.clone());
    let assets = assets
        .into_iter()
        .map(asset_projection)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(RebuiltV3AssetIndex {
        kind: "realmz2.assets".into(),
        schema_version: 3,
        assets,
    })
}

pub fn special_land_asset_lookup(snapshot: &ProjectSnapshot) -> BTreeMap<i16, StableId> {
    let mut lookup = BTreeMap::new();
    let mut ambiguous = BTreeSet::new();
    for asset in &snapshot.assets {
        let Some(resource) = &asset.classic_resource else {
            continue;
        };
        let Ok(resource_id) = i16::try_from(resource.resource_id) else {
            continue;
        };
        if resource.resource_type != "cicn"
            || !asset
                .mime_type
                .as_deref()
                .is_some_and(|mime| mime.starts_with("image/"))
            || asset.width.unwrap_or(0) == 0
            || asset.height.unwrap_or(0) == 0
        {
            continue;
        }
        if lookup.insert(resource_id, asset.identity.clone()).is_some() {
            ambiguous.insert(resource_id);
        }
    }
    for resource_id in ambiguous {
        lookup.remove(&resource_id);
    }
    lookup
}

/// Layers exact application-owned Special Land resources behind scenario assets.
/// The returned runtime identities may be referenced by `world.json`, but the
/// application descriptors and payloads never enter project truth or the package
/// asset index.
pub fn special_land_asset_lookup_with_application(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
) -> BTreeMap<i16, StableId> {
    let mut lookup = special_land_asset_lookup(snapshot);
    let candidates = application_media
        .assets
        .iter()
        .filter_map(|asset| asset.descriptor.classic_resource.as_ref())
        .filter(|resource| resource.resource_type == "cicn" && resource.resource_id < 0)
        .cloned()
        .collect::<BTreeSet<_>>();
    for resource in candidates {
        let Ok(resource_id) = i16::try_from(resource.resource_id) else {
            continue;
        };
        if lookup.contains_key(&resource_id) {
            continue;
        }
        let ApplicationMediaResolution::Resolved(asset) =
            application_media.resolve_resource(&resource, Some("special-land-tile"))
        else {
            continue;
        };
        let descriptor = &asset.descriptor;
        if descriptor.mime_type.as_deref() == Some("image/png")
            && descriptor.width == Some(32)
            && descriptor.height == Some(32)
        {
            let Some(runtime_identity) = rebuilt_application_special_land_identity(resource_id)
            else {
                continue;
            };
            lookup.insert(resource_id, runtime_identity);
        }
    }
    lookup
}

fn asset_projection(asset: &AssetDescriptor) -> Result<RebuiltV3AssetRecord, RebuiltV3AssetError> {
    let sha256 = asset
        .blob
        .0
        .strip_prefix("sha256:")
        .filter(|digest| digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .ok_or_else(|| RebuiltV3AssetError::InvalidBlobId(asset.identity.clone()))?
        .to_ascii_lowercase();
    let extension = asset.extension.as_deref().unwrap_or_default();
    if !extension
        .bytes()
        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
    {
        return Err(RebuiltV3AssetError::InvalidExtension(
            asset.identity.clone(),
        ));
    }
    let suffix = if extension.is_empty() {
        String::new()
    } else {
        format!(".{extension}")
    };
    Ok(RebuiltV3AssetRecord {
        id: asset.identity.clone(),
        label: asset.label.clone(),
        kind: asset.kind.clone(),
        mime_type: asset.mime_type.clone(),
        resource_type: asset
            .classic_resource
            .as_ref()
            .map(|resource| resource.resource_type.clone()),
        resource_id: asset
            .classic_resource
            .as_ref()
            .map(|resource| resource.resource_id),
        scenario_music_slot: asset.scenario_music_slot,
        bytes: asset.byte_length,
        sha256: sha256.clone(),
        path: format!("assets/media/{sha256}{suffix}"),
        width: asset.width,
        height: asset.height,
        duration_ms: asset.duration_ms,
        sample_rate: asset.sample_rate,
        channels: asset.channels,
        tile_width: asset.tile_width,
        tile_height: asset.tile_height,
        columns: asset.columns,
        rows: asset.rows,
        landlook: asset.landlook,
        base_tile: asset.base_tile,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{BlobId, ClassicResourceKey};

    fn asset(identity: &str, resource_id: i32) -> AssetDescriptor {
        AssetDescriptor {
            identity: StableId(identity.into()),
            label: "Moon Gate".into(),
            kind: "special-land-tile".into(),
            mime_type: Some("image/png".into()),
            classic_resource: Some(ClassicResourceKey {
                resource_type: "cicn".into(),
                resource_id,
            }),
            scenario_music_slot: None,
            blob: BlobId(
                "sha256:f16d05ec6b29248d2c61adb1e9263f78e4f7bace1b955014a2d17872cfe4064d".into(),
            ),
            byte_length: 7,
            classic_payload_blob: None,
            classic_payload_byte_length: None,
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
            source: "synthetic decoded CICN".into(),
        }
    }

    #[test]
    fn asset_index_projection_is_exact_deterministic_and_reimportable() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("assets".into()));
        snapshot.assets = vec![asset("special.second", -98), asset("special.first", -99)];

        let index = project_rebuilt_v3_asset_index(&snapshot).expect("asset index");
        let encoded = serde_json::to_string(&index).expect("serialize index");
        assert_eq!(index.kind, "realmz2.assets");
        assert_eq!(index.schema_version, 3);
        assert_eq!(index.assets[0].id.0, "special.first");
        assert_eq!(
            index.assets[0].path,
            "assets/media/f16d05ec6b29248d2c61adb1e9263f78e4f7bace1b955014a2d17872cfe4064d.png"
        );
        assert_eq!(index.assets[0].resource_type.as_deref(), Some("cicn"));
        assert_eq!(index.assets[0].resource_id, Some(-99));
        assert_eq!(
            encoded,
            serde_json::to_string(&project_rebuilt_v3_asset_index(&snapshot).unwrap()).unwrap()
        );
        let reopened: RebuiltV3AssetIndex = serde_json::from_str(&encoded).expect("reimport");
        assert_eq!(reopened, index);
        assert_eq!(
            special_land_asset_lookup(&snapshot).get(&-99),
            Some(&StableId("special.first".into()))
        );
    }

    #[test]
    fn ambiguous_classic_resource_keys_do_not_resolve_an_overlay() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("assets".into()));
        snapshot.assets = vec![asset("special.first", -99), asset("special.second", -99)];

        assert!(!special_land_asset_lookup(&snapshot).contains_key(&-99));
    }

    #[test]
    fn application_special_land_assets_fill_only_unowned_exact_keys() {
        let source = StableId("application:family-jewels".into());
        let application_asset = asset("application.special", -99);
        let application = ApplicationMediaCatalog {
            format_version: super::super::APPLICATION_MEDIA_CATALOG_FORMAT_VERSION,
            library_id: StableId("classic-application".into()),
            sources: vec![super::super::ApplicationMediaSource {
                identity: source.clone(),
                native_name: "The Family Jewels".into(),
                priority: 0,
                blob: BlobId(format!("sha256:{}", "a".repeat(64))),
                byte_length: 1,
            }],
            assets: vec![super::super::ApplicationMediaAsset {
                source,
                source_priority: 0,
                descriptor: application_asset,
            }],
            ambiguous_resources: Vec::new(),
            failures: Vec::new(),
        };
        let mut snapshot = ProjectSnapshot::new_authored(StableId("assets".into()));

        assert_eq!(
            special_land_asset_lookup_with_application(&snapshot, &application).get(&-99),
            Some(&StableId("realmz-special-land-neg-99".into()))
        );

        snapshot.assets.push(asset("scenario.special", -99));
        assert_eq!(
            special_land_asset_lookup_with_application(&snapshot, &application).get(&-99),
            Some(&StableId("scenario.special".into()))
        );
    }

    #[test]
    fn selected_classic_resources_require_exact_keys_and_admit_optional_companions() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("selected-assets".into()));
        let mut text = asset("text", -200);
        text.classic_resource.as_mut().unwrap().resource_type = "TEXT".into();
        text.kind = "text-resource".into();
        let mut style = asset("style", -200);
        style.classic_resource.as_mut().unwrap().resource_type = "styl".into();
        style.kind = "text-style-resource".into();
        snapshot.assets = vec![style, text];
        let required = BTreeSet::from([ClassicResourceKey {
            resource_type: "TEXT".into(),
            resource_id: -200,
        }]);
        let optional = BTreeSet::from([ClassicResourceKey {
            resource_type: "styl".into(),
            resource_id: -200,
        }]);

        let projected =
            project_rebuilt_v3_selected_classic_resources(&snapshot, &required, &optional)
                .expect("selected assets");
        assert_eq!(
            projected
                .assets
                .iter()
                .map(|asset| asset.id.0.as_str())
                .collect::<Vec<_>>(),
            ["style", "text"]
        );

        snapshot.assets.retain(|asset| asset.identity.0 != "text");
        assert_eq!(
            project_rebuilt_v3_selected_classic_resources(&snapshot, &required, &optional),
            Err(RebuiltV3AssetError::MissingClassicResource(
                required.iter().next().unwrap().clone()
            ))
        );
    }

    #[test]
    fn selected_classic_resources_refuse_ambiguous_required_or_optional_keys() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("ambiguous-assets".into()));
        snapshot.assets = vec![asset("first", -200), asset("second", -200)];
        for asset in &mut snapshot.assets {
            asset.classic_resource.as_mut().unwrap().resource_type = "TEXT".into();
            asset.kind = "text-resource".into();
        }
        let text = ClassicResourceKey {
            resource_type: "TEXT".into(),
            resource_id: -200,
        };
        assert_eq!(
            project_rebuilt_v3_selected_classic_resources(
                &snapshot,
                &BTreeSet::from([text.clone()]),
                &BTreeSet::new()
            ),
            Err(RebuiltV3AssetError::AmbiguousClassicResource(text))
        );

        let mut text = asset("text", -200);
        text.classic_resource.as_mut().unwrap().resource_type = "TEXT".into();
        let mut first_style = asset("first-style", -200);
        first_style.classic_resource.as_mut().unwrap().resource_type = "styl".into();
        let mut second_style = first_style.clone();
        second_style.identity = StableId("second-style".into());
        snapshot.assets = vec![text, first_style, second_style];
        let style = ClassicResourceKey {
            resource_type: "styl".into(),
            resource_id: -200,
        };
        assert_eq!(
            project_rebuilt_v3_selected_classic_resources(
                &snapshot,
                &BTreeSet::from([ClassicResourceKey {
                    resource_type: "TEXT".into(),
                    resource_id: -200,
                }]),
                &BTreeSet::from([style.clone()])
            ),
            Err(RebuiltV3AssetError::AmbiguousClassicResource(style))
        );
    }
}
