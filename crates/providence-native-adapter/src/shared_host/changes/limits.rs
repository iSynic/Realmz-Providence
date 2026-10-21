//! Bound implicit native gap initialization before allocating a private stage.
use providence_core::session::EditorSession;
use serde_json::Value;

pub(super) fn check(session: &EditorSession, method: &str, params: &Value) -> Result<(), String> {
    if !matches!(
        method,
        "extra-action-point.create" | "extra-action-point.duplicate"
    ) {
        return Ok(());
    }
    let Some(id) = params["nativeId"].as_u64().filter(|id| *id <= 32767) else {
        return Ok(());
    };
    let existing = &session.snapshot().extra_action_points;
    let upper = existing
        .iter()
        .map(|row| u64::from(row.native_id.0))
        .max()
        .unwrap_or(0)
        .max(id);
    let present = existing
        .iter()
        .filter(|row| u64::from(row.native_id.0) <= upper)
        .map(|row| row.native_id.0)
        .collect::<std::collections::BTreeSet<_>>()
        .len();
    let new_rows = upper + 1 - present as u64;
    if new_rows > 256 {
        return Err(format!(
            "change-set-allocation-too-large: this destination initializes {new_rows} XAP rows; the step limit is 256. Grow the catalog in reviewed batches before requesting this destination."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::{
        model::{ProjectSnapshot, StableId},
        session::{EditorCommand, ExpectedRevisionCommand},
    };
    use serde_json::json;

    #[test]
    fn a_known_native_destination_cannot_hide_unbounded_gap_initialization() {
        let mut session = EditorSession::new(ProjectSnapshot::new_authored(StableId(
            "allocation-limits".into(),
        )));
        assert!(
            check(
                &session,
                "extra-action-point.create",
                &json!({"nativeId":69})
            )
            .is_ok()
        );
        assert!(
            check(
                &session,
                "extra-action-point.create",
                &json!({"nativeId":256})
            )
            .is_err()
        );
        assert_eq!(session.revision().0, 0);
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: session.revision(),
                command: EditorCommand::CreateExtraActionPoint {
                    native_id: Some(providence_core::model::NativeRecordId(255)),
                },
            })
            .unwrap();
        assert!(
            check(
                &session,
                "extra-action-point.create",
                &json!({"nativeId":511})
            )
            .is_ok()
        );
        assert!(
            check(
                &session,
                "extra-action-point.create",
                &json!({"nativeId":512})
            )
            .is_err()
        );
    }
}
