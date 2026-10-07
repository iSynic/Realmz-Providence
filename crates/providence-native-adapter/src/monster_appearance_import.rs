use crate::monster_appearance_views::monster_appearance_pair_summary;
use crate::request_params::required_i16;
use crate::request_params::required_string;
use crate::request_params::required_u32;
use crate::request_params::required_u64;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use providence_core::codecs::AUTHORED_MONSTER_APPEARANCE_SOURCE_PREFIX;
use providence_core::codecs::encode_monster_appearance_cicn;
use providence_core::codecs::encode_runtime_rgba_png;
use providence_core::codecs::mirror_rgba_horizontally;
use providence_core::model::AssetDescriptor;
use providence_core::model::ClassicResourceKey;
use providence_core::model::StableId;
use providence_core::monster_appearance::MONSTER_ICON_PAIR_OFFSET;
use providence_core::monster_appearance::resolve_monster_appearance;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::ExpectedRevisionCommand;
use providence_core::session::Revision;
use providence_storage::ProjectStore;
use serde_json::Value;
use serde_json::json;

pub(crate) fn import_monster_appearance_pair(
    session: &mut EditorSession,
    project_store: Option<&ProjectStore>,
    application_media: Option<&ApplicationMediaCatalog>,
    params: Value,
) -> Result<Value, String> {
    let project_store = project_store.ok_or_else(|| {
        "monster-appearance.import-pair requires an open portable project".to_string()
    })?;
    let expected_revision = Revision(required_u64(&params, "expectedRevision")?);
    if session.revision() != expected_revision {
        return Err(format!(
            "revision conflict: expected {}, current {}",
            expected_revision.0,
            session.revision().0
        ));
    }
    let input = AppearancePairInput::read(&params)?;
    let (base, facing) = input.store_assets(project_store)?;
    let projection = session
        .execute(ExpectedRevisionCommand {
            expected_revision,
            command: EditorCommand::UpsertMonsterAppearancePair {
                base: Box::new(base),
                facing: Box::new(facing),
            },
        })
        .map_err(|error| error.to_string())?;
    Ok(json!({
        "projection": projection,
        "appearance": monster_appearance_pair_summary(&resolve_monster_appearance(
            session.snapshot(),
            application_media,
            input.icon_id,
        )),
        "facingMode": input.facing_mode,
        "width": input.width,
        "height": input.height,
    }))
}

fn authored_monster_appearance_asset(
    project_store: &ProjectStore,
    input: &AppearancePairInput,
    resource_id: i32,
    role: &str,
    runtime_png: &[u8],
    classic_cicn: &[u8],
) -> Result<AssetDescriptor, String> {
    let icon_id = input.icon_id;
    let (width, height) = (input.width, input.height);
    let (label, facing_mode) = (&input.label, &input.facing_mode);
    let runtime_blob = project_store
        .put_blob(runtime_png)
        .map_err(|error| error.to_string())?;
    let classic_blob = project_store
        .put_blob(classic_cicn)
        .map_err(|error| error.to_string())?;
    Ok(AssetDescriptor {
        identity: StableId(format!("monster-appearance:{icon_id}:{role}")),
        label: format!("{label} {}", if role == "base" { "base" } else { "facing" }),
        kind: "icon".into(),
        mime_type: Some("image/png".into()),
        classic_resource: Some(ClassicResourceKey {
            resource_type: "cicn".into(),
            resource_id,
        }),
        scenario_music_slot: None,
        blob: runtime_blob,
        byte_length: runtime_png.len() as u64,
        classic_payload_blob: Some(classic_blob),
        classic_payload_byte_length: Some(classic_cicn.len() as u64),
        extension: Some("png".into()),
        width: Some(width),
        height: Some(height),
        duration_ms: None,
        sample_rate: None,
        channels: None,
        tile_width: None,
        tile_height: None,
        columns: None,
        rows: None,
        landlook: None,
        base_tile: None,
        source: format!(
            "{AUTHORED_MONSTER_APPEARANCE_SOURCE_PREFIX}({facing_mode}, {width} x {height})"
        ),
    })
}

struct AppearancePairInput {
    icon_id: i16,
    label: String,
    width: u32,
    height: u32,
    facing_mode: String,
    base_rgba: Vec<u8>,
    facing_rgba: Vec<u8>,
}

impl AppearancePairInput {
    fn read(params: &Value) -> Result<Self, String> {
        let icon_id = required_i16(params, "iconId")?;
        let base_id = i32::from(icon_id);
        let facing_id = base_id + MONSTER_ICON_PAIR_OFFSET;
        if base_id <= 0 || facing_id > i32::from(i16::MAX) {
            return Err(format!(
                "monster appearance base id {icon_id} cannot name a positive signed-short pair"
            ));
        }
        let label = required_string(params, "label")?;
        let label = label.trim().to_owned();
        if label.is_empty() {
            return Err("monster appearance label cannot be empty".into());
        }
        let width = required_u32(params, "width")?;
        let height = required_u32(params, "height")?;
        let base_rgba = BASE64
            .decode(required_string(params, "baseRgbaBase64")?)
            .map_err(|error| format!("invalid base appearance RGBA base64: {error}"))?;
        let facing_mode = params
            .get("facingMode")
            .and_then(Value::as_str)
            .unwrap_or("mirrored");
        let facing_rgba = match facing_mode {
            "mirrored" => mirror_rgba_horizontally(&base_rgba, width, height)
                .map_err(|error| error.to_string())?,
            "custom" => BASE64
                .decode(required_string(params, "facingRgbaBase64")?)
                .map_err(|error| format!("invalid facing appearance RGBA base64: {error}"))?,
            other => {
                return Err(format!(
                    "unsupported monster appearance facingMode '{other}'; expected mirrored or custom"
                ));
            }
        };
        Ok(Self {
            icon_id,
            label,
            width,
            height,
            facing_mode: facing_mode.into(),
            base_rgba,
            facing_rgba,
        })
    }

    fn store_assets(
        &self,
        project_store: &ProjectStore,
    ) -> Result<(AssetDescriptor, AssetDescriptor), String> {
        let (width, height) = (self.width, self.height);
        let base_cicn = encode_monster_appearance_cicn(&self.base_rgba, width, height)
            .map_err(|error| error.to_string())?;
        let facing_cicn = encode_monster_appearance_cicn(&self.facing_rgba, width, height)
            .map_err(|error| error.to_string())?;
        let base_png = encode_runtime_rgba_png(&self.base_rgba, width, height)
            .map_err(|error| error.to_string())?;
        let facing_png = encode_runtime_rgba_png(&self.facing_rgba, width, height)
            .map_err(|error| error.to_string())?;

        let base_id = i32::from(self.icon_id);
        let base = authored_monster_appearance_asset(
            project_store,
            self,
            base_id,
            "base",
            &base_png,
            &base_cicn,
        )?;
        let facing = authored_monster_appearance_asset(
            project_store,
            self,
            base_id + MONSTER_ICON_PAIR_OFFSET,
            "facing",
            &facing_png,
            &facing_cicn,
        )?;
        Ok((base, facing))
    }
}
