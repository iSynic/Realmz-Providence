#![forbid(unsafe_code)]

mod file_io;
mod launch;
mod request;
mod result;
mod targets;
pub use launch::{headless_probe_arguments, interactive_host_arguments};
pub use request::{prepare_request, read_request};
pub use result::{read_result, read_result_for_request};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

pub const REQUEST_KIND: &str = "realmz2.preview-request";
pub const RESULT_KIND: &str = "realmz2.preview-result";
pub const FORMAT_VERSION: u8 = 1;
pub const PARTY_FIXTURE: &str = "classic-six";
pub const INTERACTIVE_HOST_SCENE: &str = "res://tools/development_preview_host.tscn";
pub const HEADLESS_PROBE_SCRIPT: &str = "res://tools/development_preview_probe.gd";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum PreviewTarget {
    #[serde(rename = "action-point")]
    ActionPoint {
        id: String,
        #[serde(rename = "mapId")]
        map_id: String,
        x: i32,
        y: i32,
    },
    #[serde(rename = "simple-encounter")]
    SimpleEncounter { id: u32 },
    #[serde(rename = "complex-encounter")]
    ComplexEncounter { id: u32 },
    #[serde(rename = "thief-encounter")]
    ThiefEncounter {
        id: u32,
        #[serde(rename = "complexEncounterId")]
        complex_encounter_id: u32,
    },
    #[serde(rename = "extra-action-point-program")]
    ExtraActionPointProgram { id: u32 },
    #[serde(rename = "map-location")]
    MapLocation {
        id: String,
        #[serde(rename = "mapId")]
        map_id: String,
        x: i32,
        y: i32,
    },
    #[serde(rename = "scrolling-text")]
    ScrollingText { id: i32 },
    #[serde(rename = "battle")]
    Battle { id: u32 },
    #[serde(rename = "treasure")]
    Treasure { id: u32 },
    #[serde(rename = "shop")]
    Shop { id: u32 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewRequest {
    pub kind: String,
    pub format_version: u8,
    pub package_path: PathBuf,
    pub package_sha256: String,
    pub target: PreviewTarget,
    pub party_fixture: String,
    pub rng_seed: i64,
    pub isolated_session: bool,
    pub result_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreviewResult {
    Ready {
        campaign_id: String,
        package_hash: String,
        target_kind: String,
        target_id: Value,
        rng_seed: i64,
        revision: u64,
        pending_interaction_kind: String,
    },
    Failed {
        error_code: String,
        error_message: String,
        target_kind: String,
        target_id: Value,
    },
}

impl PreviewResult {
    pub fn status(&self) -> &'static str {
        match self {
            Self::Ready { .. } => "ready",
            Self::Failed { .. } => "failed",
        }
    }
}

#[cfg(test)]
mod tests;
