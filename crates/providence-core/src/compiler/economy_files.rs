use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::codecs::{NativeFileFamily, encode_shops, encode_treasures};
use crate::model::ProjectSnapshot;

pub(super) fn compile(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    if !snapshot.treasures.is_empty() {
        manifest.insert_generated(
            "Data TD",
            NativeFileFamily::TreasureRecords,
            encode_treasures(&snapshot.treasures, sources.data_td)?,
        );
    }
    if !snapshot.shops.is_empty() || sources.data_sd.is_some() {
        manifest.insert_generated(
            "Data SD",
            NativeFileFamily::ShopRecords,
            encode_shops(&snapshot.shops, sources.data_sd)?,
        );
    }
    Ok(())
}
