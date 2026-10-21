use super::*;

#[test]
fn contradictory_step_metadata_is_rejected_instead_of_being_replaced() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    fixture.group(json!([{"name":"text","tool":"providence_message_create","arguments":{"nativeId":1,"text":"Original"}}]), "original-text");
    let before = fixture.session.snapshot().clone();
    for (field, value) in [
        ("expectedRevision", json!(0)),
        ("projectId", json!("other-project")),
        ("sessionGeneration", json!("other-session")),
        ("operationId", json!("misplaced-operation")),
    ] {
        let mut arguments = json!({"identity":"message:1","text":"Stale intent"});
        arguments[field] = value;
        let mut request = fixture.meta();
        request["steps"] =
            json!([{"name":"edit","tool":"providence_message_update","arguments":arguments}]);
        fixture.reject(1, "changes.prepare", request, "step-context-conflict:");
    }
    assert_eq!(fixture.session.snapshot(), &before);
    assert_eq!(fixture.session.revision().0, 1);
    assert_eq!(fixture.session.undo_history().len(), 1);
}

#[test]
fn matching_group_metadata_keeps_one_atomic_revision_across_private_step_revisions() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    let meta = fixture.meta();
    let steps: Vec<_> = [1,2].into_iter().map(|id| json!({"name":format!("text{id}"),"tool":"providence_message_create","arguments":{
        "nativeId":id,"text":format!("Message {id}"),"expectedRevision":meta["expectedRevision"],
        "projectId":meta["projectId"],"sessionGeneration":meta["sessionGeneration"]
    }})).collect();
    fixture.group(json!(steps), "matched-group");
    assert_eq!(fixture.session.revision().0, 1);
    assert_eq!(fixture.session.snapshot().messages.len(), 2);
    assert_eq!(fixture.session.undo_history().len(), 1);
}
