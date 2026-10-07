use crate::execute;
use crate::request_params::required_i16;
use crate::request_params::required_string;
use crate::request_params::required_u8;
use crate::request_params::required_value;
use providence_core::model::ExtraCodeRow;
use providence_core::model::StableId;
use providence_core::session::ActionSettingsEdit;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use providence_core::session::ExtraCodeBranchLayout;
use serde_json::Value;

mod repair;

pub(super) fn handles(method: &str) -> bool {
    method.starts_with("action-settings.")
        || matches!(
            method,
            "extra-code.upsert"
                | "extra-code-value.retarget"
                | "extra-code-battle-range.retarget"
                | "extra-code-branch.retarget"
        )
}

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    if method.starts_with("action-settings.") && method != "action-settings.apply" {
        return repair::dispatch(session, method, params);
    }
    let command = match method {
        "action-settings.apply" => {
            let edit: ActionSettingsEdit =
                serde_json::from_value(required_value(params, "edit")?.clone())
                    .map_err(|error| format!("invalid action settings: {error}"))?;
            EditorCommand::ApplyActionSettings { edit }
        }
        "extra-code.upsert" => {
            let row: ExtraCodeRow = serde_json::from_value(required_value(params, "row")?.clone())
                .map_err(|error| format!("invalid E-code row: {error}"))?;
            EditorCommand::UpsertExtraCode { row }
        }
        "extra-code-value.retarget" => EditorCommand::RetargetExtraCodeValue {
            source: StableId(required_string(params, "source")?),
            index: required_u8(params, "index")?,
            target_id: required_i16(params, "targetId")?,
        },
        "extra-code-battle-range.retarget" => EditorCommand::RetargetExtraCodeBattleRange {
            source: StableId(required_string(params, "source")?),
            low_id: required_i16(params, "lowId")?,
            high_id: required_i16(params, "highId")?,
        },
        "extra-code-branch.retarget" => {
            let layout: ExtraCodeBranchLayout =
                serde_json::from_value(Value::String(required_string(params, "layout")?))
                    .map_err(|_| "layout must be choice or force".to_string())?;
            EditorCommand::RetargetExtraCodeBranch {
                source: StableId(required_string(params, "source")?),
                layout,
                mode: required_i16(params, "mode")?,
                target_id: required_i16(params, "targetId")?,
            }
        }
        _ => return Err(format!("unsupported action settings command: {method}")),
    };
    execute(session, params, command)
}

#[cfg(test)]
mod tests;
