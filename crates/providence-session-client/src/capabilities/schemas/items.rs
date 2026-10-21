//! Item forms expose owned definitions and native allocation/copy guards only.
use super::*;

pub(super) fn fields(method: &str) -> Vec<(&'static str, Value)> {
    match method {
        "item.list" => vec![
            ("scope", choices(&["all", "standard", "scenario"])),
            (
                "category",
                choices(&["all", "weapon", "armor", "accessory", "magic", "supply"]),
            ),
        ],
        "item.allocation.review" => vec![
            ("destinationRecordIndex", integer(100, 199)),
            ("copySource", nullable(copy_source())),
        ],
        "item.clear.review" => vec![("recordIndex", integer(0, 199))],
        "item.draft.prepare" | "item.draft.apply" => vec![(
            "draft",
            object(
                json!({
                    "recordIndex":integer(0,199),"definition":definition(),
                    "allocation":nullable(object(json!({
                        "recordIndex":integer(100,199),"destinationHash":identity()
                    }),&[])),"copySource":nullable(copy_source())
                }),
                &["copySource"],
            ),
        )],
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

fn definition() -> Value {
    let mut fields = json!({
        "id":identity(),"classicId":integer(800,999),
        "name":text(255),"unidentifiedName":text(255),"description":text(255),
        "cursedItemId":nullable(identity()),"specificRaceId":nullable(identity()),
        "specificCasteId":nullable(identity()),"magical":{"type":"boolean"},
        "dropOnEmpty":{"type":"boolean"},"special":array(integer(i32::MIN.into(),i32::MAX.into()),5,5)
    });
    // The native codec checks each field's narrower representability and meaning.
    for field in [
        "iconId",
        "itemType",
        "strengthBonus",
        "blunt",
        "hands",
        "luckBonus",
        "movementBonus",
        "armorBonus",
        "magicResistanceBonus",
        "damageBonus",
        "spellPointBonus",
        "soundId",
        "weight",
        "cost",
        "initialCharges",
        "itemCategoryMaskLow",
        "itemCategoryMaskHigh",
        "raceRestrictions",
        "casteRestrictions",
        "raceClassOnly",
        "casteClassOnly",
        "versusSmall",
        "versusLarge",
        "heat",
        "cold",
        "electric",
        "versusUndead",
        "versusDemonDevil",
        "versusEvil",
        "weightPerCharge",
    ] {
        fields[field] = integer(i32::MIN.into(), i32::MAX.into());
    }
    object(fields, &[])
}
