//! Archive read contracts for Classic and Safe Actions documents. These records
//! are inspection data, not editor commands or executable compiler projections.

pub mod expressions;
pub mod safe_actions;

use expressions::SafeExpression;
use providence_core::{
    model::StableId,
    rebuilt::{RebuiltExtraCodeTail, RebuiltV3ApplicationHooks, RebuiltV3ProgramOwnerKind},
};
use safe_actions::SafeScenarioAction;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RebuiltScenarioArchiveDocument {
    pub kind: String,
    pub schema_version: u8,
    pub application_hooks: RebuiltV3ApplicationHooks,
    pub programs: Vec<ScenarioArchiveProgram>,
    pub scenario_actions: Vec<SafeScenarioAction>,
    // The package schema leaves these metadata members open. Retain them as data;
    // execution and state migration validation remain the runtime's responsibility.
    pub state_definitions: Vec<Value>,
    pub migrations: Vec<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_code_tail: Option<RebuiltExtraCodeTail>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScenarioArchiveProgram {
    pub id: StableId,
    pub owner_kind: RebuiltV3ProgramOwnerKind,
    pub owner_id: StableId,
    #[serde(deserialize_with = "bounded_vec::<_, _, 4096>")]
    pub instructions: Vec<ScenarioArchiveInstruction>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ScenarioArchiveInstruction {
    ClassicAction {
        slot: u8,
        raw_opcode: i16,
        opcode: i16,
        id: i16,
        gosub: bool,
        #[serde(deserialize_with = "required_nullable")]
        extra_code: Option<Vec<i16>>,
    },
    CallScenarioAction {
        action_id: StableId,
        arguments: BTreeMap<String, SafeExpression>,
        #[serde(deserialize_with = "required_nullable")]
        result: Option<String>,
    },
}

// Nullable schema fields are required keys; serde's ordinary Option default
// would accept missing keys and silently turn malformed input into null.
pub(super) fn required_nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}

pub(super) fn bounded_vec<'de, D, T, const MAX: usize>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    let values = Vec::<T>::deserialize(deserializer)?;
    if values.len() > MAX {
        return Err(serde::de::Error::custom(format!(
            "array exceeds {MAX} members"
        )));
    }
    Ok(values)
}
