use super::{SHOP_CATEGORY_SIZE, SHOP_ITEM_SLOTS, SHOP_RECORD_BYTES};
use crate::model::NativeRecordId;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuarantinedShopRecord {
    pub native_id: NativeRecordId,
    pub reason: &'static str,
}

// Native category terminators determine which words are inventory. Quantities,
// inflation and unused words cannot independently establish a foreign payload.
pub(super) fn classify(bytes: &[u8]) -> Vec<QuarantinedShopRecord> {
    let certified = super::certified_shop_extent(bytes);
    let mut excluded = Vec::new();
    let mut following_suspect = false;
    for (index, row) in bytes.chunks_exact(SHOP_RECORD_BYTES).enumerate() {
        let shape = shape(row);
        let reason = if certified.is_some_and(|extent| index >= extent.authored_records) {
            Some("Source-identified payload beyond the native Shop table")
        } else if certified.is_some() {
            None
        } else if shape.invalid > 1 && shape.invalid_categories == shape.nonempty_categories {
            Some("Every populated category contains an item outside the native 1–999 range")
        } else if following_suspect && !shape.coherent_inventory {
            Some("Unverified data following structurally invalid Shop records")
        } else {
            None
        };
        if let Some(reason) = reason {
            following_suspect = true;
            excluded.push(QuarantinedShopRecord {
                native_id: NativeRecordId(index as u32),
                reason,
            });
        } else if shape.coherent_inventory {
            following_suspect = false;
        }
    }
    excluded
}

#[derive(Default)]
struct Shape {
    invalid: usize,
    invalid_categories: usize,
    nonempty_categories: usize,
    coherent_inventory: bool,
}

fn shape(row: &[u8]) -> Shape {
    let mut shape = Shape::default();
    let mut populated = 0;
    for start in (0..SHOP_ITEM_SLOTS).step_by(SHOP_CATEGORY_SIZE) {
        let mut category_populated = false;
        let mut category_invalid = false;
        for slot in start..start + SHOP_CATEGORY_SIZE {
            let id = super::read_i16(row, slot * 2);
            if id < 0 {
                break;
            }
            if id == 0 {
                continue;
            }
            populated += 1;
            category_populated = true;
            if id > 999 {
                shape.invalid += 1;
                category_invalid = true;
            }
        }
        shape.nonempty_categories += usize::from(category_populated);
        shape.invalid_categories += usize::from(category_invalid);
    }
    // A later record is a positive extension witness only when its complete
    // item table has native values. Ambiguous residue stays available as source.
    shape.coherent_inventory =
        populated > 0 && (0..SHOP_ITEM_SLOTS).all(|slot| super::read_i16(row, slot * 2) <= 999);
    shape
}
