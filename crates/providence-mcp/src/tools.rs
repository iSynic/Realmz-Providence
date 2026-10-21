use providence_session_client::capabilities;
use rmcp::model::{Tool, ToolAnnotations};
use serde_json::{Value, json};

pub fn all() -> Vec<Tool> {
    let mut tools = capabilities::all().into_iter().map(|capability| {
        let description = if capability.mutation && !capability.method.starts_with("history.") { format!("Prepare a revision-bound change for review; commit with providence_changes_commit. {}", capability.description) } else { capability.description.to_string() };
        let mut input = capability.input_schema;
        if capability.stageable {
            input["properties"].as_object_mut().unwrap().remove("operationId");
            input["required"].as_array_mut().unwrap().retain(|key| key != "operationId");
        }
        let mut tool = Tool::new(capability.name, description, input.as_object().unwrap().clone());
        if let Some(schema) = capability.output_schema {
            tool = tool.with_raw_output_schema(std::sync::Arc::new(schema.as_object().unwrap().clone()));
        }
        tool.annotations = Some(ToolAnnotations::new().read_only(!capability.mutation && !capability.external_effect && !capability.method.ends_with(".cancel")).open_world(false));
        tool
    }).collect::<Vec<_>>();
    lifecycle_tools(&mut tools);
    changes_tools(&mut tools);
    tools
}
fn lifecycle_tools(tools: &mut Vec<Tool>) {
    for (name, description, fields) in [
        (
            "providence_project_open",
            "Open or attach to one project under the configured project root.",
            json!({"path":{"type":"string"}}),
        ),
        (
            "providence_project_create",
            "Create an authored project under the configured root. A configured application-rules root supplies native stock rules, spells and terrain; otherwise those catalogs start empty and must be authored before export.",
            json!({"path":{"type":"string"}}),
        ),
        (
            "providence_session_describe",
            "Read current project, revision, generation, clients and history availability.",
            json!({}),
        ),
        (
            "providence_project_close",
            "Detach this MCP client without closing another client.",
            json!({}),
        ),
        (
            "providence_capabilities",
            "Read the reviewed capability registry and its adapter contracts.",
            json!({}),
        ),
    ] {
        let required = fields
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        tools.push(tool(name, description, json!({"type":"object","properties":fields,"required":required,"additionalProperties":false})));
    }
}
fn changes_tools(tools: &mut Vec<Tool>) {
    let meta = json!({"projectId":{"type":"string"},"sessionGeneration":{"type":"string"},"expectedRevision":{"type":"integer","minimum":0}});
    for (name, description, fields, required) in [
        (
            "providence_changes_prepare",
            "Prepare 1–64 named native authoring steps atomically. Earlier results may be referenced with {$result:name,pointer:JSON-pointer}. Step session metadata must be omitted or match this exact group envelope; operationId belongs to commit. No live changes occur.",
            json!({"steps":{"type":"array","minItems":1,"maxItems":64,"items":{"type":"object","properties":{"name":{"type":"string"},"tool":{"enum":capabilities::all().into_iter().filter(|r|r.stageable && !r.method.starts_with("history.")).map(|r|r.name).collect::<Vec<_>>()},"arguments":{"type":"object"}},"required":["name","tool","arguments"],"additionalProperties":false}}}),
            vec!["steps"],
        ),
        (
            "providence_changes_commit",
            "Commit an exact prepared preview as one revision and Undo entry. Stale previews are rejected.",
            json!({"previewToken":{"type":"string"},"operationId":{"type":"string","maxLength":128,"minLength":1}}),
            vec!["previewToken", "operationId"],
        ),
        (
            "providence_operation_status",
            "Reconcile a durable operation receipt. A missing or pending receipt never authorizes blind replay.",
            json!({"operationId":{"type":"string"}}),
            vec!["operationId"],
        ),
        (
            "providence_operation_reconcile",
            "Reconcile an uncertain project edit against reopened state and retained history. Never replays the edit. External publications require separate artifact inspection.",
            json!({"operationId":{"type":"string"}}),
            vec!["operationId"],
        ),
        (
            "providence_session_changes",
            "Read the bounded shared-session change feed.",
            json!({"cursor":{"type":"integer","minimum":0}}),
            vec!["cursor"],
        ),
    ] {
        let mut properties = meta.as_object().unwrap().clone();
        properties.extend(fields.as_object().unwrap().clone());
        let mut required = required;
        required.extend(["projectId", "sessionGeneration", "expectedRevision"]);
        tools.push(tool(name, description, json!({"type":"object","properties":properties,"required":required,"additionalProperties":false})));
    }
}

fn tool(name: &str, description: &str, schema: Value) -> Tool {
    Tool::new(
        name.to_string(),
        description.to_string(),
        schema.as_object().unwrap().clone(),
    )
}
