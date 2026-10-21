use serde::{Deserialize, Serialize};
mod effective;
#[cfg(test)]
mod option_labels_tests;
mod player_maps;
#[cfg(test)]
mod player_maps_tests;
mod prepared_rules;
mod rows;
mod rule_selection;
#[cfg(test)]
mod rule_selection_tests;
pub(super) mod rules;
mod source;
#[cfg(test)]
mod sparse_rules_tests;
#[cfg(test)]
mod tests;
pub use effective::{
    project_rebuilt_v7_effective_records, project_rebuilt_v7_effective_records_with_rule_sources,
};
pub use rule_selection::project_rebuilt_v7_rule_selection;
pub use source::project_rebuilt_v7_classic_records;
pub(super) use source::source_codec_descriptors;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuiltV7ClassicRecords {
    pub sources: Vec<NativeSourceFacts>,
    pub resources: Vec<NativeResourceFacts>,
    pub undecodable_resource_sources: Vec<String>,
    pub simple: Vec<NativeSimpleEncounter>,
    pub timed: Vec<NativeTimedEncounter>,
    pub shops: Vec<NativeShop>,
    pub programs: Vec<NativeProgramFact>,
    pub extra_codes: Vec<NativeExtraCodeFact>,
    pub player_maps: Vec<NativePlayerMapFacts>,
    pub races: Vec<crate::model::RaceRuleDefinition>,
    pub castes: Vec<crate::model::CasteRuleDefinition>,
    pub rule_selection: Option<NativeRuleSelectionFacts>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeRuleSelectionFacts {
    pub native_menu_selection: u16,
    pub captured_source_set_sha256: String,
    pub race_source: NativeRuleSource,
    pub caste_source: NativeRuleSource,
    pub projected_rules: NativeProjectedRuleDigests,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NativeRuleSource {
    Scenario,
    Application,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeProjectedRuleDigests {
    pub races: Vec<NativeRuleRowDigest>,
    pub castes: Vec<NativeRuleRowDigest>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeRuleRowDigest {
    pub id: String,
    pub sha256: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePlayerMapFacts {
    pub id: u32,
    pub words: Vec<i16>,
    pub note_bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeResourceFacts {
    pub native_path: String,
    pub resource_type_bytes: [u8; 4],
    pub resource_id: i16,
    pub occurrence: usize,
    pub sha256: String,
    pub byte_length: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceFacts {
    pub native_path: String,
    pub sha256: String,
    pub byte_length: u64,
    pub effective_sha256: String,
    pub effective_byte_length: u64,
    pub edits: Vec<NativeSourceEdit>,
    pub layouts: Vec<NativeRecordLayout>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSourceEdit {
    pub offset: usize,
    pub before: Vec<u8>,
    pub after: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRecordLayout {
    pub family: String,
    pub record_bytes: usize,
    pub complete_records: usize,
    pub trailing_bytes: usize,
    pub owned_byte_ranges: Vec<NativeByteRange>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeByteRange {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSimpleEncounter {
    pub id: u32,
    pub codes: Vec<i8>,
    pub operands: Vec<i16>,
    pub choice_results: Vec<i8>,
    pub can_back_out_byte: u8,
    pub max_times: i8,
    pub caste_success: i8,
    pub reserved_byte: u8,
    pub prompt_message_id: i16,
    pub text_slots: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTimedEncounter {
    pub id: u32,
    pub words: Vec<i16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeShop {
    pub id: u32,
    pub item_ids: Vec<i16>,
    pub quantities: Vec<u8>,
    pub inflation: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeProgramFact {
    pub native_path: String,
    pub id: u32,
    pub prefix: Vec<u8>,
    pub codes: Vec<i16>,
    pub operands: Vec<i16>,
    pub suffix: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeExtraCodeFact {
    pub id: u32,
    pub values: [i16; 5],
}
