//! Both official SDK lifecycles must carry object queries and native behavior metadata.
use rmcp::model::CallToolRequestParams;
use serde_json::{Value, json};

async fn call(
    client: &rmcp::Peer<rmcp::RoleClient>,
    tool: &'static str,
    arguments: Value,
) -> Value {
    let response = client
        .call_tool(
            CallToolRequestParams::new(tool).with_arguments(arguments.as_object().unwrap().clone()),
        )
        .await
        .unwrap();
    assert_ne!(response.is_error, Some(true), "{response:?}");
    response.structured_content.unwrap()
}

pub(super) async fn check(client: &rmcp::Peer<rmcp::RoleClient>) {
    let before = call(client, "providence_session_describe", json!({})).await;
    let context = json!({"projectId":before["projectId"],"sessionGeneration":before["sessionGeneration"],
        "expectedRevision":before["revision"]});
    let mut arguments = context.clone();
    arguments["query"] = json!({"actionIdentity":"realmz.action.9","targetNativeId":-1101,
        "values":{},"secondaryValues":{},"context":{"scriptKind":"extra-action-point"}});
    // Verify the advertised contract agrees with the actual native query type.
    serde_json::from_value::<providence_core::action_authoring::ActionFormDescribeQuery>(
        arguments["query"].clone(),
    )
    .unwrap();
    let form = call(client, "providence_action_form_describe", arguments).await;
    let field = &form["fields"][0];
    assert_eq!(field["value"], -1101);
    assert_eq!(field["referenceBehavior"]["checked"], true);
    assert_eq!(field["referenceBehavior"]["toggleValue"], 1101);
    assert_eq!(field["referenceBehavior"]["selectionMultiplier"], -1);
    let mut arguments = context;
    arguments["query"] = json!({"kind":"quest","limit":1});
    serde_json::from_value::<providence_core::action_authoring::ActionTargetQuery>(
        arguments["query"].clone(),
    )
    .unwrap();
    let page = call(client, "providence_action_target_list", arguments).await;
    assert_eq!(page["items"].as_array().unwrap().len(), 1);
    let after = call(client, "providence_session_describe", json!({})).await;
    assert_eq!(before, after);
}
