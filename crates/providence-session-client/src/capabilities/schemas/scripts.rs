use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    let field = match method {
        "extra-action-point.create" | "extra-action-point.duplicate" => {
            Some(("nativeId", integer(0, 32767)))
        }
        "action-point.step.apply" | "extra-action-point.step.apply" => Some(("edit", step(true))),
        "action-point.apply-draft" => Some(("draft", placed_draft())),
        "extra-action-point.apply-draft" => Some(("draft", xap_draft())),
        "encounter.apply-simple-draft" => Some(("draft", simple_draft())),
        "encounter.apply-complex-draft" => Some(("draft", complex_draft())),
        _ => None,
    };
    field.into_iter().collect()
}
fn settings() -> Value {
    let values =
        json!({"type":"object","maxProperties":64,"additionalProperties":integer(-32768,32767)});
    let caller = object(json!({"source":identity(),"slot":integer(0,31)}), &[]);
    let scope = json!({"oneOf":[
        object(json!({"mode":choices(&["preserve-references","isolate"])}), &[]),
        object(json!({"mode":choices(&["update-affected"]),"confirmedCallers":array(caller,1,128)}), &[])
    ]});
    object(
        json!({"values":values,"secondaryValues":nullable(values.clone()),"scope":scope,"allowSharedUpdates":{"type":"boolean"}}),
        &["secondaryValues", "scope", "allowSharedUpdates"],
    )
}
pub(super) fn step(with_source: bool) -> Value {
    let mut properties = json!({"slot":integer(0,31),"actionIdentity":identity(),"gosub":{"type":"boolean"},
        "targetNativeId":integer(-32768,32767),"settings":nullable(settings())});
    if with_source {
        properties["source"] = identity();
    }
    let mut schema = object(properties, &["gosub", "settings"]);
    if !with_source {
        schema["required"]
            .as_array_mut()
            .unwrap()
            .retain(|key| key != "targetNativeId");
        schema["properties"]["settings"] = nullable(draft_settings());
    }
    schema
}
fn draft_settings() -> Value {
    let mut schema = settings();
    schema["properties"]
        .as_object_mut()
        .unwrap()
        .remove("allowSharedUpdates");
    schema
}
fn placed_draft() -> Value {
    let mut header = header();
    header["properties"]["coordinate"] = nullable(coordinate());
    header["required"]
        .as_array_mut()
        .unwrap()
        .push(json!("coordinate"));
    object(
        json!({"source":identity(),"descriptor":text(4096),"header":header,
        "entryMarker":{"type":["boolean","null"]},"steps":array(step(false),0,8)}),
        &["descriptor", "entryMarker"],
    )
}
fn xap_draft() -> Value {
    let mut header = header();
    header["properties"]["classicDoorId"] = integer(i32::MIN.into(), i32::MAX.into());
    header["required"]
        .as_array_mut()
        .unwrap()
        .push(json!("classicDoorId"));
    object(
        json!({"source":identity(),"descriptor":text(4096),"header":header,"steps":array(step(false),0,8)}),
        &["descriptor"],
    )
}
fn header() -> Value {
    object(
        json!({"postActionLevel":integer(0,255),"postActionX":integer(0,255),
        "postActionY":integer(0,255),"chancePercent":integer(-128,127)}),
        &[],
    )
}
fn encounter_base() -> Value {
    json!({"source":identity(),"nativeId":integer(0,32767),"promptMessageNativeId":integer(-32768,32767),
        "canBackOut":{"type":"boolean"},"maxTimes":integer(-128,127),"casteSuccess":integer(-128,127),
        "steps":array(step(false),0,32)})
}
fn simple_draft() -> Value {
    let mut properties = encounter_base();
    properties["texts"] = array(text(79), 4, 4);
    properties["choiceResults"] = array(integer(-128, 127), 4, 4);
    object(properties, &[])
}
fn complex_draft() -> Value {
    let mut properties = encounter_base();
    for field in ["actionResult", "wordResult", "thiefSuccess", "thiefFail"] {
        properties[field] = integer(-128, 127);
    }
    for (field, count, item) in [
        ("groups", 8, integer(-128, 127)),
        ("spellIds", 10, integer(-32768, 32767)),
        ("spellResults", 10, integer(-128, 127)),
        ("itemIds", 5, integer(-32768, 32767)),
        ("itemResults", 5, integer(-128, 127)),
        ("texts", 9, text(39)),
    ] {
        properties[field] = array(item, count, count);
    }
    properties["thief"] = json!({"type":"boolean"});
    object(properties, &[])
}
