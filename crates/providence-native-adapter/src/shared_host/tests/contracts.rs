//! Exercise advertised argument contracts against the actual feature handlers.
use super::*;
use providence_session_client::capabilities;

impl Fixture {
    fn capability(&mut self, method: &str, arguments: Value) -> Value {
        let mut params = self.meta();
        params
            .as_object_mut()
            .unwrap()
            .extend(arguments.as_object().unwrap().clone());
        let capability = capabilities::by_method(method).unwrap();
        capabilities::validate(&capability.input_schema, &params).unwrap();
        let response = self.request(1, method, params);
        assert!(response.ok, "{method}: {:?}", response.error);
        response.result.unwrap()
    }
    pub(super) fn group(&mut self, steps: Value, operation: &str) -> Value {
        let mut params = self.meta();
        params["steps"] = steps;
        let prepared = self.request(1, "changes.prepare", params);
        assert!(prepared.ok, "{:?}", prepared.error);
        let prepared = prepared.result.unwrap();
        let mut commit = self.meta();
        commit["previewToken"] = prepared["previewToken"].clone();
        commit["operationId"] = json!(operation);
        let response = self.request(1, "changes.commit", commit);
        assert!(response.ok, "{:?}", response.error);
        prepared["results"].clone()
    }
}

#[test]
fn allocated_strings_open_and_query_flow_through_the_advertised_arguments() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    let allocation = fixture.capability("text.allocate", json!({"family":"message"}));
    let native_id = allocation["nativeId"].clone();
    fixture.group(
        json!([{"name":"message","tool":"providence_text_apply_draft","arguments":{"draft":{
            "family":"message","nativeId":native_id,"expectedText":null,"text":"A Café crossroads"
        }}}]),
        "create-allocated-text",
    );
    let opened = fixture.capability("message.open", json!({"nativeId":native_id}));
    assert_eq!(opened["message"]["text"], "A Café crossroads");
    let identity = &opened["message"]["identity"];
    let preview = fixture.capability("discovery.preview", json!({"identity":identity}));
    assert_eq!(preview["record"]["identity"], *identity);
    fixture.capability(
        "discovery.links",
        json!({"direction":"outgoing","identity":identity}),
    );
    let flow = fixture.capability(
        "discovery.flow",
        json!({"root":{"identity":identity},"direction":"both","depth":2}),
    );
    assert_eq!(flow["graph"]["nodes"].as_array().unwrap().len(), 1);
    assert_eq!(
        fixture.capability("message.list", json!({"query":"not present"}))["total"],
        0
    );
    assert_eq!(fixture.session.undo_history().len(), 1);
}

#[test]
fn ap_filters_and_native_drafts_preserve_marker_and_shared_history() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    let created = fixture.group(
        json!([
            {"name":"map","tool":"providence_map_create","arguments":{"levelType":"land"}},
            {"name":"point","tool":"providence_action_point_create","arguments":{
                "mapIdentity":{"$result":"map","pointer":"/changedEntities/0"},"x":1,"y":2}}
        ]),
        "map-and-ap",
    );
    let map = &created["map"]["changedEntities"][0];
    let source = &created["point"]["changedEntities"][0];
    let opened = fixture.capability("action-point.open", json!({"identity":source}));
    let row = &opened["actionPoint"];
    let draft = json!({"source":source,"header":{"coordinate":row["coordinate"],"postActionLevel":row["postActionLevel"],
        "postActionX":row["postActionX"],"postActionY":row["postActionY"],"chancePercent":0},"steps":[]});
    fixture.group(json!([{"name":"dormant","tool":"providence_action_point_apply_draft","arguments":{"draft":draft}}]), "dormant-ap");
    let hidden = fixture.capability(
        "action-point.list",
        json!({"mapIdentity":map,"activationFilters":{"chance":"positive"}}),
    );
    assert_eq!(hidden["total"], 0);
    let dormant = fixture.capability(
        "action-point.list",
        json!({"mapIdentity":map,"activationFilters":{"chance":"nonpositive"}}),
    );
    assert_eq!(dormant["total"], 1);
    assert_eq!(
        fixture.capability(
            "action-point.list",
            json!({"mapIdentity":map,"search":"absent"})
        )["total"],
        0
    );
    let after = fixture.capability("action-point.open", json!({"identity":source}));
    assert_eq!(
        after["actionPoint"]["activation"]["entryMarker"],
        row["activation"]["entryMarker"]
    );
    assert_eq!(fixture.session.undo_history().len(), 2);
}

#[test]
fn allocated_spell_drafts_use_native_identity_guards_and_shared_history() {
    let mut fixture = Fixture::new();
    fixture.attach(1, "mcp");
    let allocation = fixture.capability("spell.allocation.review", json!({}));
    let mut draft = allocation["allocation"]["draft"].clone();
    assert_eq!(draft["recordIndex"], 0);
    assert_eq!(draft["definition"]["classicId"], 5101);
    draft["definition"]["name"] = json!("  Éclat  ");
    draft["definition"]["cost"] = json!(255);
    draft["definition"]["saveAdjust"] = json!(-128);
    assert_eq!(
        fixture.capability("spell.draft.prepare", json!({"draft":draft}))["valid"],
        true
    );
    fixture.group(
        json!([{"name":"spell","tool":"providence_spell_draft_apply","arguments":{"draft":draft}}]),
        "new-spell",
    );
    let opened = fixture.capability(
        "spell.open-authoring",
        json!({"identity":"classic.spell.5101"}),
    );
    assert_eq!(opened["definition"]["name"], "  Éclat  ");
    assert_eq!(opened["definition"]["cost"], 255);
    let reset = fixture.capability("spell.clear.review", json!({"recordIndex":0}));
    assert_eq!(reset["identityRetained"], true);
    fixture.group(json!([{"name":"reset","tool":"providence_spell_draft_apply","arguments":{"draft":reset["draft"]}}]), "reset-spell");
    fixture.capability("history.undo", json!({"operationId":"undo-reset"}));
    assert_eq!(
        fixture.capability(
            "spell.open-authoring",
            json!({"identity":"classic.spell.5101"})
        )["definition"]["name"],
        "  Éclat  "
    );
    assert_eq!(fixture.session.undo_history().len(), 1);
}
