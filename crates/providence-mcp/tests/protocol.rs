//! Exercise the packaged-process boundary with the official client SDK in both eras.
use rmcp::{
    ClientHandler, ClientLifecycleMode, ClientServiceExt,
    model::{CallToolRequestParams, ClientConfig, ProtocolVersion, ReadResourceRequestParams},
    transport::TokioChildProcess,
};
use serde_json::json;
#[path = "protocol/action_queries.rs"]
mod action_queries;
#[path = "protocol/root_project.rs"]
mod root_project;

#[derive(Clone)]
struct Client {
    version: ProtocolVersion,
}
impl ClientHandler for Client {
    fn get_info(&self) -> ClientConfig {
        let mut config = ClientConfig::default();
        config.protocol_version = self.version.clone();
        config
    }
}

async fn check(version: ProtocolVersion, lifecycle: ClientLifecycleMode) {
    let root = tempfile::tempdir().unwrap();
    let library = tempfile::tempdir().unwrap();
    providence_storage::PersonalLibraryStore::create(library.path()).unwrap();
    let command = root_project::command(root.path(), root.path(), library.path());
    let transport = TokioChildProcess::new(command).unwrap();
    let client = Client { version }
        .serve_with_lifecycle(transport, lifecycle)
        .await
        .unwrap();
    let tools = client.list_all_tools().await.unwrap();
    assert!(tools.iter().any(|r| r.name == "providence_changes_prepare"));
    let result = client
        .call_tool(
            CallToolRequestParams::new("providence_capabilities")
                .with_arguments(json!({}).as_object().unwrap().clone()),
        )
        .await
        .unwrap();
    assert_ne!(result.is_error, Some(true));
    let rejected = client
        .call_tool(
            CallToolRequestParams::new("providence_capabilities").with_arguments(
                json!({"unsupported":"must not reach native dispatch"})
                    .as_object()
                    .unwrap()
                    .clone(),
            ),
        )
        .await
        .unwrap();
    assert_eq!(rejected.is_error, Some(true));
    assert_eq!(
        rejected.structured_content.as_ref().unwrap()["code"],
        "invalid-input"
    );
    let missing = client
        .call_tool(
            CallToolRequestParams::new("providence_project_create")
                .with_arguments(json!({}).as_object().unwrap().clone()),
        )
        .await
        .unwrap();
    assert_eq!(missing.is_error, Some(true));
    assert!(std::fs::read_dir(root.path()).unwrap().next().is_none());
    check_resources(client.peer()).await;
    check_artifact_output(client.peer(), root.path()).await;
    action_queries::check(client.peer()).await;
    client.cancel().await.unwrap();
    root_project::check(root.path(), library.path()).await;
}

async fn check_artifact_output(client: &rmcp::Peer<rmcp::RoleClient>, root: &std::path::Path) {
    let definitions = client.list_all_tools().await.unwrap();
    let tool = definitions
        .iter()
        .find(|tool| tool.name == "providence_export_inspect_artifact")
        .unwrap();
    let schema = serde_json::Value::Object((**tool.output_schema.as_ref().unwrap()).clone());
    assert_eq!(
        schema,
        providence_session_client::capabilities::by_method("export.inspect-artifact")
            .unwrap()
            .output_schema
            .unwrap()
    );
    let created = client
        .call_tool(
            CallToolRequestParams::new("providence_project_create").with_arguments(
                json!({"path":"artifact-project"})
                    .as_object()
                    .unwrap()
                    .clone(),
            ),
        )
        .await
        .unwrap();
    assert_ne!(created.is_error, Some(true));
    let session = created.structured_content.as_ref().unwrap();
    for kind in ["rebuilt", "classic"] {
        let artifact = root.join(if kind == "rebuilt" {
            "existing.realmz2"
        } else {
            "classic-folder"
        });
        if kind == "classic" {
            std::fs::create_dir(&artifact).unwrap();
            std::fs::write(artifact.join("Scenario"), b"artifact").unwrap();
        } else {
            std::fs::write(&artifact, b"artifact").unwrap();
        }
        check_artifact_result(client, session, &schema, kind, &artifact).await;
    }
}
async fn check_artifact_result(
    client: &rmcp::Peer<rmcp::RoleClient>,
    session: &serde_json::Value,
    schema: &serde_json::Value,
    kind: &str,
    artifact: &std::path::Path,
) {
    let response = client.call_tool(CallToolRequestParams::new("providence_export_inspect_artifact")
        .with_arguments(json!({"projectId":session["projectId"],"sessionGeneration":session["sessionGeneration"],
            "expectedRevision":session["revision"],"format":kind,"path":artifact}).as_object().unwrap().clone())).await.unwrap();
    assert_ne!(response.is_error, Some(true), "{response:?}");
    let output = response.structured_content.as_ref().unwrap();
    providence_session_client::capabilities::validate(schema, output).unwrap();
    assert_eq!(output["artifactBytes"], 8);
    assert_eq!(
        output["historyScope"],
        "artifact inspection; no project Undo entry"
    );
    assert_eq!(
        output["provenance"]["supportInputs"][0]["option"],
        "--personal-library-root"
    );
    let mut invalid = output.clone();
    invalid["hashAlgorithm"] = json!(if kind == "classic" {
        "sha256"
    } else {
        "providence.directory-sha256.v1"
    });
    assert!(providence_session_client::capabilities::validate(schema, &invalid).is_err());
    invalid = output.clone();
    invalid.as_object_mut().unwrap().remove("provenance");
    assert!(providence_session_client::capabilities::validate(schema, &invalid).is_err());
}

async fn check_resources(client: &rmcp::Peer<rmcp::RoleClient>) {
    let resources = client.list_all_resources().await.unwrap();
    assert!(
        resources
            .iter()
            .any(|r| r.uri == "providence://authoring/workflow")
    );
    assert!(
        resources
            .iter()
            .any(|r| r.uri == "providence://authoring/worked-milestone")
    );
    let example = client
        .read_resource(ReadResourceRequestParams::new(
            "providence://authoring/worked-milestone",
        ))
        .await
        .unwrap();
    let example = serde_json::to_string(&example).unwrap();
    assert!(example.contains("providence_changes_prepare"));
    assert!(example.contains("insufficient funds"));
}

#[tokio::test]
async fn current_protocol_discover_and_tools_work_over_stdio() {
    check(
        ProtocolVersion::V_2026_07_28,
        ClientLifecycleMode::Discover {
            preferred_versions: vec![ProtocolVersion::V_2026_07_28],
        },
    )
    .await;
}
#[tokio::test]
async fn legacy_protocol_initialization_and_tools_work_over_stdio() {
    check(
        ProtocolVersion::V_2025_11_25,
        ClientLifecycleMode::Initialize,
    )
    .await;
}
