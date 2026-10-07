use crate::request_params::{required_string, required_u64};
use providence_core::{
    model::{LevelType, StableId},
    session::EditorSession,
};
use serde_json::{Value, json};

pub(crate) fn review(session: &EditorSession, params: &Value) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("The map catalog changed. Review the allocation again.".into());
    }
    let source = params
        .get("source")
        .and_then(Value::as_str)
        .map(|value| StableId(value.into()));
    let kind = if let Some(identity) = &source {
        session
            .snapshot()
            .world
            .maps
            .iter()
            .find(|map| map.identity == *identity)
            .map(|map| map.level_type)
            .ok_or_else(|| format!("Map {} is unavailable.", identity.0))?
    } else {
        match required_string(params, "levelType")?.as_str() {
            "land" => LevelType::Land,
            "dungeon" => LevelType::Dungeon,
            _ => return Err("Choose Land or Dungeon.".into()),
        }
    };
    let plan = session
        .preview_map_creation(kind, source.as_ref())
        .map_err(|error| error.to_string())?;
    Ok(json!({"revision":session.revision(),"plan":plan}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dispatch_result;
    use providence_core::model::ProjectSnapshot;

    #[test]
    fn allocation_review_is_pure_matches_commit_and_names_copy_resets() {
        let mut session =
            EditorSession::new(ProjectSnapshot::new_authored(StableId("map-review".into())));
        let before = session.snapshot().clone();
        let plan = review(&session, &json!({"expectedRevision":0,"levelType":"land"})).unwrap();
        assert_eq!(session.snapshot(), &before);
        assert_eq!(plan["plan"]["identity"], "land:0");
        dispatch_result(
            &mut session,
            "map.create",
            json!({"expectedRevision":0,"levelType":"land"}),
        )
        .unwrap();
        dispatch_result(
            &mut session,
            "map.update-cell",
            json!({"expectedRevision":1,"identity":"land:0","x":3,"y":4,"tile":1112}),
        )
        .unwrap();
        let before = session.snapshot().clone();
        let plan = review(&session, &json!({"expectedRevision":2,"source":"land:0"})).unwrap();
        assert_eq!(session.snapshot(), &before);
        assert_eq!(plan["plan"]["clearedMarkers"], 1);
        assert_eq!(plan["plan"]["copiedActionPoints"], 0);
        assert_eq!(plan["plan"]["identity"], "land:1");
        dispatch_result(
            &mut session,
            "map.duplicate",
            json!({"expectedRevision":2,"source":"land:0"}),
        )
        .unwrap();
        assert_eq!(session.snapshot().world.maps[1].identity.0, "land:1");
        assert_eq!(session.snapshot().world.maps[1].tiles[363], 112);
        assert!(review(&session, &json!({"expectedRevision":2,"source":"land:0"})).is_err());
    }
}
