use crate::codecs::OPTION_LABEL_RECORD_BYTES;
use crate::model::BlobId;
use crate::model::ClassicSourceBlob;
use crate::model::NativeRecordId;
use crate::model::OptionLabelRecord;
use crate::model::ProjectOrigin;
use crate::model::QuestLabel;
use crate::model::StableId;
use crate::session::EditorSession;
use crate::session::errors::SessionError;
use std::collections::BTreeSet;

impl EditorSession {
    pub(super) fn import_classic_option_label_slice(
        &mut self,
        annex_blob: BlobId,
        sources: Vec<ClassicSourceBlob>,
        option_labels: Vec<OptionLabelRecord>,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_classic_option_label_import(&sources, &option_labels)?;
        let identities = std::iter::once(self.snapshot.project_id.clone())
            .chain(
                self.snapshot
                    .option_labels
                    .iter()
                    .chain(option_labels.iter())
                    .map(|label| label.identity.clone()),
            )
            .collect::<BTreeSet<_>>();
        self.snapshot.origin = ProjectOrigin::Imported {
            compatibility_annex: annex_blob,
        };
        self.snapshot.classic_sources = sources;
        self.snapshot.option_labels = option_labels;
        self.snapshot.normalize();
        Ok(identities.into_iter().collect())
    }

    pub(super) fn update_option_label(
        &mut self,
        mut label: OptionLabelRecord,
    ) -> Result<Vec<StableId>, SessionError> {
        if label.text.chars().count() > crate::codecs::OPTION_LABEL_TEXT_BYTES {
            return Err(SessionError::InvalidOptionLabel {
                identity: label.identity.clone(),
                reason: format!(
                    "text exceeds {} Classic bytes",
                    crate::codecs::OPTION_LABEL_TEXT_BYTES
                ),
            });
        }
        label.authored = true;
        let existing = self
            .snapshot
            .option_labels
            .iter_mut()
            .find(|candidate| candidate.identity == label.identity)
            .ok_or_else(|| SessionError::OptionLabelNotFound(label.identity.clone()))?;
        if existing.native_id != label.native_id {
            return Err(SessionError::InvalidOptionLabel {
                identity: label.identity.clone(),
                reason: "native record identity cannot be changed".into(),
            });
        }
        let identity = label.identity.clone();
        *existing = label;
        Ok(vec![identity])
    }

    pub(super) fn create_option_label(&mut self) -> Result<Vec<StableId>, SessionError> {
        let native_id = next_option_label_id(&self.snapshot.option_labels);
        let label = authored_option_label(native_id, String::new());
        let identity = label.identity.clone();
        self.snapshot.option_labels.push(label);
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn duplicate_option_label(
        &mut self,
        source: StableId,
    ) -> Result<Vec<StableId>, SessionError> {
        let text = self
            .snapshot
            .option_labels
            .iter()
            .find(|candidate| candidate.identity == source)
            .map(|candidate| candidate.text.clone())
            .ok_or_else(|| SessionError::OptionLabelNotFound(source.clone()))?;
        let native_id = next_option_label_id(&self.snapshot.option_labels);
        let label = authored_option_label(native_id, text);
        let identity = label.identity.clone();
        self.snapshot.option_labels.push(label);
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn upsert_quest_label(
        &mut self,
        mut label: QuestLabel,
    ) -> Result<Vec<StableId>, SessionError> {
        validate_quest_label(&label)?;
        label.label = label.label.trim().to_string();
        let identity = label.identity();
        if let Some(existing) = self
            .snapshot
            .quest_labels
            .iter_mut()
            .find(|candidate| candidate.id == label.id)
        {
            *existing = label;
        } else {
            self.snapshot.quest_labels.push(label);
        }
        self.snapshot.normalize();
        Ok(vec![identity])
    }

    pub(super) fn delete_quest_label(&mut self, id: u8) -> Result<Vec<StableId>, SessionError> {
        let index = self
            .snapshot
            .quest_labels
            .iter()
            .position(|candidate| candidate.id == id)
            .ok_or(SessionError::QuestLabelNotFound(id))?;
        let identity = self.snapshot.quest_labels[index].identity();
        self.snapshot.quest_labels.remove(index);
        Ok(vec![identity])
    }
}

fn next_option_label_id(labels: &[OptionLabelRecord]) -> NativeRecordId {
    let used = labels
        .iter()
        .map(|label| label.native_id.0)
        .collect::<BTreeSet<_>>();
    NativeRecordId(
        (0..10_000)
            .find(|id| !used.contains(id))
            .unwrap_or(used.len() as u32),
    )
}

fn authored_option_label(native_id: NativeRecordId, text: String) -> OptionLabelRecord {
    OptionLabelRecord {
        identity: StableId(format!("option-label:{}", native_id.0)),
        native_id,
        text,
        authored: true,
    }
}

pub(super) fn validate_classic_option_label_import(
    sources: &[ClassicSourceBlob],
    labels: &[OptionLabelRecord],
) -> Result<(), SessionError> {
    let Some(source) = sources
        .iter()
        .find(|source| source.native_path == "Data OD")
    else {
        return Err(SessionError::InvalidClassicImport(
            "decoded option labels require Data OD provenance".into(),
        ));
    };
    let complete_rows = source.byte_length as usize / OPTION_LABEL_RECORD_BYTES;
    if complete_rows != labels.len() {
        return Err(SessionError::InvalidClassicImport(
            "Data OD complete-row count does not match the decoded option-label count".into(),
        ));
    }
    for (index, label) in labels.iter().enumerate() {
        if label.native_id.0 != index as u32
            || label.identity.0 != format!("option-label:{index}")
            || label.authored
        {
            return Err(SessionError::InvalidClassicImport(format!(
                "Data OD row {index} does not have canonical imported identity/state"
            )));
        }
    }
    Ok(())
}

pub(super) fn validate_quest_label(label: &QuestLabel) -> Result<(), SessionError> {
    if !(crate::model::CLASSIC_QUEST_FLAG_MIN..=crate::model::CLASSIC_QUEST_FLAG_MAX)
        .contains(&label.id)
    {
        return Err(SessionError::InvalidQuestLabel {
            id: label.id,
            reason: "only Classic scenario quest flags 1 through 126 are authorable".into(),
        });
    }
    if label.label.trim().is_empty() {
        return Err(SessionError::InvalidQuestLabel {
            id: label.id,
            reason: "label cannot be empty".into(),
        });
    }
    Ok(())
}
