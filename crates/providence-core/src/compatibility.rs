mod assets;
mod classic;
mod classic_media;
mod classic_records;
mod finding_groups;
mod imported_instruction;
mod rebuilt;
mod rebuilt_documents;
mod reference_readiness;
mod startup;
mod world;

pub use classic::{classify_classic_slice, classify_classic_slice_with_application};
pub use rebuilt::{classify_rebuilt_v3, classify_rebuilt_v3_with_application};
pub use reference_readiness::reference_is_resolved_by_application;
pub(crate) use startup::imported_start_location_requires_deferred_capability;

use crate::{
    model::{ProjectSnapshot, StableId},
    rebuilt::ApplicationMediaCatalog,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompileTarget {
    ClassicCertificationSlice,
    RebuiltPackageV3,
    RebuiltPackageV4,
    RebuiltPackageV5,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CompatibilityStatus {
    Ready,
    ReadyWithWarnings,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityBlocker {
    pub code: String,
    pub message: String,
    pub entity: Option<StableId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<CompatibilityFindingGroup>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityFindingGroup {
    pub identity: String,
    pub field: String,
    pub target_kind: String,
    pub occurrence_count: usize,
    pub examples: Vec<String>,
    #[serde(skip)]
    pub members: Vec<CompatibilityFindingMember>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityFindingMember {
    pub field: String,
    pub target_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetCompatibility {
    pub target: CompileTarget,
    pub status: CompatibilityStatus,
    pub blockers: Vec<CompatibilityBlocker>,
    pub warnings: Vec<CompatibilityBlocker>,
}

pub fn classify_targets(snapshot: &ProjectSnapshot) -> Vec<TargetCompatibility> {
    vec![
        classify_classic_slice(snapshot),
        classify_rebuilt_v3(snapshot),
    ]
}

pub fn classify_targets_with_application(
    snapshot: &ProjectSnapshot,
    application_media: &ApplicationMediaCatalog,
) -> Vec<TargetCompatibility> {
    vec![
        classify_classic_slice_with_application(snapshot, application_media),
        classify_rebuilt_v3_with_application(snapshot, application_media),
    ]
}

fn is_sha256_blob(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit())
    })
}

fn blocker(
    code: impl Into<String>,
    message: impl Into<String>,
    entity: Option<StableId>,
) -> CompatibilityBlocker {
    CompatibilityBlocker {
        code: code.into(),
        message: message.into(),
        entity,
        group: None,
    }
}

fn finish_with_warnings(
    target: CompileTarget,
    mut blockers: Vec<CompatibilityBlocker>,
    mut warnings: Vec<CompatibilityBlocker>,
) -> TargetCompatibility {
    blockers.sort_by(|left, right| {
        (&left.code, &left.entity, &left.message).cmp(&(&right.code, &right.entity, &right.message))
    });
    warnings.sort_by(|left, right| {
        (&left.code, &left.entity, &left.message).cmp(&(&right.code, &right.entity, &right.message))
    });
    TargetCompatibility {
        target,
        status: match (blockers.is_empty(), warnings.is_empty()) {
            (true, true) => CompatibilityStatus::Ready,
            (true, false) => CompatibilityStatus::ReadyWithWarnings,
            (false, _) => CompatibilityStatus::Blocked,
        },
        blockers,
        warnings,
    }
}

#[cfg(test)]
mod tests;
