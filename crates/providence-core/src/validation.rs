use serde::{Deserialize, Serialize};

pub mod action_settings;
pub mod findings;
pub mod presentation;

use crate::{model::StableId, references::FieldPath};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Severity {
    Error,
    Warning,
    Information,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub code: String,
    pub severity: Severity,
    pub message: String,
    pub entity: Option<StableId>,
    pub field: Option<FieldPath>,
}
