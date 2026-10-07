use crate::output::report_error;
use providence_core::codecs::decode_option_labels;
use providence_core::codecs::decode_shops;
use providence_core::codecs::decode_treasures;
use providence_core::codecs::encode_option_labels;
use providence_core::codecs::encode_shops;
use providence_core::codecs::encode_treasures;
use serde_json::json;
use std::fs;
use std::process::ExitCode;

pub(crate) fn inspect_treasure_catalog(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Data TD: {error}")),
    };
    let decoded = decode_treasures(&bytes);
    let exact =
        encode_treasures(&decoded.records, Some(&bytes)).is_ok_and(|encoded| encoded == bytes);
    let positive_item_slots = decoded
        .records
        .iter()
        .flat_map(|record| record.item_ids.iter())
        .filter(|item_id| **item_id > 0)
        .count();
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "path": path,
            "bytes": bytes.len(),
            "records": decoded.records.len(),
            "trailingBytes": decoded.trailing_bytes.len(),
            "positiveItemSlots": positive_item_slots,
            "exactRoundTrip": exact
        }))
        .expect("treasure catalog report serializes")
    );
    if exact {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

pub(crate) fn inspect_shop_catalog(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Data SD: {error}")),
    };
    let decoded = decode_shops(&bytes);
    let exact = encode_shops(&decoded.records, Some(&bytes)).is_ok_and(|encoded| encoded == bytes);
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "path": path,
            "bytes": bytes.len(),
            "records": decoded.records.len(),
            "quarantinedRecords": decoded.quarantined_records.len(),
            "trailingBytes": decoded.trailing_bytes.len(),
            "exactRoundTrip": exact
        }))
        .expect("shop catalog report serializes")
    );
    if exact {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

pub(crate) fn inspect_option_label_catalog(path: &str) -> ExitCode {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return report_error(format!("could not read Data OD: {error}")),
    };
    let decoded = decode_option_labels(&bytes);
    let exact =
        encode_option_labels(&decoded.records, Some(&bytes)).is_ok_and(|encoded| encoded == bytes);
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "path": path,
            "bytes": bytes.len(),
            "records": decoded.records.len(),
            "trailingBytes": decoded.trailing_bytes.len(),
            "exactRoundTrip": exact
        }))
        .expect("option-label catalog report serializes")
    );
    if exact {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
