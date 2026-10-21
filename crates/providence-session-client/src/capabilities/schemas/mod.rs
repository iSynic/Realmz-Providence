//! MCP form contracts describe native inputs; feature commands remain the validator.
mod action_authoring;
mod discovery;
mod encounters;
mod exports;
mod gameplay;
mod imports;
mod items;
mod map_workflows;
mod media;
mod monsters;
mod paint;
mod player_maps;
mod reference_media;
mod repairs;
mod rules;
mod scripts;
mod spells;
mod story;
mod terrain;
mod terrain_generation;
#[cfg(test)]
mod tests;
mod world;
use serde_json::{Value, json};

pub(super) fn apply(method: &str, schema: &mut Value) {
    common_bounds(schema);
    for (field, contract) in story::fields(method)
        .into_iter()
        .chain(action_authoring::fields(method))
        .chain(scripts::fields(method))
        .chain(world::fields(method))
        .chain(terrain::fields(method))
        .chain(terrain_generation::fields(method))
        .chain(reference_media::fields(method))
        .chain(map_workflows::fields(method))
        .chain(media::fields(method))
        .chain(paint::fields(method))
        .chain(repairs::fields(method))
        .chain(exports::fields(method))
        .chain(imports::fields(method))
        .chain(discovery::fields(method))
        .chain(encounters::fields(method))
        .chain(spells::fields(method))
        .chain(monsters::fields(method))
        .chain(player_maps::fields(method))
        .chain(gameplay::fields(method))
        .chain(items::fields(method))
        .chain(rules::fields(method))
    {
        schema["properties"][field] = contract;
    }
    if method == "discovery.links" {
        schema["oneOf"] = json!([
            {"properties":{"direction":{"enum":["incoming"]}},"required":["kind","id"]},
            {"properties":{"direction":{"enum":["outgoing"]}},"required":["identity"]}
        ]);
    }
}

fn common_bounds(schema: &mut Value) {
    for (field, value) in schema["properties"].as_object_mut().unwrap() {
        match field.as_str() {
            "offset" | "expectedRevision" => value["minimum"] = json!(0),
            "limit" => *value = integer(1, 128),
            "x" | "y" => *value = integer(0, 89),
            "width" | "height" => *value = integer(1, 32),
            "setId" => *value = json!({"type":"integer","enum":[-1,0,1]}),
            "projectId" | "sessionGeneration" | "identity" | "source" | "mapIdentity" => {
                *value = identity()
            }
            "query" | "search" if value["type"] == "string" => *value = text(4096),
            _ => {}
        }
    }
}

fn object(properties: Value, optional: &[&str]) -> Value {
    let required: Vec<_> = properties
        .as_object()
        .unwrap()
        .keys()
        .filter(|key| !optional.contains(&key.as_str()))
        .cloned()
        .collect();
    json!({"type":"object","properties":properties,"required":required,"additionalProperties":false})
}
fn integer(minimum: i64, maximum: i64) -> Value {
    json!({"type":"integer","minimum":minimum,"maximum":maximum})
}
fn text(maximum: usize) -> Value {
    json!({"type":"string","maxLength":maximum})
}
fn identity() -> Value {
    json!({"type":"string","minLength":1,"maxLength":512})
}
fn choices(values: &[&str]) -> Value {
    json!({"type":"string","enum":values})
}
fn array(items: Value, minimum: usize, maximum: usize) -> Value {
    json!({"type":"array","items":items,"minItems":minimum,"maxItems":maximum})
}
fn nullable(value: Value) -> Value {
    json!({"anyOf":[value,{"type":"null"}]})
}
fn coordinate() -> Value {
    object(json!({"x":integer(0,89),"y":integer(0,89)}), &[])
}
