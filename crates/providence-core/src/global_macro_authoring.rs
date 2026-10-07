use crate::codecs::encode_global_macro_hooks;
use crate::model::{
    GlobalMacroHook, ProjectSnapshot, ScenarioApplicationContract, ScenarioApplicationHooks,
};

pub fn prepare_global_macro_hooks(
    snapshot: &ProjectSnapshot,
    hooks: ScenarioApplicationHooks,
) -> Result<ScenarioApplicationContract, String> {
    let previous = snapshot.scenario_application.clone().unwrap_or_default();
    for hook in GlobalMacroHook::ALL {
        let target = hooks.get(hook);
        if target == previous.hooks.get(hook) {
            continue;
        }
        if let Some(target) = target {
            let available = snapshot.extra_action_points.iter().any(|row| {
                &row.identity == target && row.native_id.0 > 0 && row.native_id.0 <= i16::MAX as u32
            });
            if !available {
                return Err(format!(
                    "Global {} targets an unavailable Extra Action Point: {}",
                    hook.label(),
                    target.0
                ));
            }
        }
    }
    let contract = ScenarioApplicationContract { hooks };
    encode_global_macro_hooks(&contract, None).map_err(|error| error.to_string())?;
    Ok(contract)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ExtraActionPoint, NativeRecordId, StableId};

    #[test]
    fn only_explicit_replacements_require_an_available_signed_hook_destination() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("fixture".into()));
        let mut old = ScenarioApplicationContract::default();
        old.hooks.start_game = Some(StableId("extra-action-point:-27".into()));
        snapshot.scenario_application = Some(old.clone());
        snapshot.extra_action_points.push(ExtraActionPoint {
            identity: StableId("extra-action-point:40".into()),
            native_id: NativeRecordId(40),
            classic_door_id: 0,
            post_action_level: 0,
            post_action_x: 0,
            post_action_y: 0,
            chance_percent: 100,
            actions: Vec::new(),
        });
        let mut hooks = old.hooks.clone();
        hooks.shop = Some(StableId("extra-action-point:40".into()));
        let valid = prepare_global_macro_hooks(&snapshot, hooks.clone()).unwrap();
        assert_eq!(valid.hooks.start_game, old.hooks.start_game);
        hooks.temple = Some(StableId("extra-action-point:999".into()));
        assert!(prepare_global_macro_hooks(&snapshot, hooks).is_err());
        assert_eq!(snapshot.scenario_application, Some(old));
    }
}
