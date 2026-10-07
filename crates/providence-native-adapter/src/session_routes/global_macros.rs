//! Native global macros requests; decoding and bounded projections stay with this feature.

use crate::execute;
use crate::request_params::required_value;
use providence_core::model::GlobalMacroHook;
use providence_core::model::StableId;
use providence_core::session::EditorCommand;
use providence_core::session::EditorSession;
use serde_json::Value;
use serde_json::json;

pub(super) fn dispatch(
    session: &mut EditorSession,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "global-macro.open" => global_macro_open(session, params),
        "global-macro.update" => global_macro_update(session, params),
        "global-macro.update-all" => global_macro_update_all(session, params),
        "global-macro.catalog" => super::global_macro_catalog::catalog(session, params),
        _ => Err(format!("unknown method {method}")),
    }
}

fn global_macro_update_all(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let values = required_value(&params, "hooks")?
        .as_object()
        .ok_or("global macro hooks must contain all five assignments")?;
    if values.len() != GlobalMacroHook::ALL.len() {
        return Err(
            "global macro hooks must contain exactly start, death, quit, shop and temple".into(),
        );
    }
    let mut contract = session
        .snapshot()
        .scenario_application
        .clone()
        .unwrap_or_default();
    for hook in GlobalMacroHook::ALL {
        let key = hook.label().to_lowercase();
        let target = match values.get(&key) {
            Some(Value::Null) => None,
            Some(Value::String(value)) => Some(StableId(value.clone())),
            _ => return Err(format!("Global {key} assignment must be a string or null")),
        };
        contract.hooks.set(hook, target);
    }
    let contract = providence_core::global_macro_authoring::prepare_global_macro_hooks(
        session.snapshot(),
        contract.hooks,
    )?;
    execute(
        session,
        &params,
        EditorCommand::SetScenarioApplication { contract },
    )
}

fn global_macro_open(session: &mut EditorSession, _params: Value) -> Result<Value, String> {
    let contract = session
        .snapshot()
        .scenario_application
        .clone()
        .unwrap_or_default();
    let references = session
        .references()
        .into_iter()
        .filter(|reference| reference.source == session.snapshot().project_id)
        .filter(|reference| reference.field.0.starts_with("scenarioApplication.hooks."))
        .collect::<Vec<_>>();
    let hooks = GlobalMacroHook::ALL
        .into_iter()
        .map(|hook| hook_projection(&contract, &references, hook))
        .collect::<Vec<_>>();
    let assigned_scripts = GlobalMacroHook::ALL
        .into_iter()
        .filter_map(|hook| contract.hooks.get(hook).as_ref())
        .filter_map(|target| {
            session
                .snapshot()
                .extra_action_points
                .iter()
                .find(|row| &row.identity == target)
        })
        .map(|row| {
            let steps =
                crate::session_routes::action_authoring::step_projections(session, &row.actions);
            let descriptor = session
                .snapshot()
                .script_descriptors
                .iter()
                .find(|item| item.source == row.identity)
                .map_or("", |item| item.text.as_str());
            json!({
                "identity": row.identity,
                "nativeId": row.native_id,
                "populatedActions": row.actions.len(),
                "descriptor": descriptor,
                "steps": steps,
            })
        })
        .collect::<Vec<_>>();
    let source = session
        .snapshot()
        .classic_sources
        .iter()
        .find(|source| source.native_path == "Global");
    Ok(json!({
        "revision": session.revision(),
        "contract": contract,
        "hooks": hooks,
        "assignedScripts": assigned_scripts,
        "diagnostics": session.diagnostics().into_iter().filter(|diagnostic| diagnostic.entity.as_ref() == Some(&session.snapshot().project_id)).collect::<Vec<_>>(),
        "source": source,
        "preservedSlots": [3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
    }))
}

fn global_macro_update(session: &mut EditorSession, params: Value) -> Result<Value, String> {
    let hook: GlobalMacroHook = serde_json::from_value(required_value(&params, "hook")?.clone())
        .map_err(|error| format!("invalid global macro hook: {error}"))?;
    let target = match params.get("target") {
        None | Some(Value::Null) => None,
        Some(Value::String(target)) => Some(StableId(target.clone())),
        Some(_) => return Err("global macro target must be a string or null".into()),
    };
    execute(
        session,
        &params,
        EditorCommand::SetGlobalMacroHook { hook, target },
    )
}

fn hook_projection(
    contract: &providence_core::model::ScenarioApplicationContract,
    references: &[providence_core::references::ReferenceDescriptor],
    hook: GlobalMacroHook,
) -> Value {
    let target = contract.hooks.get(hook).clone();
    let target_native_id = target.as_ref().and_then(|target| {
        target
            .0
            .strip_prefix("extra-action-point:")
            .and_then(|value| value.parse::<i16>().ok())
    });
    let reference = references
        .iter()
        .find(|reference| {
            reference
                .byte_provenance
                .as_ref()
                .is_some_and(|provenance| {
                    provenance.native_path == "Global"
                        && provenance.byte_start == u32::from(hook.slot()) * 2
                })
        })
        .cloned();
    json!({
        "hook": hook,
        "slot": hook.slot(),
        "label": hook.label(),
        "runtimeConsumer": hook.runtime_consumer(),
        "target": target,
        "targetNativeId": target_native_id,
        "reference": reference,
        "byteStart": u32::from(hook.slot()) * 2,
        "byteEnd": u32::from(hook.slot()) * 2 + 2,
    })
}
