use serde_json::{Value, json};

pub(crate) fn domain(message: String) -> Value {
    let prefix = message.split_once(':').map(|(code, _)| code).unwrap_or("");
    let code = match prefix {
        "revision-conflict"
        | "invalid-input"
        | "adapter-incompatible"
        | "adapter-unavailable"
        | "host-startup-failed"
        | "host-attach-failed"
        | "host-incompatible"
        | "host-authentication"
        | "session-stale"
        | "draft-active"
        | "edits-paused"
        | "native-sync-required"
        | "native-sync-pending"
        | "preview-expired"
        | "application-support-changed"
        | "paint-resource-changed"
        | "file-access"
        | "import-baseline-required"
        | "step-context-conflict"
        | "capability-unavailable"
        | "operation-conflict"
        | "operation-unresolved"
        | "operation-reconciled"
        | "outcome-unknown"
        | "change-cursor-expired"
        | "change-set-allocation-too-large"
        | "export-artifact-changed"
        | "export-output-exists"
        | "export-replacement-restore-blocked"
        | "output-exists" => prefix,
        _ if message.starts_with("refusing to overwrite existing") => "output-exists",
        _ => "authoring-error",
    };
    json!({"code":code,"message":message,"requiresReopen":code=="outcome-unknown"})
}
