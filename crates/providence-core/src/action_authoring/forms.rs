use super::{
    ActionFormDefinition, ActionFormField, DONOR_COMMIT, EXTRA_CODE_ROW_BYTES, FormControl,
    FormProvenance, FormRow,
};

struct FormSeed {
    identity: &'static str,
    fields: [&'static str; 5],
}

const fn form(identity: &'static str, fields: [&'static str; 5]) -> FormSeed {
    FormSeed { identity, fields }
}

pub(super) fn definitions() -> Vec<ActionFormDefinition> {
    FORMS.iter().map(definition).collect()
}

fn definition(seed: &FormSeed) -> ActionFormDefinition {
    let row = if seed.identity == "random-region-shape-details" {
        FormRow::Secondary
    } else {
        FormRow::Primary
    };
    ActionFormDefinition {
        identity: seed.identity.into(),
        fields: seed
            .fields
            .iter()
            .enumerate()
            .map(|(index, name)| field(seed.identity, row, index as u8, name))
            .collect(),
        required_rows: vec![row],
        companion_form_id: (seed.identity == "random-region-shape-mutation")
            .then(|| "random-region-shape-details".into()),
        provenance: FormProvenance {
            donor_commit: DONOR_COMMIT.into(),
            donor_paths: vec![
                "src/editor/realmzActions.ts".into(),
                "src/editor/realmzEdcd.ts".into(),
                "src/editor/generated/opcodeEdcdCrosswalk.json".into(),
                "src/editor/components/EdcdRowEditor.tsx".into(),
            ],
            native_family: "Data EDCD".into(),
            record_geometry: format!(
                "fixed {EXTRA_CODE_ROW_BYTES}-byte row containing five big-endian signed words"
            ),
            owned_bytes: if row == FormRow::Secondary {
                "paired row words 0 through 4; action 92 does not read word 4".into()
            } else {
                "primary row words 0 through 4".into()
            },
            fixture_status: "pinned donor metadata fixture and typed row round-trip tests".into(),
            confidence: if seed.identity == "unused-edcd-load" {
                "preserve-only outside the proven combat-macro context".into()
            } else {
                "donor-documented semantic layout".into()
            },
        },
    }
}

fn field(shape: &str, row: FormRow, index: u8, name: &str) -> ActionFormField {
    let preserved = matches!(
        name,
        "unused" | "unused0" | "unused1" | "unused2" | "unused3" | "unused4" | "shapeFlags"
    ) || matches!(
        (shape, index),
        ("position-shift", 0) | ("boat-camp-state", 3 | 4)
    );
    ActionFormField {
        index,
        row,
        name: name.into(),
        label: format!("Storage word {}", index + 1),
        help: format!(
            "Technical {shape} row geometry only; request action-form.describe for authoring meaning."
        ),
        control: if preserved {
            FormControl::Preserved
        } else {
            FormControl::Integer
        },
        minimum: i16::MIN,
        maximum: i16::MAX,
        signed: true,
        required: !preserved,
        preserved,
        target_kind: None,
        target_rule: None,
        choices: Vec::new(),
        byte_offset: index * 2,
        byte_length: 2,
    }
}

const FORMS: &[FormSeed] = &[
    form(
        "action-data-patching",
        [
            "levelOrCache",
            "targetRecord",
            "macro",
            "levelKind",
            "resultSlot",
        ],
    ),
    form(
        "ability-check-branch",
        [
            "abilityOrAttribute",
            "adjustment",
            "attributeFlag",
            "successMacro",
            "failureMacro",
        ],
    ),
    form(
        "ability-check-pick",
        [
            "signedAbilityOrAttribute",
            "adjustment",
            "sourceSet",
            "attributeFlag",
            "unused",
        ],
    ),
    form(
        "battle",
        [
            "battleLow",
            "battleHigh",
            "soundOrReviveLossMacro",
            "message",
            "revivePartyFlag",
        ],
    ),
    form(
        "battle-macro",
        [
            "mode",
            "roundOrPercent",
            "repeatMode",
            "macroLow",
            "macroHigh",
        ],
    ),
    form(
        "battle-outcome-branch",
        ["battleLow", "battleHigh", "cowardMacro", "sound", "message"],
    ),
    form(
        "boat-camp-state",
        [
            "mode",
            "statusValue",
            "branchModeOrBehavior",
            "targetOrValueA",
            "targetOrValueB",
        ],
    ),
    form(
        "caste-selector",
        ["exactCaste", "casteGroup", "sourceSet", "unused", "unused"],
    ),
    form(
        "character-selector",
        ["selector", "value", "sourceSet", "unused", "unused"],
    ),
    form(
        "race-caste-gender-selector",
        [
            "selector",
            "gender",
            "raceCasteOrClass",
            "unused",
            "livingOnly",
        ],
    ),
    form(
        "combat-monster-mutation",
        [
            "targetClass",
            "monsterId",
            "count",
            "replacementIcon",
            "traitorOverride",
        ],
    ),
    form(
        "condition",
        ["scope", "condition", "durationOrDelta", "sound", "unused"],
    ),
    form(
        "condition-branch",
        [
            "condition",
            "characterSelector",
            "unused",
            "trueMacro",
            "falseMacro",
        ],
    ),
    form(
        "conditional-branch",
        [
            "testSelector",
            "branchModeOrValue",
            "falseBehavior",
            "trueTarget",
            "falseTarget",
        ],
    ),
    form(
        "choice",
        [
            "replyPolarity",
            "branchMode",
            "branchTarget",
            "promptA",
            "promptB",
        ],
    ),
    form(
        "damage-heal",
        ["multiplier", "low", "high", "sound", "message"],
    ),
    form(
        "destroy-related",
        [
            "monsterId",
            "maxCount",
            "unused",
            "unused",
            "includeTraitorSide",
        ],
    ),
    form("dungeon-move", ["mode", "level", "x", "y", "signedHeading"]),
    form(
        "encounter-mutation",
        [
            "simpleEncounter",
            "oneBasedChoiceSlot",
            "unused",
            "unused",
            "unused",
        ],
    ),
    form(
        "false-true-branch",
        ["testA", "testB", "branchMode", "falseTarget", "trueTarget"],
    ),
    form("fatigue", ["mode", "unused", "percent", "unused", "unused"]),
    form("fumble", ["message", "sound", "unused", "unused", "unused"]),
    form(
        "force-branch",
        ["testA", "testB", "branchMode", "target", "slot"],
    ),
    form(
        "game-time-branch",
        [
            "dayLimit",
            "hourLimit",
            "unused",
            "successMacro",
            "failureMacro",
        ],
    ),
    form(
        "gold",
        [
            "signedAmount",
            "failureMarker",
            "branchMode",
            "target",
            "slot",
        ],
    ),
    form(
        "item-branch",
        [
            "item",
            "branchMode",
            "missingBehavior",
            "hasTarget",
            "missingTarget",
        ],
    ),
    form(
        "item-charge-branch",
        [
            "item",
            "branchMode",
            "minimumCharges",
            "successTarget",
            "failureTarget",
        ],
    ),
    form(
        "item-mutation",
        [
            "item",
            "maxMatches",
            "mode",
            "chargeDelta",
            "replacementItem",
        ],
    ),
    form(
        "party-money-state",
        ["moneyType", "pickedOnly", "unused", "unused", "unused"],
    ),
    form(
        "party-state",
        ["amount", "scope", "unused", "unused", "unused"],
    ),
    form(
        "percent-branch",
        ["percent", "successBehavior", "branchMode", "target", "slot"],
    ),
    form(
        "misc-conditional-branch",
        [
            "testSelector",
            "signedTestValue",
            "branchMode",
            "trueTarget",
            "falseTarget",
        ],
    ),
    form(
        "picked-branch",
        [
            "pickedSelector",
            "failureBehavior",
            "unused",
            "successMacro",
            "failureTarget",
        ],
    ),
    form(
        "position-shift",
        ["legacyLevel", "xShift", "yShift", "randomize", "unused"],
    ),
    form(
        "party-condition-branch",
        [
            "expectedState",
            "branchMode",
            "branchTarget",
            "condition",
            "unused",
        ],
    ),
    form(
        "quest-value",
        ["quest", "delta", "branchMode", "threshold", "target"],
    ),
    form(
        "random-branch",
        ["branchMode", "rangeLow", "rangeHigh", "sound", "message"],
    ),
    form(
        "random-items",
        [
            "countOrRandomLimit",
            "itemLow",
            "itemHigh",
            "unused",
            "unused",
        ],
    ),
    form(
        "random-message",
        ["messageLow", "messageHigh", "unused", "unused", "unused"],
    ),
    form(
        "random-region-mutation",
        [
            "level",
            "randomRegion",
            "percent",
            "battleLowOrKeep",
            "battleHighOrKeep",
        ],
    ),
    form(
        "random-region-shape-mutation",
        ["level", "rect", "isDungeon", "percentDelta", "shapeMode"],
    ),
    form(
        "random-region-shape-details",
        ["shapeX1", "shapeY1", "shapeX2", "shapeY2", "shapeFlags"],
    ),
    form(
        "range-branch",
        ["testA", "testB", "falseBehavior", "branchMode", "target"],
    ),
    form(
        "render-mutation",
        ["landlook", "isDark", "targetLandLevel", "unused", "unused"],
    ),
    form(
        "improved-selective-battle",
        ["battleLow", "battleHigh", "sound", "message", "cowardMacro"],
    ),
    form(
        "restricted-shop",
        ["shop", "range1Low", "range1High", "range2Low", "range2High"],
    ),
    form(
        "shop-mutation",
        ["shop", "inflationDelta", "item", "stockDelta", "unused"],
    ),
    form(
        "dark-level-state",
        [
            "darkStatePlusOne",
            "stopIfAlready",
            "unused",
            "unused",
            "unused",
        ],
    ),
    form(
        "rout",
        ["monster1", "monster2", "monster3", "monster4", "monster5"],
    ),
    form(
        "save-restore-position",
        ["mode", "unused", "unused", "unused", "unused"],
    ),
    form(
        "selected-character-state",
        ["statSelector", "delta", "unused", "unused", "unused"],
    ),
    form(
        "selective-battle",
        ["battleLow", "battleHigh", "sound", "message", "treasure"],
    ),
    form(
        "spawn",
        [
            "unused",
            "monster",
            "countOrRandomLimit",
            "sound",
            "traitorOverride",
        ],
    ),
    form(
        "spell-cast",
        ["spell", "powerLevel", "saveAdjust", "forceAffect", "unused"],
    ),
    form(
        "spell-flags",
        [
            "spellcasting",
            "monstercasting",
            "spellcharging",
            "unused",
            "unused",
        ],
    ),
    form(
        "spell-points",
        [
            "signedRollCount",
            "lowOrSound",
            "high",
            "playSound",
            "message",
        ],
    ),
    form(
        "teleport",
        ["levelOrKeep", "xOrKeep", "yOrKeep", "sound", "message"],
    ),
    form(
        "tile-mutation",
        [
            "level",
            "xOrDungeonY",
            "yOrDungeonX",
            "tileValue",
            "isDungeon",
        ],
    ),
    form(
        "time-mutation",
        [
            "mode",
            "dayOrDelta",
            "hourOrDelta",
            "minuteOrDelta",
            "unused",
        ],
    ),
    form(
        "timed-encounter-mutation",
        [
            "timedEncounter",
            "percentOrKeep",
            "incrementOrKeep",
            "resetDayFlag",
            "dayOffsetOrKeep",
        ],
    ),
    form(
        "trigger-mutation",
        [
            "level",
            "singleTrigger",
            "percent",
            "rangeStartWithSign",
            "rangeEnd",
        ],
    ),
    form(
        "unused-edcd-load",
        ["unused0", "unused1", "unused2", "unused3", "unused4"],
    ),
];
