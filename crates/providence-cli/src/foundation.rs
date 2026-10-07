use providence_core::codecs::NativeFileFamily;
use providence_core::codecs::descriptor;
use providence_core::codecs::validate_registry;
use serde_json::json;
use std::process::ExitCode;

pub(crate) fn verify_foundation() -> ExitCode {
    if let Err(message) = validate_registry() {
        eprintln!("foundation invalid: {message}");
        return ExitCode::FAILURE;
    }

    let first_codec = descriptor(NativeFileFamily::ScenarioMessages);
    let report = json!({
        "core": "providence-core",
        "ui": "native-godot-candidate",
        "firstCodec": {
            "family": first_codec.family,
            "nativePath": first_codec.native_path,
            "recordBytes": first_codec.record_bytes,
            "ownedBytes": first_codec.owned_byte_ranges
        }
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("foundation report is serializable")
    );
    ExitCode::SUCCESS
}
