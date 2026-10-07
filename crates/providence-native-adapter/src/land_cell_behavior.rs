use crate::{
    execute,
    request_params::{required_string, required_u8, required_u64, required_value},
};
use providence_core::{
    land_cell_behavior::{self as cell, LandCellBehaviorEdit},
    model::StableId,
    session::{EditorCommand, EditorSession},
};
use serde_json::{Value, json};

pub(crate) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    if required_u64(params, "expectedRevision")? != session.revision().0 {
        return Err("This map changed. Review the cell again.".into());
    }
    let identity = StableId(required_string(params, "identity")?);
    if method == "land-cell.open" {
        let result = cell::read(
            session.snapshot(),
            &identity,
            required_u8(params, "x")?,
            required_u8(params, "y")?,
        )
        .map_err(|error| error.to_string())?;
        return page(session.revision().0, &identity, result, params);
    }
    let edit: LandCellBehaviorEdit =
        serde_json::from_value(required_value(params, "edit")?.clone())
            .map_err(|error| error.to_string())?;
    match method {
        "land-cell.preview" => page(
            session.revision().0,
            &identity,
            cell::preview(session.snapshot(), &identity, &edit)
                .map_err(|error| error.to_string())?,
            params,
        ),
        "land-cell.apply" => execute(
            session,
            params,
            EditorCommand::ApplyLandCellBehavior { identity, edit },
        ),
        _ => Err(format!("unknown method {method}")),
    }
}

fn page(
    revision: u64,
    identity: &StableId,
    mut result: cell::LandCellBehavior,
    params: &Value,
) -> Result<Value, String> {
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let total = result.affected_maps.len();
    if offset > total {
        return Err("The passability impact page is outside the result.".into());
    }
    result.affected_maps = result
        .affected_maps
        .into_iter()
        .skip(offset)
        .take(128)
        .collect();
    Ok(json!({"identity":identity,"revision":revision,"cell":result,"offset":offset,"total":total}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dispatch_result;
    use providence_core::model::ProjectSnapshot;

    #[test]
    fn preview_is_pure_and_acceptance_checks_revision_and_exact_destination() {
        let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
            "cell-review".into(),
        )));
        dispatch_result(
            &mut session,
            "map.create",
            json!({"expectedRevision":0,"levelType":"land"}),
        )
        .unwrap();
        let before = session.snapshot().clone();
        let params = json!({"identity":"land:0","expectedRevision":1,"edit":{"x":4,"y":5,"secret":"hidden","solid":null,"removePlacement":false}});
        let plan = dispatch(&mut session, "land-cell.preview", &params).unwrap();
        assert_eq!(session.snapshot(), &before);
        assert_eq!(plan["cell"]["after"], 3156);
        dispatch(&mut session, "land-cell.apply", &params).unwrap();
        assert!(dispatch(&mut session, "land-cell.apply", &params).is_err());
        assert_eq!(session.snapshot().world.maps[0].tiles[454], 3156);
        let read = dispatch(
            &mut session,
            "land-cell.open",
            &json!({"identity":"land:0","x":4,"y":5,"expectedRevision":2}),
        )
        .unwrap();
        assert_eq!(read["cell"]["secret"], "hidden");
        let mut invalid = params;
        invalid["expectedRevision"] = json!(2);
        invalid["edit"]["unowned"] = json!(true);
        assert!(dispatch(&mut session, "land-cell.preview", &invalid).is_err());
    }
}
