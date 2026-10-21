//! Machine-local editing holds survive a host crash without storing draft text.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Hold {
    pub owner: String,
    pub draft_active: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub locations: Vec<DraftLocation>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DraftLocation {
    pub route: String,
    pub identity: String,
    pub label: String,
}
pub(super) fn draft_locations(params: &serde_json::Value) -> Result<Vec<DraftLocation>, String> {
    let rows: Vec<DraftLocation> = serde_json::from_value(
        params
            .get("locations")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([])),
    )
    .map_err(|error| format!("invalid draft locations: {error}"))?;
    if rows.len() > 64
        || rows
            .iter()
            .any(|row| row.route.len() > 128 || row.identity.len() > 256 || row.label.len() > 160)
    {
        return Err("draft locations exceed the 64-document or text bounds".into());
    }
    Ok(rows)
}
#[derive(Default)]
pub(super) struct Holds {
    path: Option<PathBuf>,
    pub disconnected: Vec<Hold>,
}
impl Holds {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let disconnected = if path.exists() {
            if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 64 * 1024 {
                return Err("editing hold file exceeds its bound".into());
            }
            let bytes = fs::read(&path).map_err(|e| e.to_string())?;
            serde_json::from_slice(&bytes).map_err(|e|format!("editing holds could not be read; preserve the file and resolve it before editing: {e}"))?
        } else {
            Vec::new()
        };
        Ok(Self {
            path: Some(path),
            disconnected,
        })
    }
    pub fn persist(&self, live: impl Iterator<Item = Hold>) -> Result<(), String> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        let values = self
            .disconnected
            .iter()
            .cloned()
            .chain(live)
            .collect::<Vec<_>>();
        if values.len() > 64 {
            return Err("editing hold limit reached; resolve disconnected owners".into());
        }
        save(path, &values).map_err(|e|format!("outcome-unknown: editing hold persistence failed; external edits remain blocked: {e}"))
    }
}
fn save(path: &Path, holds: &[Hold]) -> Result<(), String> {
    let mut file = tempfile::NamedTempFile::new_in(path.parent().ok_or("missing hold directory")?)
        .map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec(holds).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restarting_retains_even_a_previously_clean_connected_editor() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("holds.json");
        let state = Holds::load(path.clone()).unwrap();
        state
            .persist(
                [Hold {
                    owner: "window-one".into(),
                    draft_active: false,
                    locations: vec![],
                }]
                .into_iter(),
            )
            .unwrap();
        let reopened = Holds::load(path).unwrap();
        assert_eq!(reopened.disconnected.len(), 1);
        assert_eq!(reopened.disconnected[0].owner, "window-one");
    }

    #[test]
    fn locations_are_bounded_record_context_and_never_draft_text() {
        let valid = serde_json::json!({"locations":[{"route":"text.messages","identity":"message:1","label":"Message 1"}]});
        assert_eq!(draft_locations(&valid).unwrap()[0].identity, "message:1");
        let mut text = valid.clone();
        text["locations"][0]["draftText"] = serde_json::json!("Human draft must remain local");
        assert!(draft_locations(&text).is_err());
        let too_many = serde_json::json!({"locations":vec![valid["locations"][0].clone();65]});
        assert!(draft_locations(&too_many).is_err());
    }
}
