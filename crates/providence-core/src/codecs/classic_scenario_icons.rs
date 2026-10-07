mod authoring;
mod decode;
mod encode;
mod resource_fork;

pub use authoring::{
    MONSTER_APPEARANCE_CANVAS_PRESETS, encode_monster_appearance_cicn,
    encode_monster_appearance_cicn_with_dither, mirror_rgba_horizontally,
};
pub use decode::decode_cicn;
use encode::encode_indexed_cicn;
pub use encode::encode_scenario_icon_cicn;
pub use resource_fork::compile_scenario_icon_resource_fork;
pub(crate) use resource_fork::{
    compile_cicn_resource_fork_for_kind, compile_retained_icon_resource_fork,
};

use super::ResourceForkError;
use crate::model::StableId;

pub const SCENARIO_ICON_MIN_ID: i16 = 1;
pub const SCENARIO_ICON_DEFAULT_ID: i16 = 30_126;
pub const SCENARIO_ICON_MAX_ID: i16 = i16::MAX;
pub const SCENARIO_ICON_WIDTH: u32 = 32;
pub const SCENARIO_ICON_HEIGHT: u32 = 32;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CicnCodecError {
    PayloadTooShort,
    InvalidDimensions {
        width: u32,
        height: u32,
    },
    InvalidRgbaLength {
        expected: usize,
        actual: usize,
    },
    InvalidResourceIdentity(StableId),
    DuplicateResourceId(i16),
    MissingClassicPayload(StableId),
    ClassicPayloadLengthMismatch {
        identity: StableId,
        expected: u64,
        actual: u64,
    },
    UnsupportedPixelDepth(u16),
    InvalidRowBytes {
        expected_at_least: usize,
        actual: usize,
    },
    TruncatedMaskOrBitmap,
    TruncatedColorTable,
    TruncatedPixelData,
    ResourceFork(ResourceForkError),
}

impl std::fmt::Display for ScenarioIconCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PayloadTooShort => write!(formatter, "cicn payload is shorter than 82 bytes"),
            Self::InvalidDimensions { width, height } => {
                write!(
                    formatter,
                    "invalid cicn source dimensions {width} x {height}"
                )
            }
            Self::InvalidRgbaLength { expected, actual } => write!(
                formatter,
                "cicn RGBA payload has {actual} bytes; expected {expected}"
            ),
            Self::InvalidResourceIdentity(identity) => write!(
                formatter,
                "asset '{}' is not a valid cicn resource for this family",
                identity.0
            ),
            Self::DuplicateResourceId(resource_id) => {
                write!(formatter, "duplicate cicn resource ID {resource_id}")
            }
            Self::MissingClassicPayload(identity) => write!(
                formatter,
                "cicn asset '{}' has no compiled Classic payload",
                identity.0
            ),
            Self::ClassicPayloadLengthMismatch {
                identity,
                expected,
                actual,
            } => write!(
                formatter,
                "cicn asset '{}' declares {expected} Classic bytes but its payload contains {actual}",
                identity.0
            ),
            Self::UnsupportedPixelDepth(depth) => write!(
                formatter,
                "unsupported cicn pixel depth {depth}; expected 1, 2, 4, or 8"
            ),
            Self::InvalidRowBytes {
                expected_at_least,
                actual,
            } => write!(
                formatter,
                "cicn row contains {actual} byte(s); at least {expected_at_least} are required"
            ),
            Self::TruncatedMaskOrBitmap => {
                write!(formatter, "cicn mask or monochrome bitmap is truncated")
            }
            Self::TruncatedColorTable => write!(formatter, "cicn color table is truncated"),
            Self::TruncatedPixelData => write!(formatter, "cicn pixel data is truncated"),
            Self::ResourceFork(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for CicnCodecError {}

impl From<ResourceForkError> for CicnCodecError {
    fn from(error: ResourceForkError) -> Self {
        Self::ResourceFork(error)
    }
}

pub type ScenarioIconCodecError = CicnCodecError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedCicn {
    pub width: u32,
    pub height: u32,
    pub pixel_depth: u16,
    pub rgba: Vec<u8>,
}

#[cfg(test)]
mod authoring_tests;
#[cfg(test)]
mod raster_tests;
#[cfg(test)]
mod resource_fork_tests;
