use super::*;
use providence_core::action_authoring::{action_definition_for_opcode, decode_form_values};

#[test]
fn choices_keep_distinct_meanings_and_signed_encodings() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for (opcode, index, label) in [(50, 4, "Living characters"), (60, 1, "Picked characters")] {
        let action = action_definition_for_opcode(opcode).unwrap();
        for value in [0, 1, 33, -1, i16::MIN] {
            let mut words = [2, 2, 33, -317, 33];
            words[index] = value;
            let values = decode_form_values(action.form_id.as_deref().unwrap(), words).unwrap();
            let description = dispatch_result(
                &mut session,
                "action-form.describe",
                json!({"query": {
                    "actionIdentity": format!("realmz.action.{opcode}"),
                    "targetNativeId": 33, "values": values, "context": {}
                }}),
            )
            .expect("describe eligibility choice through the adapter");
            let eligibility = &description["fields"][index];
            assert_eq!(eligibility["control"], "choice");
            assert_eq!(
                eligibility["choices"][0],
                json!({"label": "Everyone", "value": 0})
            );
            assert_eq!(
                eligibility["choices"][1],
                json!({"label": label, "value": if value == 0 { 1 } else { value }})
            );
            assert_eq!(eligibility["value"], value);
            assert!(eligibility["targetKind"].is_null());
            assert!(eligibility["preview"].is_null());
        }
    }
    assert_eq!(session.snapshot(), &before);
}
