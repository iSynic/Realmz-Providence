use super::{bounded_vec, expressions::SafeExpression, required_nullable};
use providence_core::model::StableId;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, num::NonZeroU64};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SafeScenarioAction {
    pub id: StableId,
    pub name: String,
    pub description: String,
    pub visibility: ActionVisibility,
    pub category: Value,
    pub abi_version: NonZeroU64,
    pub implementation_version: NonZeroU64,
    pub state_schema_version: NonZeroU64,
    #[serde(deserialize_with = "bounded_vec::<_, _, 256>")]
    pub parameters: Vec<Value>,
    pub return_type: Value,
    pub allowed_contexts: Vec<Value>,
    pub required_capabilities: Vec<String>,
    pub persistent_state: Value,
    pub backend: SafeBackend,
    pub program: SafeArchiveProgram,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionVisibility {
    Public,
    Private,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SafeBackend {
    #[serde(rename = "safe")]
    Safe,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SafeArchiveProgram {
    pub format: SafeBytecodeFormat,
    #[serde(deserialize_with = "bounded_vec::<_, _, 4096>")]
    pub instructions: Vec<SafeArchiveInstruction>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SafeBytecodeFormat {
    #[serde(rename = "realmz.safe-bytecode.v1")]
    V1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SafeArchiveInstruction {
    Operation {
        capability: String,
        arguments: BTreeMap<String, SafeExpression>,
        #[serde(deserialize_with = "required_nullable")]
        result: Option<String>,
    },
    CallScenarioAction {
        action_id: StableId,
        arguments: BTreeMap<String, SafeExpression>,
        #[serde(deserialize_with = "required_nullable")]
        result: Option<String>,
    },
    SetValue {
        scope: AssignmentScope,
        #[serde(deserialize_with = "required_nullable")]
        state_scope: Option<String>,
        #[serde(deserialize_with = "required_nullable")]
        owner_id: Option<String>,
        name: String,
        value: SafeExpression,
    },
    JumpIfFalse {
        condition: SafeExpression,
        #[serde(deserialize_with = "instruction_target")]
        target: u16,
    },
    Jump {
        #[serde(deserialize_with = "instruction_target")]
        target: u16,
    },
    BeginForEach {
        item_name: String,
        collection: SafeExpression,
        #[serde(deserialize_with = "instruction_target")]
        end_target: u16,
    },
    NextForEach {
        #[serde(deserialize_with = "instruction_target")]
        begin_target: u16,
    },
    Return {
        #[serde(deserialize_with = "required_nullable")]
        value: Option<SafeExpression>,
    },
    Halt {
        outcome: Value,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssignmentScope {
    Local,
    Persistent,
}

fn instruction_target<'de, D: Deserializer<'de>>(deserializer: D) -> Result<u16, D::Error> {
    let target = u16::deserialize(deserializer)?;
    if target > 4096 {
        return Err(serde::de::Error::custom("instruction target exceeds 4096"));
    }
    Ok(target)
}
