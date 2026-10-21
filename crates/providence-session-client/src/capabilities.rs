//! Reviewed adapter routes, never a caller-selected method passthrough.
mod contract;
mod edits;
mod exports;
mod imports;
mod media;
mod outputs;
mod paint;
mod queries;
mod reference_media;
mod repairs;
mod schemas;
mod terrain;
mod terrain_generation;
mod validation;
use edits::EDITS;
use exports::EXPORTS;
use queries::READS;
use serde::Serialize;
use serde_json::{Value, json};
pub use validation::validate;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capability {
    pub name: String,
    pub method: &'static str,
    pub description: &'static str,
    pub mutation: bool,
    pub stageable: bool,
    pub external_effect: bool,
    pub input_schema: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<Value>,
    pub authoring: contract::AuthoringContract,
}

pub fn all() -> Vec<Capability> {
    registry().to_vec()
}
fn registry() -> &'static [Capability] {
    static REGISTRY: std::sync::OnceLock<Vec<Capability>> = std::sync::OnceLock::new();
    REGISTRY.get_or_init(build)
}
fn build() -> Vec<Capability> {
    let mut tools = Vec::new();
    for (method, description, fields) in READS
        .iter()
        .chain(media::READS)
        .chain(repairs::READS)
        .chain(paint::READS)
        .chain(exports::READS)
        .chain(terrain::READS)
        .chain(terrain_generation::READS)
        .chain(reference_media::READS)
        .chain(imports::READS)
    {
        tools.push(make(method, description, fields, false));
    }
    for (method, description, fields) in EDITS
        .iter()
        .chain(media::EDITS)
        .chain(repairs::EDITS)
        .chain(terrain::EDITS)
        .chain(reference_media::EDITS)
        .chain(imports::EDITS)
    {
        tools.push(make(method, description, fields, true));
    }
    for (method, description, fields) in EXPORTS
        .iter()
        .chain(paint::EXTERNAL)
        .chain(imports::EXTERNAL)
    {
        let mut tool = make(method, description, fields, false);
        tool.external_effect = true;
        tool.input_schema["properties"]
            .as_object_mut()
            .unwrap()
            .entry("operationId")
            .or_insert_with(|| json!({"type":"string","minLength":1,"maxLength":128}));
        tool.input_schema["required"]
            .as_array_mut()
            .unwrap()
            .push(json!("operationId"));
        tools.push(tool);
    }
    tools
}
pub fn find(name: &str) -> Option<Capability> {
    registry().iter().find(|tool| tool.name == name).cloned()
}
pub fn by_method(method: &str) -> Option<Capability> {
    registry()
        .iter()
        .find(|tool| tool.method == method)
        .cloned()
}

fn make(
    method: &'static str,
    description: &'static str,
    fields: &str,
    mutation: bool,
) -> Capability {
    let mut properties = json!({"expectedRevision":{"type":"integer","minimum":0},"projectId":{"type":"string"},"sessionGeneration":{"type":"string"}});
    let mut required = vec!["expectedRevision", "projectId", "sessionGeneration"];
    for spec in fields.split_whitespace() {
        let optional = spec.ends_with('?');
        let spec = spec.trim_end_matches('?');
        let (key, kind) = spec.split_once(':').unwrap_or((spec, "string"));
        properties[key] = match kind {
            "integer" => json!({"type":"integer"}),
            "boolean" => json!({"type":"boolean"}),
            "nullable-string" => json!({"type":["string","null"]}),
            "object" => json!({"type":"object"}),
            "array" => json!({"type":"array","maxItems":128}),
            _ => json!({"type":"string"}),
        };
        if !optional {
            required.push(key);
        }
    }
    if mutation {
        properties["operationId"] = json!({"type":"string","minLength":1,"maxLength":128});
        required.push("operationId");
    }
    let mut input_schema = json!({"type":"object","properties":properties,"required":required,"additionalProperties":false});
    schemas::apply(method, &mut input_schema);
    Capability {
        name: format!("providence_{}", method.replace(['.', '-'], "_")),
        method,
        description,
        mutation,
        stageable: mutation && !method.starts_with("history.")
            || matches!(method, "media.import.prepare" | "media.remove.prepare")
            || repairs::stageable(method),
        external_effect: false,
        input_schema,
        output_schema: outputs::schema(method),
        authoring: contract::describe(method, mutation),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_and_routes_are_unique() {
        let tools = all();
        let names: std::collections::BTreeSet<_> = tools.iter().map(|r| &r.name).collect();
        assert_eq!(names.len(), tools.len());
        let methods: std::collections::BTreeSet<_> = tools.iter().map(|r| r.method).collect();
        assert_eq!(methods.len(), tools.len());
        assert!(find("providence_arbitrary_method").is_none());
    }

    #[test]
    fn every_tool_has_a_real_native_owner_and_attributable_verification_scope() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        for tool in all() {
            let contract = &tool.authoring;
            assert!(
                root.join(&contract.owner).is_file(),
                "{}: {}",
                tool.method,
                contract.owner
            );
            assert!(!contract.task.is_empty() && !contract.history_scope.is_empty());
            assert!(!contract.prerequisites.is_empty());
            for check in &contract.verification.checks {
                assert!(root.join(check).is_file(), "{}: {check}", tool.method);
            }
            assert!(!contract.verification.limitation.is_empty());
        }
    }
}
