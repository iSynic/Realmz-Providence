use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{BlobId, ProjectOrigin, ProjectSnapshot, StableId};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClassicRuleSelectionContextV1 {
    pub record_version: u8,
    pub project_id: StableId,
    pub captured_source_set_sha256: String,
    pub native_menu_selection: u16,
    pub evidence_origin: ClassicRuleSelectionEvidence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ClassicRuleSelectionEvidence {
    OwnerConfigured,
    CapturedNativeSelection {
        #[serde(rename = "selectionReceiptBlob")]
        selection_receipt_blob: BlobId,
        #[serde(rename = "menuPayloadBlob")]
        menu_payload_blob: BlobId,
        #[serde(rename = "menuPayloadBytes")]
        menu_payload_bytes: u64,
        #[serde(rename = "resourceForkSha256")]
        resource_fork_sha256: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ClassicRuleSelectionPolicy {
    ApplicationOnly,
    ScenarioFirst,
}

impl ClassicRuleSelectionContextV1 {
    pub fn policy(&self) -> ClassicRuleSelectionPolicy {
        if self.native_menu_selection < 20 {
            ClassicRuleSelectionPolicy::ApplicationOnly
        } else {
            ClassicRuleSelectionPolicy::ScenarioFirst
        }
    }

    pub fn identity(&self) -> String {
        let bytes = serde_json::to_vec(self).expect("typed rule selection serializes");
        format!("sha256:{:x}", Sha256::digest(bytes))
    }

    pub fn validate_binding(&self, snapshot: &ProjectSnapshot) -> Result<(), String> {
        if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
            return Err("Classic rule selection belongs only to imported projects".into());
        }
        if self.record_version != 1
            || self.native_menu_selection == 0
            || self.native_menu_selection > i16::MAX as u16
        {
            return Err("Classic rule selection requires record version 1 and a positive native menu selection".into());
        }
        if self.project_id != snapshot.project_id {
            return Err("Classic rule selection belongs to a different project".into());
        }
        if self.captured_source_set_sha256 != classic_source_set_sha256(snapshot)? {
            return Err(
                "Classic rule selection is stale: captured scenario sources changed".into(),
            );
        }
        if let ClassicRuleSelectionEvidence::CapturedNativeSelection {
            selection_receipt_blob,
            menu_payload_blob,
            menu_payload_bytes,
            resource_fork_sha256,
        } = &self.evidence_origin
            && (!valid_blob(selection_receipt_blob)
                || !valid_blob(menu_payload_blob)
                || !valid_sha256(resource_fork_sha256)
                || *menu_payload_bytes == 0
                || *menu_payload_bytes > 65_536)
        {
            return Err("Classic rule selection has an invalid capture witness".into());
        }
        Ok(())
    }

    pub fn witness_blobs(&self) -> Vec<&BlobId> {
        match &self.evidence_origin {
            ClassicRuleSelectionEvidence::OwnerConfigured => Vec::new(),
            ClassicRuleSelectionEvidence::CapturedNativeSelection {
                selection_receipt_blob,
                menu_payload_blob,
                ..
            } => vec![selection_receipt_blob, menu_payload_blob],
        }
    }
}

// This digest binds captured native inputs, never scenario export eligibility.
pub fn classic_source_set_sha256(snapshot: &ProjectSnapshot) -> Result<String, String> {
    let mut sources = snapshot.classic_sources.iter().collect::<Vec<_>>();
    sources.sort_by(|a, b| a.native_path.cmp(&b.native_path));
    if sources
        .windows(2)
        .any(|pair| pair[0].native_path == pair[1].native_path)
    {
        return Err("captured Classic sources contain duplicate native paths".into());
    }
    if sources
        .iter()
        .any(|source| source.native_path.is_empty() || !valid_blob(&source.blob))
    {
        return Err("captured Classic source identity is invalid".into());
    }
    let bytes = serde_json::to_vec(&("providence-classic-source-set-v1", sources))
        .map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn valid_blob(blob: &BlobId) -> bool {
    blob.0.strip_prefix("sha256:").is_some_and(valid_sha256)
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
