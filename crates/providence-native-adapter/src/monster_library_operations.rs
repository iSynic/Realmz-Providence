use crate::{
    catalogs::OpenMonsterLibrary,
    request_params::{required_string, required_u64},
};
use providence_core::{
    model::{NativeRecordId, StableId},
    monster_library::{MonsterLibraryCommand, MonsterLibraryOrigin},
    session::{EditorSession, Revision},
};
use serde_json::{Value, json};

pub(crate) fn dispatch(
    project: &EditorSession,
    library: &mut OpenMonsterLibrary,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let normalized = crate::request_params::coerce_integral_numbers(params.clone());
    let params = &normalized;
    let expected = Revision(required_u64(params, "expectedRevision")?);
    if expected != library.session.revision() {
        return Err("The Library changed. Review this operation again.".into());
    }
    let command = prepare_command(project, params)?;
    let review = library
        .session
        .review_operation(&command)
        .map_err(|error| error.to_string())?;
    if method == "monster-library.operation.commit" {
        let change = library
            .session
            .execute_reviewed(expected, command, &required_string(params, "reviewHash")?)
            .map_err(|error| error.to_string())?;
        return Ok(json!({"change": change, "selectedIdentity": review.selected_identity}));
    }
    let offset = params.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let limit = params
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(128)
        .clamp(1, 128) as usize;
    Ok(
        json!({"revision": library.session.revision(), "reviewHash": review.review_hash,
        "offset": offset, "total": review.changes.len(), "items": review.changes.iter().skip(offset).take(limit).collect::<Vec<_>>() }),
    )
}

fn prepare_command(
    project: &EditorSession,
    params: &Value,
) -> Result<MonsterLibraryCommand, String> {
    let action = required_string(params, "action")?;
    let label = params
        .get("label")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let source = || required_string(params, "identity").map(StableId);
    let command = match action.as_str() {
        "create-library" => {
            let native_id = NativeRecordId(crate::request_params::required_u32(
                params,
                "preferredScenarioMonsterId",
            )?);
            MonsterLibraryCommand::CreateCustom {
                label,
                preferred_scenario_monster_id: native_id,
                template: Box::new(
                    providence_core::session::new_monster_template(native_id)
                        .map_err(|error| error.to_string())?,
                ),
                description: String::new(),
                origin: MonsterLibraryOrigin::Blank,
            }
        }
        "duplicate-library" => MonsterLibraryCommand::Duplicate {
            source: source()?,
            label,
        },
        "customize" => MonsterLibraryCommand::CustomizeBuiltIn {
            source: source()?,
            label: (!label.is_empty()).then_some(label),
        },
        "delete-library" => MonsterLibraryCommand::DeleteCustom {
            identity: source()?,
        },
        "restore-library" => MonsterLibraryCommand::RestoreBuiltIn { source: source()? },
        "copy-library" => {
            let revision = required_u64(params, "expectedProjectRevision")?;
            if revision != project.revision().0 {
                return Err("The source project changed. Review the copy again.".into());
            }
            crate::monster_library_copy::prepare_library_copy(
                project.snapshot(),
                params,
                crate::request_params::required_i16(params, "setId")?,
                NativeRecordId(crate::request_params::required_u32(params, "nativeId")?),
            )?
            .0
        }
        _ => return Err("Unknown Library record operation.".into()),
    };
    Ok(command)
}
