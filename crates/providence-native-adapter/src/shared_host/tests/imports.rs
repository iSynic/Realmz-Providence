use super::*;
#[test]
fn mcp_import_cannot_replace_an_authored_project_or_clear_its_history() {
    let mut fixture = Fixture::new();
    let input = fixture.root.path().join("inputs");
    std::fs::create_dir(&input).unwrap();
    fixture.attach_with_access(1, "mcp", json!({"inputRoots":[input]}));
    fixture.group(json!([{"name":"text","tool":"providence_message_create","arguments":{"nativeId":1,"text":"Keep authored text"}}]), "author-before-import");
    let before = fixture.session.snapshot().clone();
    let mut request = fixture.meta();
    request["directory"] = json!(input);
    request["applicationDataDirectory"] = json!(input);
    request["operationId"] = json!("rejected-import");
    fixture.reject(
        1,
        "project.import-classic-scenario.begin",
        request,
        "import-baseline-required:",
    );
    assert_eq!(fixture.session.snapshot(), &before);
    assert_eq!(fixture.session.undo_history().len(), 1);
    assert!(!fixture.root.path().join(".providence/import-jobs").exists());
}
