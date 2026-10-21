use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    if !method.starts_with("action-settings.") {
        return vec![];
    }
    let mut fields = if method == "action-settings.prepare-repair" {
        vec![("slot", integer(0, 31))]
    } else {
        vec![("draft", draft())]
    };
    if method == "action-settings.change-repair" {
        fields.push((
            "field",
            choices(&[
                "scope",
                "mapKind",
                "map",
                "area",
                "chanceAdjustment",
                "shapeMode",
                "bound0",
                "bound1",
                "bound2",
                "bound3",
                "firstMessage",
                "lastMessage",
            ]),
        ));
        fields.push(("value", text(512)));
    } else if matches!(
        method,
        "action-settings.choose-repair-message" | "action-settings.repair-choices"
    ) {
        fields.push((
            "field",
            choices(&["map", "area", "message", "firstMessage", "lastMessage"]),
        ));
    }
    if method == "action-settings.choose-repair-message" {
        fields.push(("identity", nullable(identity())));
    }
    fields
}

fn draft() -> Value {
    let message = object(
        json!({"firstMessage":text(512),"lastMessage":text(512),
        "retained":array(integer(-32768,32767),3,3)}),
        &[],
    );
    let target = object(
        json!({"identity":nullable(identity()),"index":nullable(integer(-32768,32767))}),
        &[],
    );
    let area = object(
        json!({"mapKind":text(512),"map":target,"area":target,
        "chanceAdjustment":text(512),"shapeMode":text(512),"bounds":array(text(512),4,4),
        "retainedSpare":integer(-32768,32767)}),
        &[],
    );
    json!({"oneOf":[family(message),family(area)]})
}

fn family(input: Value) -> Value {
    object(
        json!({"project":identity(),"source":identity(),"slot":integer(0,31),
        "revision":integer(0,i64::MAX),"originalAction":object(json!({"slot":integer(0,31),
            "rawOpcode":integer(-32768,32767),"targetNativeId":integer(-32768,32767)}), &[]),
        "contextFingerprint":text(128),"initialInput":input,"input":input,
        "scope":choices(&["only-this-action","confirmed-actions","shared-actions"]),
        "modeChanged":{"type":"boolean"},"originalUseCount":integer(0,i64::MAX),
        "confirmedCallers":array(object(json!({"source":identity(),"slot":integer(0,31)}),&[]),0,128)}),
        &["confirmedCallers"],
    )
}
