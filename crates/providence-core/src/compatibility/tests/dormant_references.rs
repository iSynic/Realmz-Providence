use crate::compatibility::{CompatibilityBlocker, finding_groups::deferred};
use crate::model::StableId;
use crate::rebuilt::{RebuiltV3DeferredDisposition as Disposition, RebuiltV3DeferredReference};

fn warnings() -> Vec<CompatibilityBlocker> {
    let references = [
        (
            "classic.shop.1",
            "stock[0].itemId",
            "8224",
            Disposition::Deferred,
        ),
        (
            "classic.shop.3",
            "stock[0].itemId",
            "8224",
            Disposition::Dormant,
        ),
        (
            "classic.shop.3",
            "stock[1].itemId",
            "16236",
            Disposition::Dormant,
        ),
        (
            "classic.shop.4",
            "stock[600].itemId",
            "28524",
            Disposition::Dormant,
        ),
        (
            "classic.treasure.9",
            "itemIds[2]",
            "30000",
            Disposition::Dormant,
        ),
    ]
    .map(
        |(source, field, target, disposition)| RebuiltV3DeferredReference {
            source: StableId(source.into()),
            field: field.into(),
            target_kind: "item".into(),
            target_id: target.into(),
            reason: "the referenced Classic runtime definition is unavailable".into(),
            disposition,
        },
    );
    deferred(&references)
}

#[test]
fn dormant_stock_is_summarized_per_file_while_reached_stock_stays_per_slot() {
    let warnings = warnings();
    let messages = |code: &str| {
        warnings
            .iter()
            .filter(|warning| warning.code == code)
            .map(|warning| warning.message.as_str())
            .collect::<Vec<_>>()
    };
    assert_eq!(
        messages("rebuilt.deferred-reference"),
        [
            "classic.shop.1 · stock[0].itemId: 1 unavailable item references (8224). the referenced Classic runtime definition is unavailable"
        ]
    );
    assert_eq!(
        messages("rebuilt.dormant-reference"),
        [
            "Data SD · 2 shops that no reachable program opens hold 3 item slots naming no available Classic item (8224, 16236, 28524). The bytes are preserved unchanged; once a program opens a shop, its slots are reported individually.",
            "Data TD · 1 treasure that no reachable program awards holds 1 item slot naming no available Classic item (30000). The bytes are preserved unchanged; once a program awards a treasure, its slots are reported individually.",
        ]
    );
}

#[test]
fn dormant_summary_keeps_every_slot_as_a_group_member() {
    let warnings = warnings();
    let shops = warnings
        .iter()
        .find(|warning| warning.message.starts_with("Data SD"))
        .and_then(|warning| warning.group.as_ref())
        .unwrap();
    assert_eq!(shops.occurrence_count, 3);
    assert_eq!(
        shops
            .members
            .iter()
            .map(|member| (member.field.as_str(), member.target_id.as_str()))
            .collect::<Vec<_>>(),
        [
            ("classic.shop.3 · stock[0].itemId", "8224"),
            ("classic.shop.3 · stock[1].itemId", "16236"),
            ("classic.shop.4 · stock[600].itemId", "28524"),
        ]
    );
}
