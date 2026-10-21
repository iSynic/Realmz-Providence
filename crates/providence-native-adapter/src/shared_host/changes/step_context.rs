//! A group owns session guards; contradictory step metadata is never refreshed.
use serde_json::Value;

pub(super) fn check(envelope: &Value, steps: &[Value]) -> Result<(), String> {
    for (index, step) in steps.iter().enumerate() {
        let Some(arguments) = step["arguments"].as_object() else {
            continue;
        };
        if arguments.contains_key("operationId") {
            return Err(format!(
                "step-context-conflict: step {index} operationId belongs to change-set commit, not an individual step"
            ));
        }
        for field in ["expectedRevision", "projectId", "sessionGeneration"] {
            if let Some(value) = arguments.get(field)
                && value != &envelope[field]
            {
                return Err(format!(
                    "step-context-conflict: step {index} {field} conflicts with the change-set envelope; omit step metadata or supply the exact group context"
                ));
            }
        }
    }
    Ok(())
}
