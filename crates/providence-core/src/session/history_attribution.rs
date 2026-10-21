//! Attribution belongs to local editing history, never compiled scenario truth.
use super::*;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryAttribution {
    pub operation_id: String,
    pub client_kind: String,
    pub label: String,
}
impl EditorSession {
    pub fn execute_attributed(
        &mut self,
        request: ExpectedRevisionCommand<EditorCommand>,
        attribution: HistoryAttribution,
    ) -> Result<ChangeProjection, SessionError> {
        let history_navigation =
            matches!(&request.command, EditorCommand::Undo | EditorCommand::Redo);
        let before = self.revision();
        let result = self.execute(request)?;
        if !history_navigation && self.revision() != before {
            self.attribute_latest_edit(attribution);
        }
        Ok(result)
    }
    pub fn commit_authoring_stage_attributed(
        &mut self,
        stage: AuthoringStage,
        attribution: HistoryAttribution,
    ) -> Result<ChangeProjection, SessionError> {
        let before = self.revision();
        let result = self.commit_authoring_stage(stage)?;
        if self.revision() != before {
            self.attribute_latest_edit(attribution);
        }
        Ok(result)
    }
    /// Hosts attribute an acknowledged feature command before checkpointing.
    /// History navigation retains the original entry's attribution instead.
    pub fn attribute_latest_edit(&mut self, attribution: HistoryAttribution) {
        if let Some(entry) = self.undo.last_mut() {
            entry.attribution = Some(attribution);
        }
    }
}
