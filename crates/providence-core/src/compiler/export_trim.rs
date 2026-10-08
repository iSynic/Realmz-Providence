//! Optional export derivation; portable truth and retained source remain untouched.
use super::NativeManifest;
use crate::{
    codecs::NativeFileFamily,
    model::{ProjectOrigin, ProjectSnapshot},
};
use serde::Serialize;

// Castle 491816ad misc.c::loadextracode takes a signed short. Keep one additional
// row conservatively for opcode 92's companion; never compact interior gaps.
pub const RETAINED_EXTRA_CODE_BYTES: usize = 32_769 * 10;

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrimPreview {
    pub native_path: &'static str,
    pub removable_bytes: usize,
    pub retained_bytes: usize,
    pub reason: &'static str,
}

pub fn preview(
    snapshot: &ProjectSnapshot,
    manifest: &NativeManifest,
    original: Option<&[u8]>,
) -> TrimPreview {
    let mut result = TrimPreview {
        native_path: "Data EDCD",
        ..Default::default()
    };
    let Some(entry) = manifest.get("Data EDCD") else {
        return result;
    };
    result.retained_bytes = entry.bytes.len();
    if entry.bytes.len() <= RETAINED_EXTRA_CODE_BYTES {
        return result;
    }
    if !matches!(snapshot.origin, ProjectOrigin::Imported { .. }) {
        result.reason = "Only retained imported data can be trimmed.";
    } else if original.is_none_or(|bytes| {
        bytes.len() != entry.bytes.len()
            || bytes[RETAINED_EXTRA_CODE_BYTES..] != entry.bytes[RETAINED_EXTRA_CODE_BYTES..]
    }) {
        result.reason =
            "Trailing data differs from the retained source or the source is unavailable.";
    } else {
        result.removable_bytes = entry.bytes.len() - RETAINED_EXTRA_CODE_BYTES;
        result.retained_bytes = RETAINED_EXTRA_CODE_BYTES;
    }
    result
}

pub fn apply(
    snapshot: &ProjectSnapshot,
    manifest: &mut NativeManifest,
    original: Option<&[u8]>,
) -> TrimPreview {
    let result = preview(snapshot, manifest, original);
    if result.removable_bytes > 0 {
        let bytes = manifest
            .get(result.native_path)
            .expect("previewed entry")
            .bytes[..result.retained_bytes]
            .to_vec();
        manifest.insert_generated(result.native_path, NativeFileFamily::ExtraCodes, bytes);
    }
    result
}
