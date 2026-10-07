use crate::{catalogs::CatalogViews, demo::demo_snapshot, startup::StartupTiming};
use providence_core::session::EditorSession;
use serde_json::{Value, json};
use std::io::Cursor;

#[test]
fn startup_timing_is_opt_in_and_does_not_change_ordinary_session_description() {
    let mut session = EditorSession::new(demo_snapshot());
    let timing = StartupTiming {
        project_open_ms: 12.5,
        libraries_open_ms: 30.25,
        ..Default::default()
    };
    let requests = [
        json!({"id": 1, "method": "session.describe", "params": {}}),
        json!({"id": 2, "method": "session.describe", "params": {"measurePerformance": true}}),
        json!({"id": 3, "method": "message.list", "params": {"measurePerformance": true}}),
    ];
    let input = requests
        .iter()
        .map(Value::to_string)
        .collect::<Vec<_>>()
        .join("\n");
    let mut output = Vec::new();
    crate::transport::serve_io_with_libraries(
        &mut session,
        None,
        CatalogViews::default(),
        None,
        Some(&timing),
        Cursor::new(input),
        &mut output,
    )
    .unwrap();
    let responses = String::from_utf8(output)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert!(responses.iter().all(|response| response["ok"] == true));
    assert!(responses[0]["result"].get("performance").is_none());
    assert_eq!(
        responses[1]["result"]["performance"]["startup"]["projectOpenMs"],
        12.5
    );
    assert_eq!(
        responses[1]["result"]["performance"]["startup"]["librariesOpenMs"],
        30.25
    );
    assert!(
        responses[2]["result"]["performance"]
            .get("startup")
            .is_none()
    );
    let mut measured = responses[1]["result"].clone();
    measured.as_object_mut().unwrap().remove("performance");
    assert_eq!(measured, responses[0]["result"]);
}
