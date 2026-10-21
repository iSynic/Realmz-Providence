use providence_core::rebuilt::{RebuiltV3AssetIndex, RebuiltV3Manifest};
use std::collections::{BTreeMap, BTreeSet};

pub(crate) fn classic_source_only_paths(
    asset_index: &RebuiltV3AssetIndex,
    manifest: &RebuiltV3Manifest,
) -> BTreeSet<String> {
    let mut descriptors_by_path = BTreeMap::<&str, Vec<_>>::new();
    for asset in &asset_index.assets {
        descriptors_by_path
            .entry(asset.path.as_str())
            .or_default()
            .push(asset);
    }
    descriptors_by_path
        .into_iter()
        .filter_map(|(path, descriptors)| {
            let integrity = manifest.files.get(path)?;
            let source_only = descriptors.iter().all(|asset| {
                asset.kind == "classic-source"
                    && asset.id.0 == format!("classic-source-{}", asset.sha256)
                    && asset.mime_type.as_deref() == Some("application/octet-stream")
                    && asset.resource_type.is_none()
                    && asset.resource_id.is_none()
                    && asset.path == format!("assets/media/{}.bin", asset.sha256)
                    && asset.bytes == integrity.bytes
                    && asset.sha256 == integrity.sha256
            });
            source_only.then(|| path.to_owned())
        })
        .collect()
}
