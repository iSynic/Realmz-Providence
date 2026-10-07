use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::codecs::{NativeFileFamily, encode_messages, encode_option_labels};
use crate::model::ProjectSnapshot;

pub(super) fn compile(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if !snapshot.messages.is_empty() {
        manifest.insert_generated(
            "Data SD2",
            NativeFileFamily::ScenarioMessages,
            encode_messages(&snapshot.messages, sources.data_sd2)?,
        );
    }
    if !snapshot.option_labels.is_empty() {
        manifest.insert_generated(
            "Data OD",
            NativeFileFamily::OptionLabels,
            encode_option_labels(&snapshot.option_labels, sources.data_od)?,
        );
    }
    Ok(())
}
