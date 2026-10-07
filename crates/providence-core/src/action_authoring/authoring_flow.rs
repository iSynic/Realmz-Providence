//! Author questions follow their dependencies; Classic word indices remain storage authority.

use super::DescribedActionField;

const FIELD_ORDERS: &[(&[i16], &[&str])] = &[
    (
        &[2],
        &[
            "battleHigh",
            "battleLow",
            "message",
            "revivePartyFlag",
            "soundOrReviveLossMacro",
        ],
    ),
    (
        &[3],
        &[
            "promptA",
            "promptB",
            "replyPolarity",
            "branchMode",
            "branchTarget",
        ],
    ),
    (
        &[7],
        &[
            "levelOrCache",
            "levelKind",
            "targetRecord",
            "resultSlot",
            "macro",
        ],
    ),
    (
        &[12],
        &[
            "isDungeon",
            "level",
            "xOrDungeonY",
            "yOrDungeonX",
            "tileValue",
        ],
    ),
    (
        &[22],
        &[
            "item",
            "mode",
            "maxMatches",
            "chargeDelta",
            "replacementItem",
        ],
    ),
    (
        &[30],
        &[
            "attributeFlag",
            "signedAbilityOrAttribute",
            "sourceSet",
            "adjustment",
        ],
    ),
    (
        &[31],
        &[
            "attributeFlag",
            "abilityOrAttribute",
            "adjustment",
            "successMacro",
            "failureMacro",
        ],
    ),
    (
        &[40],
        &["condition", "expectedState", "branchMode", "branchTarget"],
    ),
    (
        &[48, 56, 107],
        &[
            "battleHigh",
            "battleLow",
            "message",
            "sound",
            "treasure",
            "cowardMacro",
        ],
    ),
    (&[57], &["targetLandLevel", "landlook", "isDark"]),
    (
        &[67],
        &[
            "item",
            "minimumCharges",
            "branchMode",
            "successTarget",
            "failureTarget",
        ],
    ),
    (
        &[74],
        &[
            "signedRollCount",
            "playSound",
            "lowOrSound",
            "high",
            "message",
        ],
    ),
    (
        &[76],
        &["quest", "delta", "threshold", "branchMode", "target"],
    ),
    (&[90], &["scope", "amount"]),
    (
        &[92],
        &[
            "isDungeon",
            "level",
            "rect",
            "shapeMode",
            "shapeX1",
            "shapeY1",
            "shapeX2",
            "shapeY2",
            "shapeFlags",
            "percentDelta",
        ],
    ),
];

pub(super) fn order(opcode: i16, fields: &mut [DescribedActionField]) {
    let keys = FIELD_ORDERS
        .iter()
        .find(|(opcodes, _)| opcodes.contains(&opcode))
        .map_or(&[][..], |(_, keys)| *keys);
    fields.sort_by_key(|field| {
        keys.iter()
            .position(|key| *key == field.key)
            .unwrap_or(keys.len())
    });
}

pub(super) fn title(opcode: i16, form: Option<&str>, fallback: &str) -> String {
    match (opcode, form) {
        (2, _) => "Battle Setup".into(),
        (3, _) => "Choice Dialog".into(),
        (7, _) => "Action Code Replacement".into(),
        (19, _) => "Message Range".into(),
        (20 | 45, _) => "Movement".into(),
        (92, _) => "Random Area Shape".into(),
        (_, Some(_)) => fallback.into(),
        _ => format!("{fallback} Argument"),
    }
}
