use super::*;
use providence_core::action_authoring::{action_availability_reason, catalog};

#[test]
fn action_catalog_projects_core_availability_for_every_supported_script_kind() {
    let mut session = EditorSession::new(demo_snapshot());
    let page = dispatch_result(
        &mut session,
        "action-definition.list",
        json!({"limit": 256}),
    )
    .expect("bounded action catalog");
    let items = page["items"].as_array().unwrap();
    assert_eq!(items.len(), catalog().actions.len());
    for definition in catalog().actions {
        let projected = items
            .iter()
            .find(|item| item["identity"] == definition.identity)
            .unwrap();
        assert_eq!(projected["opcode"], definition.opcode);
        for kind in [
            "action-point",
            "extra-action-point",
            "simple-encounter",
            "complex-encounter",
        ] {
            let reason = action_availability_reason(definition.opcode, kind);
            assert_eq!(
                projected["availabilityByScriptKind"][kind]["available"],
                reason.is_none()
            );
            assert_eq!(
                projected["availabilityByScriptKind"][kind]["reason"],
                json!(reason)
            );
            let form = dispatch_result(
                &mut session,
                "action-form.describe",
                json!({"query": {
                    "actionIdentity": definition.identity, "context": {"scriptKind": kind},
                    "targetNativeId": 0, "values": {}
                }}),
            )
            .expect("form availability");
            assert_eq!(
                projected["availabilityByScriptKind"][kind]["available"],
                form["available"]
            );
            assert_eq!(
                projected["availabilityByScriptKind"][kind]["reason"],
                form["availabilityReason"]
            );
        }
    }
    for opcode in [-14, -23, 0] {
        assert!(items.iter().any(|item| item["opcode"] == opcode));
    }
}
