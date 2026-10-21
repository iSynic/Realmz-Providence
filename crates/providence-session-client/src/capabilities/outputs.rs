//! Success contracts describe the MCP projection, including shared-host metadata.
use serde_json::{Value, json};

pub(super) fn schema(method: &str) -> Option<Value> {
    if method != "export.inspect-artifact" {
        return None;
    }
    let mut result = object(json!({
        "path":text(65536),"format":{"type":"string","enum":["classic","rebuilt"]},
        "artifactSha256":sha256(),"artifactBytes":{"type":"integer","minimum":0,"maximum":1024u64*1024*1024},
        "hashAlgorithm":{"type":"string","enum":["sha256","providence.directory-sha256.v1"]},
        "projectId":text(512),"sessionGeneration":sha256(),
        "sourceRevision":{"type":"integer","minimum":0,"maximum":u64::MAX},
        "historyScope":text(512),"provenance":provenance()
    }));
    result["oneOf"] = json!([
        {"properties":{"format":{"enum":["classic"]},"hashAlgorithm":{"enum":["providence.directory-sha256.v1"]}}},
        {"properties":{"format":{"enum":["rebuilt"]},"hashAlgorithm":{"enum":["sha256"]}}}
    ]);
    Some(result)
}
fn provenance() -> Value {
    let integrity =
        object(json!({"file":text(65536),"sha256":{"anyOf":[sha256(),{"type":"null"}]}}));
    let support = object(json!({"option":text(512),"path":text(65536),
        "content":{"type":"array","items":integrity,"maxItems":13}}));
    object(json!({
        "hostProtocol":{"type":"integer","enum":[crate::HOST_PROTOCOL]},
        "authority":object(json!({"authoritySha256":sha256(),"hostProtocol":{"type":"integer","enum":[crate::HOST_PROTOCOL]}})),
        "buildIdentity":build_identity(),
        // Configuration metadata inherits the transport frame bound, not record pagination.
        "supportInputs":{"type":"array","items":support}
    }))
}
fn build_identity() -> Value {
    object(json!({
        "kind":{"type":"string","enum":["providence.tool-build-identity"]},
        "formatVersion":{"type":"integer","enum":[1]},"tool":text(512),"version":text(512),
        "commit":text(512),"sourceTree":text(512),"sourceDirty":{"type":"boolean"},
        "schemaSha256":sha256(),"cargoLockSha256":sha256(),
        "rustcVersion":text(4096),"cargoVersion":text(4096),"target":text(512),"profile":text(512)
    }))
}
fn object(properties: Value) -> Value {
    let required: Vec<_> = properties.as_object().unwrap().keys().cloned().collect();
    json!({"type":"object","properties":properties,"required":required,"additionalProperties":false})
}
fn text(maximum: usize) -> Value {
    json!({"type":"string","maxLength":maximum})
}
fn sha256() -> Value {
    json!({"type":"string","minLength":64,"maxLength":64,"pattern":"^[a-f0-9]{64}$"})
}
