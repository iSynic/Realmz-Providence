#![forbid(unsafe_code)]

use providence_core::rebuilt::{
    RebuiltV3AssetIndex, RebuiltV3ContentDocument, RebuiltV3Manifest, RebuiltV3WorldDocument,
};

mod documents;
mod error;
mod inspection;
mod integrity;
mod limits;
mod manifest;
pub mod scenario_read;
mod writer;

pub use error::RebuiltV3ArchiveError;
pub use inspection::inspect_rebuilt_v3_archive;
pub use scenario_read::RebuiltScenarioArchiveDocument;
pub use writer::write_rebuilt_v3_archive;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RebuiltV3ArchiveInspection {
    pub manifest: RebuiltV3Manifest,
    pub content: RebuiltV3ContentDocument,
    pub world: RebuiltV3WorldDocument,
    pub scenario: RebuiltScenarioArchiveDocument,
    pub asset_index: RebuiltV3AssetIndex,
    pub archive_file_count: usize,
    pub media_file_count: usize,
}

#[cfg(test)]
mod tests;
