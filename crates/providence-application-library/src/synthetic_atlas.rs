use std::{collections::BTreeMap, io::Cursor};

use providence_core::{
    codecs::encode_runtime_rgba_png,
    rebuilt::{RebuiltV3AssetIndex, RebuiltV3AssetRecord},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Migration {
    dungeon_asset_id: String,
    dungeon_sha256: String,
    battle_asset_id: String,
    battle_sha256: String,
}

pub(crate) fn apply(
    assets: &mut RebuiltV3AssetIndex,
    files: &mut BTreeMap<String, Vec<u8>>,
    migration: &Migration,
) -> Result<String, String> {
    let mut sources = pinned_sources(assets, files, migration)?;
    let PinnedAtlasImage {
        asset: mut dungeon,
        pixels: crop,
    } = sources.remove(0);
    let PinnedAtlasImage {
        asset: battle,
        pixels: mut full,
    } = sources.remove(0);
    for y in 0..64 {
        for x in 0..64 {
            let pixel = &crop[(y * 64 + x) * 4..(y * 64 + x + 1) * 4];
            if (x < 48 || y < 48)
                && pixel[..3].iter().all(|channel| *channel > 245)
                && pixel[3] != 0
            {
                return Err(
                    "synthetic dungeon pixels would change under Classic white keying".into(),
                );
            }
        }
        let destination = ((320 + y) * 640 + 576) * 4;
        full[destination..destination + 64 * 4]
            .copy_from_slice(&crop[y * 64 * 4..(y + 1) * 64 * 4]);
    }
    let png = encode_runtime_rgba_png(&full, 640, 640).map_err(|error| error.to_string())?;
    let hash = sha256(&png);
    let old_paths = [dungeon.path.clone(), battle.path];
    dungeon.path = format!("assets/media/{hash}.png");
    dungeon.sha256 = hash.clone();
    dungeon.bytes = png.len() as u64;
    dungeon.label = "Synthetic shared map and battle atlas".into();
    dungeon.kind = "tileset".into();
    dungeon.width = Some(640);
    dungeon.height = Some(640);
    dungeon.tile_width = Some(32);
    dungeon.tile_height = Some(32);
    dungeon.columns = Some(20);
    dungeon.rows = Some(20);
    assets
        .assets
        .retain(|asset| asset.id.0 != migration.battle_asset_id);
    *assets
        .assets
        .iter_mut()
        .find(|asset| asset.id == dungeon.id)
        .unwrap() = dungeon.clone();
    files.insert(dungeon.path, png);
    for path in old_paths {
        if !assets.assets.iter().any(|asset| asset.path == path) {
            files.remove(&path);
        }
    }
    Ok(hash)
}

struct PinnedAtlasImage {
    asset: RebuiltV3AssetRecord,
    pixels: Vec<u8>,
}

fn pinned_sources(
    assets: &RebuiltV3AssetIndex,
    files: &BTreeMap<String, Vec<u8>>,
    migration: &Migration,
) -> Result<Vec<PinnedAtlasImage>, String> {
    if migration.dungeon_asset_id == migration.battle_asset_id {
        return Err("shared atlas migration requires two distinct source assets".into());
    }
    let mut sources = Vec::new();
    for (id, expected_hash, size) in [
        (&migration.dungeon_asset_id, &migration.dungeon_sha256, 64),
        (&migration.battle_asset_id, &migration.battle_sha256, 640),
    ] {
        let matches: Vec<_> = assets
            .assets
            .iter()
            .filter(|asset| &asset.id.0 == id)
            .collect();
        let [asset] = matches.as_slice() else {
            return Err(format!("shared atlas source {id} is missing or ambiguous"));
        };
        let payload = files
            .get(&asset.path)
            .ok_or_else(|| format!("missing {}", asset.path))?;
        if &asset.sha256 != expected_hash
            || sha256(payload) != *expected_hash
            || asset.bytes != payload.len() as u64
            || asset.mime_type.as_deref() != Some("image/png")
            || asset.width != Some(size)
            || asset.height != Some(size)
        {
            return Err(format!(
                "shared atlas source {id} does not match its pinned image"
            ));
        }
        sources.push(PinnedAtlasImage {
            asset: (*asset).clone(),
            pixels: decode_rgba(payload, size)?,
        });
    }
    Ok(sources)
}

fn decode_rgba(bytes: &[u8], size: u32) -> Result<Vec<u8>, String> {
    let decoder = png::Decoder::new_with_limits(
        Cursor::new(bytes),
        png::Limits {
            bytes: 8 * 1024 * 1024,
        },
    );
    let mut reader = decoder.read_info().map_err(|error| error.to_string())?;
    let info = reader.info();
    if info.width != size
        || info.height != size
        || info.color_type != png::ColorType::Rgba
        || info.bit_depth != png::BitDepth::Eight
        || info.animation_control.is_some()
    {
        return Err("shared atlas source must be the pinned static RGBA8 image".into());
    }
    let mut pixels = vec![0; (size * size * 4) as usize];
    reader
        .next_frame(&mut pixels)
        .map_err(|error| error.to_string())?;
    reader.finish().map_err(|error| error.to_string())?;
    Ok(pixels)
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn pinned_images(files: &mut BTreeMap<String, Vec<u8>>) -> RebuiltV3AssetIndex {
        let mut records = Vec::new();
        for (id, size, pixel) in [
            ("dungeon", 64, [20, 40, 60, 255]),
            ("battle", 640, [3, 5, 7, 255]),
        ] {
            let bytes =
                encode_runtime_rgba_png(&pixel.repeat(size * size), size as u32, size as u32)
                    .unwrap();
            let path = format!("assets/media/{id}.png");
            records.push(json!({"id":id,"label":id,"kind":"tileset","mimeType":"image/png","bytes":bytes.len(),"sha256":sha256(&bytes),"path":path,"width":size,"height":size}));
            files.insert(path, bytes);
        }
        serde_json::from_value(json!({"kind":"realmz2.assets","schemaVersion":3,"assets":records}))
            .unwrap()
    }

    #[test]
    fn shared_fixture_preserves_crop_and_every_other_pixel_with_pinned_inputs() {
        let mut files = BTreeMap::new();
        let assets = pinned_images(&mut files);
        let mut migration = Migration {
            dungeon_asset_id: "dungeon".into(),
            dungeon_sha256: assets.assets[0].sha256.clone(),
            battle_asset_id: "battle".into(),
            battle_sha256: assets.assets[1].sha256.clone(),
        };
        let mut output_assets = assets.clone();
        let mut output_files = files.clone();
        let hash = apply(&mut output_assets, &mut output_files, &migration).unwrap();
        assert_eq!(output_assets.assets.len(), 1);
        assert_eq!(output_files.len(), 1);
        let result = &output_assets.assets[0];
        assert_eq!(
            (
                result.id.0.as_str(),
                result.sha256.as_str(),
                result.width,
                result.tile_width,
                result.columns
            ),
            ("dungeon", hash.as_str(), Some(640), Some(32), Some(20))
        );
        for (i, pixel) in decode_rgba(&output_files[&result.path], 640)
            .unwrap()
            .as_chunks::<4>()
            .0
            .iter()
            .enumerate()
        {
            let inside = (576..640).contains(&(i % 640)) && (320..384).contains(&(i / 640));
            assert_eq!(
                pixel,
                if inside {
                    &[20, 40, 60, 255]
                } else {
                    &[3, 5, 7, 255]
                }
            );
        }
        assert_eq!(
            apply(&mut assets.clone(), &mut files.clone(), &migration).unwrap(),
            hash
        );
        migration.dungeon_sha256 = "0".repeat(64);
        assert!(apply(&mut assets.clone(), &mut files.clone(), &migration).is_err());
    }
}
