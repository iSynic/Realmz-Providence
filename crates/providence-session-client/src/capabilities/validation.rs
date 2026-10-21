//! Enforce the schema vocabulary emitted by this registry before native dispatch.
use serde_json::Value;

pub fn validate(schema: &Value, value: &Value) -> Result<(), String> {
    check(schema, value, "$", 0).map_err(|error| format!("invalid-input: {error}"))
}
fn check(schema: &Value, value: &Value, path: &str, depth: usize) -> Result<(), String> {
    if depth > 32 {
        return Err(format!("{path} exceeds the input nesting bound"));
    }
    alternatives(schema, value, path, depth)?;
    if let Some(kind) = schema.get("type") {
        let matches = match kind {
            Value::String(kind) => has_type(value, kind),
            Value::Array(kinds) => kinds
                .iter()
                .filter_map(Value::as_str)
                .any(|kind| has_type(value, kind)),
            _ => false,
        };
        if !matches {
            return Err(format!("{path} must match type {kind}"));
        }
    }
    if schema["enum"]
        .as_array()
        .is_some_and(|values| !values.contains(value))
    {
        return Err(format!("{path} is not an available choice"));
    }
    if let Some(object) = value.as_object() {
        object_fields(schema, object, path, depth)?;
    }
    if let Some(array) = value.as_array() {
        bounds(schema, array.len() as f64, "minItems", "maxItems", path)?;
        if let Some(items) = schema.get("items") {
            for (index, value) in array.iter().enumerate() {
                check(items, value, &format!("{path}[{index}]"), depth + 1)?;
            }
        }
    }
    if let Some(text) = value.as_str() {
        bounds(
            schema,
            text.chars().count() as f64,
            "minLength",
            "maxLength",
            path,
        )?;
        string_pattern(schema, text, path)?;
    }
    if let Some(number) = value.as_f64() {
        bounds(schema, number, "minimum", "maximum", path)?;
    }
    Ok(())
}
fn string_pattern(schema: &Value, text: &str, path: &str) -> Result<(), String> {
    match schema.get("pattern").and_then(Value::as_str) {
        None => Ok(()),
        // The registry emits only this pattern. Fail closed if that vocabulary expands.
        Some("^[a-f0-9]{64}$")
            if text.len() == 64
                && text
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)) =>
        {
            Ok(())
        }
        Some("^[a-f0-9]{64}$") => Err(format!("{path} must be a lowercase SHA-256 hash")),
        Some(_) => Err(format!("{path} has an unsupported schema pattern")),
    }
}
fn object_fields(
    schema: &Value,
    object: &serde_json::Map<String, Value>,
    path: &str,
    depth: usize,
) -> Result<(), String> {
    bounds(
        schema,
        object.len() as f64,
        "minProperties",
        "maxProperties",
        path,
    )?;
    for key in schema["required"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
    {
        if !object.contains_key(key) {
            return Err(format!("{path}.{key} is required"));
        }
    }
    for (key, value) in object {
        if let Some(child) = schema["properties"].get(key) {
            check(child, value, &format!("{path}.{key}"), depth + 1)?;
        } else if schema["additionalProperties"] == false {
            return Err(format!("{path}.{key} is not a supported field"));
        } else if schema["additionalProperties"].is_object() {
            check(
                &schema["additionalProperties"],
                value,
                &format!("{path}.{key}"),
                depth + 1,
            )?;
        }
    }
    Ok(())
}
fn alternatives(schema: &Value, value: &Value, path: &str, depth: usize) -> Result<(), String> {
    for (keyword, exactly_one) in [("anyOf", false), ("oneOf", true)] {
        if let Some(choices) = schema[keyword].as_array() {
            let matched = choices
                .iter()
                .filter(|choice| check(choice, value, path, depth + 1).is_ok())
                .count();
            if matched == 0 || exactly_one && matched != 1 {
                return Err(format!("{path} does not match {keyword}"));
            }
        }
    }
    Ok(())
}
fn has_type(value: &Value, kind: &str) -> bool {
    match kind {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "integer" => value.is_i64() || value.is_u64(),
        "number" => value.is_number(),
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        _ => false,
    }
}
fn bounds(
    schema: &Value,
    value: f64,
    minimum: &str,
    maximum: &str,
    path: &str,
) -> Result<(), String> {
    if schema[minimum].as_f64().is_some_and(|bound| value < bound)
        || schema[maximum].as_f64().is_some_and(|bound| value > bound)
    {
        return Err(format!("{path} is outside the supported bounds"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn unknown_publication_options_and_unbounded_groups_are_rejected() {
        let capability = super::super::find("providence_project_compile_rebuilt_package").unwrap();
        let valid = json!({"projectId":"scenario","sessionGeneration":"generation","expectedRevision":1,"operationId":"export","path":"output.realmz2","minimumEngineVersion":"0.1.0"});
        assert!(validate(&capability.input_schema, &valid).is_ok());
        let mut forged = valid.clone();
        forged["applicationLibraryRoot"] = json!("unconfigured path");
        assert!(
            validate(&capability.input_schema, &forged)
                .unwrap_err()
                .contains("applicationLibraryRoot")
        );
        let mut missing = valid;
        missing.as_object_mut().unwrap().remove("expectedRevision");
        assert!(validate(&capability.input_schema, &missing).is_err());
        assert!(validate(&json!({"type":"array","maxItems":2}), &json!([1, 2, 3])).is_err());
    }
}
