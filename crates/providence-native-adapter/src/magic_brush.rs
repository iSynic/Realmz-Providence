use crate::request_params::{required_string, required_u64, required_value};
use providence_core::{
    model::StableId,
    session::{EditorCommand, EditorSession},
    smart_terrain::staged,
    terrain_joining::AtlasEvidence,
};
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
    atlas: &AtlasEvidence,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The map changed. Review Magic again.".into());
    }
    let identity = StableId(required_string(params, "identity")?);
    if method == "magic-brush.open" {
        return open(session, params, atlas);
    }
    if !matches!(method, "magic-brush.preview" | "magic-brush.apply") {
        return Err("Unknown Magic brush command.".into());
    }
    let intent: staged::Intent = serde_json::from_value(required_value(params, "intent")?.clone())
        .map_err(|e| e.to_string())?;
    let plan = staged::preview(session.snapshot(), &identity, &intent, atlas, &mut || false)
        .map_err(|e| e.to_string())?;
    let look = providence_core::map_paint::land_map(session.snapshot(), &identity)
        .map_err(|e| e.to_string())?
        .runtime
        .as_ref()
        .and_then(|r| r.landlook);
    let behaviors:Vec<_> = intent.strokes.iter().map(|stroke|json!({"sampledTile":stroke.sampled_tile,"family":staged::behavior(session.snapshot(),atlas,look,stroke.sampled_tile)})).collect();
    let result = if method == "magic-brush.apply" {
        crate::execute(
            session,
            params,
            EditorCommand::ApplyMagicBrush(staged::Apply {
                identity,
                intent,
                atlas: atlas.clone(),
            }),
        )?
    } else {
        json!({"revision":session.revision(),"mapIdentity":identity})
    };
    let mut result = crate::smart_terrain::project_plan(result, plan)?;
    result["strokeBehaviors"] = json!(behaviors);
    Ok(result)
}

fn open(
    session: &mut EditorSession,
    params: &Value,
    atlas: &AtlasEvidence,
) -> Result<Value, String> {
    let mut result =
        crate::smart_terrain::dispatch_mapped(session, "smart-terrain.open", params, Some(atlas))?;
    result["tilesetId"] = json!(atlas.tileset_id);
    result["available"] = json!(true);
    result["unavailableReason"] = Value::Null;
    result["linearFamilies"] = json!(
        providence_core::smart_terrain::linear::available(session.snapshot(), atlas)
            .iter()
            .map(|profile| json!({
                "identity": profile.identity, "name": profile.name,
                "tiles": profile.pieces.iter().map(|(tile, _)| tile).collect::<Vec<_>>()
            }))
            .collect::<Vec<_>>()
    );
    Ok(result)
}
