//! Custom spell identity, allocation and copy provenance follow the native forms.
use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "spell.catalog" => vec![("class", integer(0, 5)), ("level", integer(0, 7))],
        "spell.allocation.review" => vec![
            ("destinationRecordIndex", integer(0, 104)),
            ("copySource", copy_source()),
        ],
        "spell.clear.review" => vec![("recordIndex", integer(0, 104))],
        "spell.draft.prepare" | "spell.draft.apply" => vec![("draft", draft())],
        "spell.update" => vec![
            ("recordIndex", integer(0, 104)),
            ("definition", definition()),
        ],
        _ => vec![],
    }
}

fn copy_source() -> Value {
    object(
        json!({"identity":identity(),"scope":choices(&["standard","scenario"]),
        "catalogFingerprint":identity(),"definitionHash":identity()}),
        &[],
    )
}

fn draft() -> Value {
    object(
        json!({"recordIndex":integer(0,104),"definition":definition(),
        "allocation":nullable(object(json!({"recordIndex":integer(0,104),"destinationHash":identity()}),&[])),
        "copySource":nullable(copy_source())}),
        &["allocation", "copySource"],
    )
}

fn definition() -> Value {
    let mut properties = json!({"id":identity(),"classicId":integer(5101,5715),
        "recordIndex":integer(0,104),"name":text(255),"description":text(4096),
        "inCombat":{"type":"boolean"},"inCamp":{"type":"boolean"},"authored":{"type":"boolean"}});
    for field in [
        "rangeMin",
        "rangeMax",
        "queueIcon",
        "fixedTargetCount",
        "canRotate",
        "cannot",
        "cost",
        "damageMin",
        "damageMax",
        "powerDamageMin",
        "powerDamageMax",
        "durationMin",
        "durationMax",
        "powerDurationMin",
        "powerDurationMax",
        "lookStart",
        "lookEnd",
        "soundStart",
        "soundEnd",
        "targetType",
        "size",
        "special",
        "damageType",
        "spellClass",
    ] {
        properties[field] = integer(0, 255);
    }
    for field in ["toHitBonus", "saveBonus", "saveAdjust", "resistanceAdjust"] {
        properties[field] = integer(-128, 127);
    }
    object(properties, &["name", "description", "authored"])
}
