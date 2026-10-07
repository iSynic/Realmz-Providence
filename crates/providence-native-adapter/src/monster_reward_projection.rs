use crate::monster_appearance_views::monster_appearance_resource_projection;
use providence_core::monster_appearance::resolve_monster_reward_icons;
use providence_core::rebuilt::ApplicationMediaCatalog;
use providence_core::session::EditorSession;
use providence_storage::ProjectStore;
use providence_storage::ReferenceLibraryStore;
use serde_json::{Value, json};

pub(crate) fn preview(
    session: &EditorSession,
    project_store: Option<&ProjectStore>,
    application: Option<&ApplicationMediaCatalog>,
    application_store: Option<&ReferenceLibraryStore>,
) -> Result<Value, String> {
    let mut bytes = 0;
    let resources = resolve_monster_reward_icons(session.snapshot(), application)
        .iter()
        .map(|resource| {
            monster_appearance_resource_projection(
                resource,
                project_store,
                application_store,
                &mut bytes,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(
        json!({"format": "providence.monster-rewards.v1", "revision": session.revision(), "applicationConfigured": application.is_some(), "resources": resources, "payloadBytes": bytes}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use providence_core::model::{ProjectSnapshot, StableId};
    #[test]
    fn absent_art_has_three_honest_rows_and_no_facing_or_payload() {
        let session = EditorSession::new(ProjectSnapshot::new_authored(StableId("rewards".into())));
        let result = preview(&session, None, None, None).unwrap();
        assert_eq!(result["revision"], 0);
        assert_eq!(result["payloadBytes"], 0);
        let rows = result["resources"].as_array().unwrap();
        assert_eq!(rows.len(), 3);
        for (row, id) in rows.iter().zip([2002, 2014, 2012]) {
            assert_eq!(row["resourceId"], id);
            assert_eq!(row["payloadAvailable"], false);
            assert!(row.get("base64").is_none());
            assert!(row.get("facing").is_none());
        }
    }
}
