use std::collections::BTreeSet;

use crate::Request;
use crate::catalogs::CatalogViews;
use crate::demo::demo_ui_snapshot;
use crate::dispatch;
use crate::validation_jobs;
use providence_core::session::EditorSession;
use serde_json::Value;
use serde_json::json;

#[test]
fn ui_contract_commands_are_recognized_by_the_top_level_dispatcher() {
    let contract: Value = serde_json::from_str(include_str!("fixtures/ui-commands.json"))
        .expect("UI contract is valid JSON");
    let screens = contract["screens"]
        .as_array()
        .expect("UI contract screens are an array");
    let commands = screens
        .iter()
        .flat_map(|screen| {
            screen["commands"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
        })
        .collect::<BTreeSet<_>>();
    assert_eq!(screens.len(), 46);
    assert_eq!(commands.len(), 330);
    assert!(commands.contains("spell.draft.apply"));
    assert!(commands.contains("spell-reference.preview"));
    assert!(commands.contains("special-art.preview"));
    assert!(commands.contains("special-art.uses"));
    assert!(commands.contains("scenario-item.apply-library-artwork"));
    assert!(commands.contains("action-settings.commit-repair"));
    assert!(commands.contains("action-settings.reconcile-repair"));
    assert!(commands.contains("treasure.create"));
    assert!(commands.contains("treasure.clear"));
    assert!(commands.contains("shop.create"));
    assert!(commands.contains("shop.clear"));
    assert!(commands.contains("project.inspect-classic-plan"));
    assert!(commands.contains("project.inspect-classic-stuffit"));
    assert!(commands.contains("project.compile-classic-stuffit"));
    assert!(commands.contains("action-definition.list"));
    assert!(commands.contains("action-form.describe"));
    assert!(commands.contains("action-point.apply-draft"));
    assert!(commands.contains("extra-action-point.apply-draft"));
    assert!(commands.contains("extra-action-point.delete"));
    assert!(commands.contains("option-label.create"));
    assert!(commands.contains("option-label.duplicate"));
    assert!(commands.contains("encounter.list-prompts"));
    assert!(commands.contains("encounter.apply-simple-draft"));
    assert!(commands.contains("encounter.create-simple"));
    assert!(commands.contains("encounter.copy-simple"));

    for command in commands {
        let request = Request {
            id: 1,
            method: command.into(),
            params: json!({}),
        };
        let result = dispatch_at_server_boundary(request);
        assert_ne!(
            result.error.as_deref(),
            Some(format!("unknown method {command}").as_str()),
            "UI contract command '{command}' reached the unknown-method fallback"
        );
    }
}

fn dispatch_at_server_boundary(request: Request) -> crate::Response {
    // Receipt queries are recognized by the server before session dispatch.
    match crate::monster_operation_receipts::start(None, None, None, &request) {
        crate::monster_operation_receipts::Start::Reply(response) => response,
        crate::monster_operation_receipts::Start::Continue(_) => dispatch(
            &mut EditorSession::new(demo_ui_snapshot()),
            None,
            CatalogViews::default(),
            None,
            &mut validation_jobs::Jobs::default(),
            request,
        ),
    }
}
