//! Legacy fixed-family requests share the bounded item catalog projection.
use crate::{
    execute,
    request_params::{coerce_integral_numbers, required_u16, required_value},
};
use providence_core::{
    model::ItemRuleDefinition,
    session::{EditorCommand, EditorSession},
};
use serde_json::Value;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "item.list" | "item.open" => crate::item_catalog::dispatch(session, None, method, params),
        "item-rules.list" => item_rules_list(session, params),
        "scenario-item-rules.list" => scenario_item_rules_list(session, params),
        "scenario-item.update" => scenario_item_update(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn item_rules_list(session: &mut EditorSession, _params: Value) -> Result<Value, String> {
    serde_json::to_value(
        session
            .snapshot()
            .item_rules
            .iter()
            .map(|rule| &rule.definition)
            .collect::<Vec<_>>(),
    )
    .map_err(|error| error.to_string())
}

fn scenario_item_rules_list(session: &mut EditorSession, _params: Value) -> Result<Value, String> {
    serde_json::to_value(
        session
            .snapshot()
            .scenario_item_rules
            .iter()
            .map(|rule| &rule.definition)
            .collect::<Vec<_>>(),
    )
    .map_err(|error| error.to_string())
}

fn scenario_item_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let definition: ItemRuleDefinition = serde_json::from_value(coerce_integral_numbers(
        required_value(&params, "definition")?.clone(),
    ))
    .map_err(|error| format!("invalid scenario item definition: {error}"))?;
    execute(
        session,
        &params,
        EditorCommand::UpdateScenarioItem {
            record_index: required_u16(&params, "recordIndex")?,
            definition: Box::new(definition),
        },
    )
}
