//! Transient instruction queries mirror the native forms; signed words stay canonical.
use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    let query = match method {
        "action-form.describe" => form_query(),
        "action-target.list" => object(
            json!({"kind":target_kind(),"search":text(4096),"cursor":nullable(text(512)),
                "limit":integer(1,128),"context":target_context()}),
            &["search", "cursor", "context"],
        ),
        "action-form.shared-impact" => object(
            json!({"expectedRevision":integer(0,i64::MAX),"source":identity(),
                "steps":array(scripts::step(false),0,32),"offset":integer(0,i64::MAX),"limit":integer(1,128)}),
            &["offset", "limit"],
        ),
        _ => return vec![],
    };
    vec![("query", query)]
}

fn form_query() -> Value {
    let authoring = object(
        json!({"modes":words(),"selections":words()}),
        &["modes", "selections"],
    );
    let context = object(
        json!({"targetContext":target_context(),"scriptKind":nullable(choices(&[
            "action-point","extra-action-point","simple-encounter","complex-encounter"])),
            "encounterIdentity":nullable(identity()),"encounterResultIndex":nullable(integer(0,3)),
            "encounterStepIndex":nullable(integer(0,7)),"authoring":authoring}),
        &[
            "targetContext",
            "scriptKind",
            "encounterIdentity",
            "encounterResultIndex",
            "encounterStepIndex",
            "authoring",
        ],
    );
    object(
        json!({"actionIdentity":identity(),"targetNativeId":integer(-32768,32767),
            "values":words(),"secondaryValues":words(),"context":context}),
        &["targetNativeId", "values", "secondaryValues", "context"],
    )
}

fn words() -> Value {
    json!({"type":"object","maxProperties":64,"additionalProperties":integer(-32768,32767)})
}

fn target_context() -> Value {
    object(
        json!({"mapIdentity":nullable(identity()),"levelType":nullable(choices(&["land","dungeon"]))}),
        &["mapIdentity", "levelType"],
    )
}

fn target_kind() -> Value {
    choices(&[
        "message",
        "option-label",
        "quest",
        "battle",
        "treasure",
        "item",
        "shop",
        "simple-encounter",
        "complex-encounter",
        "rogue-encounter",
        "timed-encounter",
        "extra-action-point",
        "same-map-action-point",
        "sound",
        "picture",
        "monster",
        "monster-appearance",
        "monster-name-tag",
        "map",
        "map-tile",
        "player-map",
        "random-rectangle",
        "text-resource",
        "spell",
        "race",
        "caste",
    ])
}

#[cfg(test)]
mod tests;
