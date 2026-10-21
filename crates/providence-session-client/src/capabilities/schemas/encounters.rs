use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "encounter.apply-rogue-draft" => vec![("draft", rogue())],
        "encounter.apply-timed-draft" => vec![("draft", timed())],
        "encounter.prepare-create" => vec![("kind", choices(&["rogue", "timed"]))],
        _ => vec![],
    }
}
fn rogue() -> Value {
    let mut properties = json!({"identity":identity(),"nativeId":integer(0,u32::MAX.into()),
        "typeFlags":array(json!({"type":"boolean"}),10,10),"modifiers":array(integer(-128,127),8,8),
        "successCodes":array(integer(-128,127),8,8),"failureCodes":array(integer(-128,127),8,8),
        "authored":{"type":"boolean"}});
    for field in [
        "successText",
        "failureText",
        "successSounds",
        "failureSounds",
    ] {
        properties[field] = array(integer(-32768, 32767), 8, 8);
    }
    for field in ["spell", "lowDamage", "highDamage", "tumblers"] {
        properties[field] = integer(-32768, 32767);
    }
    for field in ["prompts", "promptSounds"] {
        properties[field] = array(integer(-32768, 32767), 3, 3);
    }
    object(properties, &["authored"])
}
fn timed() -> Value {
    let mut properties = json!({"identity":identity(),"nativeId":integer(0,u32::MAX.into()),
        "locationKind":choices(&["any","land","dungeon"]),"authored":{"type":"boolean"}});
    for field in [
        "day",
        "increment",
        "percent",
        "door",
        "requiredLevel",
        "requiredRandomRect",
        "requiredX",
        "requiredY",
        "requiredItem",
        "requiredQuest",
    ] {
        properties[field] = integer(-32768, 32767);
    }
    object(properties, &["authored"])
}
