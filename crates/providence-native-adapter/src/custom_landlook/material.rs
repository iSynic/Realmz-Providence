use super::*;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use std::{fs::File, io::Read};

pub(super) struct Prepared {
    pub asset: AssetDescriptor,
    pub catalog: Option<LandlookCatalogMetadata>,
    profiles: Vec<TerrainProfile>,
    metadata: Vec<u8>,
    runtime: Vec<u8>,
    native: Vec<u8>,
    pub tiles: Vec<i16>,
    pub changed: bool,
}

struct ArtworkInput {
    metadata: Vec<u8>,
    pixels: Vec<u8>,
    tiles: Vec<i16>,
}

pub(super) fn metadata(
    session: &EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    source: i8,
    destination: i8,
) -> Result<Vec<u8>, String> {
    if let Some(row) = session
        .snapshot()
        .landlook_catalogs
        .iter()
        .find(|row| row.landlook == source)
    {
        let bytes = store
            .read_blob(&row.source_blob)
            .map_err(|error| error.to_string())?;
        return custom_landlook::clone_metadata(session.snapshot(), source, destination, &bytes);
    }
    let bytes = catalogs
        .application_terrain
        .ok_or("Configure Classic application support to copy stock behavior.")?
        .bytes(source)?;
    let decoded = decode_landlook_mapstats(
        bytes,
        source,
        standard_landlook_source_name(source)
            .ok_or("The selected behavior template is unavailable.")?,
        digest(bytes),
    )
    .map_err(|error| error.to_string())?;
    let mut template = ProjectSnapshot::new_authored(StableId("template".into()));
    template.landlook_catalogs.push(decoded.catalog);
    template.terrain_catalog = decoded.profiles;
    custom_landlook::clone_metadata(&template, source, destination, bytes)
}

pub(super) fn atlas(
    session: &EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    owner: &StableId,
    look: i8,
) -> Result<Value, String> {
    if ![0, 3, 4, 5, 6, 7, 8, 9, 10].contains(&look) {
        return Err("Choose a compatible Landlook template.".into());
    }
    let mut map = session
        .snapshot()
        .world
        .maps
        .iter()
        .find(|map| &map.identity == owner)
        .expect("bound origin")
        .clone();
    let runtime = map.runtime.as_mut().expect("bound renderer");
    runtime.landlook = Some(look);
    runtime.tileset_id = StableId(format!("classic.landlook.{look}"));
    crate::map_rendering::resolve_map_atlas(
        session,
        Some(store),
        catalogs.application_media,
        catalogs.application_media_store,
        &map,
    )
}

fn pixels(
    session: &EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    owner: &StableId,
    look: i8,
) -> Result<Vec<u8>, String> {
    let view = atlas(session, store, catalogs, owner, look)?;
    if view["available"] != true {
        return Err(view["reason"]
            .as_str()
            .unwrap_or("The exact template artwork is unavailable.")
            .into());
    }
    let png = BASE64
        .decode(view["base64"].as_str().ok_or("No template pixels.")?)
        .map_err(|error| error.to_string())?;
    let image = crate::personal_image::decode(&png)?;
    if (image.width, image.height) != (640, 320) {
        return Err("The template must retain its full 640 by 320 atlas.".into());
    }
    Ok(image.rgba)
}

pub(super) fn prepare(
    session: &EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    owner: &StableId,
    draft: &Draft,
) -> Result<Prepared, String> {
    let key = ClassicResourceKey {
        resource_type: "PICT".into(),
        resource_id: 300 + i32::from(draft.destination),
    };
    let mut rows = session
        .snapshot()
        .assets
        .iter()
        .filter(|asset| asset.classic_resource.as_ref() == Some(&key));
    let retained = rows.next();
    if rows.next().is_some() {
        return Err("The Custom Landlook artwork has duplicate resource owners. Repair the duplicate before replacing it.".into());
    }
    crate::stored_routes::check_retained_landlook(session, store, &key, retained.is_some())?;
    if occupied(session, draft.destination) && !draft.replace {
        return Err("The custom slot is occupied. Enable reviewed replacement to continue.".into());
    }
    let artwork = match draft.operation.as_str() {
        "clone" => ArtworkInput {
            metadata: metadata(
                session,
                store,
                catalogs,
                draft.source_look,
                draft.destination,
            )?,
            pixels: pixels(session, store, catalogs, owner, draft.source_look)?,
            tiles: (1..=200).collect(),
        },
        "import" => import_artwork(session, store, catalogs, owner, draft)?,
        _ => return Err("Choose cloning or artwork import.".into()),
    };
    let original = if draft.operation == "clone" {
        artwork.pixels.clone()
    } else {
        self::pixels(session, store, catalogs, owner, draft.destination)?
    };
    let result = build(session, owner, draft, retained, artwork, original)?;
    let mut validation = session.clone();
    execute(
        &mut validation,
        &json!({"expectedRevision":session.revision()}),
        result.command(owner, draft),
    )?;
    Ok(result)
}

fn build(
    session: &EditorSession,
    owner: &StableId,
    draft: &Draft,
    retained: Option<&AssetDescriptor>,
    artwork: ArtworkInput,
    original: Vec<u8>,
) -> Result<Prepared, String> {
    let ArtworkInput {
        metadata,
        pixels,
        tiles,
    } = artwork;
    let native = encode_landlook_artwork_pict(&pixels, &original)?;
    let decoded = decode_classic_pict(&native).map_err(|error| error.to_string())?;
    let runtime =
        encode_runtime_rgba_png(&decoded.rgba, 640, 320).map_err(|error| error.to_string())?;
    let asset = descriptor(draft.destination, retained, &runtime, &native);
    let decoded = if metadata.is_empty() {
        None
    } else {
        Some(
            decode_custom_landlook_mapstats(&metadata, draft.destination, digest(&metadata))
                .map_err(|error| error.to_string())?,
        )
    };
    let changed = retained.is_none_or(|row| row.blob != asset.blob)
        || decoded
            .as_ref()
            .is_some_and(|next| !session.snapshot().landlook_catalogs.contains(&next.catalog))
        || draft.assign_map
            && session.snapshot().world.maps.iter().any(|map| {
                &map.identity == owner
                    && map.runtime.as_ref().and_then(|runtime| runtime.landlook)
                        != Some(draft.destination)
            });
    let result = Prepared {
        asset,
        catalog: decoded.as_ref().map(|row| row.catalog.clone()),
        profiles: decoded.map(|row| row.profiles).unwrap_or_default(),
        metadata,
        runtime,
        native,
        tiles,
        changed,
    };
    Ok(result)
}

fn import_artwork(
    session: &EditorSession,
    store: &ProjectStore,
    catalogs: CatalogViews<'_>,
    owner: &StableId,
    draft: &Draft,
) -> Result<ArtworkInput, String> {
    if !session
        .snapshot()
        .landlook_catalogs
        .iter()
        .any(|row| row.landlook == draft.destination)
    {
        return Err("Create this Custom Landlook before importing artwork.".into());
    }
    let mut bytes = vec![];
    File::open(&draft.path)
        .map_err(|error| format!("Choose a readable PNG source: {error}"))?
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("Landlook artwork imports support PNG sources up to 4 MiB.".into());
    }
    let image = crate::personal_image::decode(&bytes)?;
    let original = pixels(session, store, catalogs, owner, draft.destination)?;
    let tiles = custom_landlook::artwork_tiles(draft.mode, draft.tile, image.width, image.height)?;
    Ok(ArtworkInput {
        metadata: vec![],
        pixels: custom_landlook::compose_artwork(
            &original,
            &image.rgba,
            draft.mode,
            draft.tile,
            image.width,
            image.height,
        )?,
        tiles,
    })
}

pub(super) fn descriptor(
    look: i8,
    retained: Option<&AssetDescriptor>,
    runtime: &[u8],
    native: &[u8],
) -> AssetDescriptor {
    AssetDescriptor {
        identity: retained
            .map(|row| row.identity.clone())
            .unwrap_or(StableId(format!("scenario.custom-landlook.{look}"))),
        label: format!("{} Landlook", name(look)),
        kind: "tileset".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "PICT".into(),
            resource_id: 300 + i32::from(look),
        }),
        scenario_music_slot: None,
        blob: digest(runtime),
        byte_length: runtime.len() as u64,
        classic_payload_blob: Some(digest(native)),
        classic_payload_byte_length: Some(native.len() as u64),
        extension: Some("png".into()),
        width: Some(640),
        height: Some(320),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: Some(32),
        tile_height: Some(32),
        columns: Some(20),
        rows: Some(10),
        landlook: Some(look),
        base_tile: None,
        source: "Scenario Custom Landlook".into(),
    }
}

fn digest(bytes: &[u8]) -> BlobId {
    BlobId(format!("sha256:{:x}", Sha256::digest(bytes)))
}

impl Prepared {
    pub(super) fn preview(&self) -> Value {
        json!({"available":true,"tilesetId":format!("classic.landlook.{}",self.asset.landlook.expect("custom")),"renderMode":"outdoor-landlook","tileWidth":32,"tileHeight":32,"columns":20,"rows":10,"width":640,"height":320,"base64":BASE64.encode(&self.runtime)})
    }
    pub(super) fn persist(&self, store: &ProjectStore) -> Result<(), String> {
        for bytes in [&self.runtime, &self.native, &self.metadata] {
            if !bytes.is_empty() {
                store.put_blob(bytes).map_err(|error| error.to_string())?;
            }
        }
        Ok(())
    }
    pub(super) fn command(&self, owner: &StableId, draft: &Draft) -> EditorCommand {
        EditorCommand::ApplyCustomLandlook {
            landlook: draft.destination,
            catalog: self.catalog.clone().map(Box::new),
            profiles: self.profiles.clone(),
            asset: Box::new(self.asset.clone()),
            assign_map: draft.assign_map.then(|| owner.clone()),
            replace: draft.replace,
        }
    }
}
