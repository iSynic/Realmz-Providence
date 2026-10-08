use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RelationshipKind {
    Call,
    StateCheck,
    StateChange,
    Reference,
    Eligibility,
}

impl RelationshipKind {
    pub(super) fn for_target(kind: &str) -> Self {
        match kind {
            "action-point"
            | "extra-action-point"
            | "simple-encounter"
            | "complex-encounter"
            | "rogue-encounter"
            | "scenario-program"
            | "simple-encounter-result"
            | "complex-encounter-result" => Self::Call,
            _ => Self::Reference,
        }
    }

    pub(super) fn for_action(opcode: Option<i16>, kind: &str) -> Self {
        match (opcode, kind) {
            (Some(13), "action-point") | (Some(54), "timed-encounter") => Self::StateChange,
            _ => Self::for_target(kind),
        }
    }
}
