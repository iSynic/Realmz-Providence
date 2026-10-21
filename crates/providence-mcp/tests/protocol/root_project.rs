use rmcp::{ServiceExt, model::CallToolRequestParams, transport::TokioChildProcess};
use serde_json::json;

pub(super) fn command(
    root: &std::path::Path,
    project: &std::path::Path,
    library: &std::path::Path,
) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(env!("CARGO_BIN_EXE_providence-mcp"));
    command
        .arg("--project-root")
        .arg(project)
        .arg("--output-root")
        .arg(root)
        .arg("--personal-library-root")
        .arg(library);
    // Keep session descriptors out of real user settings and Windows package
    // redirection; the fixture owns their lifetime together with its projects.
    command.env("LOCALAPPDATA", root.join("session-settings"));
    command.env("XDG_RUNTIME_DIR", root.join("session-settings"));
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command
}

pub(super) async fn check(root: &std::path::Path, library: &std::path::Path) {
    let project = root.join("artifact-project");
    let command = command(root, &project, library);
    let client = super::Client {
        version: rmcp::model::ProtocolVersion::V_2025_11_25,
    }
    .serve(TokioChildProcess::new(command).unwrap())
    .await
    .unwrap();
    let opened = client
        .call_tool(
            CallToolRequestParams::new("providence_project_open")
                .with_arguments(json!({"path":project}).as_object().unwrap().clone()),
        )
        .await
        .unwrap();
    assert_ne!(opened.is_error, Some(true), "{opened:?}");
    let session = client
        .call_tool(CallToolRequestParams::new("providence_session_describe"))
        .await
        .unwrap();
    assert_ne!(session.is_error, Some(true), "{session:?}");
    assert_eq!(
        opened.structured_content.as_ref().unwrap()["projectId"],
        session.structured_content.as_ref().unwrap()["projectId"]
    );
    client.cancel().await.unwrap();
}
