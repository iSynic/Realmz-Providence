use super::{bounded_vec, required_nullable};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SafeExpression {
    Literal {
        value: Value,
    },
    Variable {
        scope: VariableScope,
        #[serde(deserialize_with = "required_nullable")]
        state_scope: Option<String>,
        #[serde(deserialize_with = "required_nullable")]
        owner_id: Option<String>,
        name: String,
    },
    Array {
        #[serde(deserialize_with = "bounded_vec::<_, _, 256>")]
        values: Vec<SafeExpression>,
    },
    Record {
        fields: BTreeMap<String, SafeExpression>,
    },
    Unary {
        operator: UnaryOperator,
        operand: Box<SafeExpression>,
    },
    Binary {
        operator: BinaryOperator,
        left: Box<SafeExpression>,
        right: Box<SafeExpression>,
    },
    Member {
        object: Box<SafeExpression>,
        member: String,
    },
    Collection {
        operation: CollectionOperation,
        collection: Box<SafeExpression>,
        #[serde(deserialize_with = "required_nullable")]
        item_name: Option<String>,
        #[serde(deserialize_with = "required_nullable")]
        predicate: Option<Box<SafeExpression>>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VariableScope {
    Parameter,
    Local,
    Persistent,
    Context,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UnaryOperator {
    #[serde(rename = "not")]
    Not,
    #[serde(rename = "-")]
    Negate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum BinaryOperator {
    #[serde(rename = "==")]
    Equal,
    #[serde(rename = "!=")]
    NotEqual,
    #[serde(rename = "<")]
    Less,
    #[serde(rename = "<=")]
    LessOrEqual,
    #[serde(rename = ">")]
    Greater,
    #[serde(rename = ">=")]
    GreaterOrEqual,
    #[serde(rename = "+")]
    Add,
    #[serde(rename = "-")]
    Subtract,
    #[serde(rename = "*")]
    Multiply,
    #[serde(rename = "/")]
    Divide,
    #[serde(rename = "and")]
    And,
    #[serde(rename = "or")]
    Or,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CollectionOperation {
    Count,
    Any,
    All,
    First,
}
