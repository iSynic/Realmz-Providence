use crate::model::BlobId;
use std::collections::BTreeMap;

#[derive(Debug, Default, Clone, Copy)]
pub struct ClassicCompatibilitySources<'a> {
    pub retained_files: Option<&'a BTreeMap<String, Vec<u8>>>,
    pub scenario_startup: Option<NamedCompatibilitySource<'a>>,
    pub data_cs: Option<&'a [u8]>,
    pub data_ri: Option<&'a [u8]>,
    pub data_ci: Option<&'a [u8]>,
    pub data_ld: Option<&'a [u8]>,
    pub layout: Option<&'a [u8]>,
    pub data_md2: Option<&'a [u8]>,
    pub data_rd: Option<&'a [u8]>,
    pub data_dl: Option<&'a [u8]>,
    pub data_dd: Option<&'a [u8]>,
    pub data_ddd: Option<&'a [u8]>,
    pub data_rdd: Option<&'a [u8]>,
    pub data_ed3: Option<&'a [u8]>,
    pub data_ed: Option<&'a [u8]>,
    pub data_ed2: Option<&'a [u8]>,
    pub data_td2: Option<&'a [u8]>,
    pub data_td3: Option<&'a [u8]>,
    pub data_edcd: Option<&'a [u8]>,
    pub data_sd2: Option<&'a [u8]>,
    pub data_od: Option<&'a [u8]>,
    pub global: Option<&'a [u8]>,
    pub data_md: Option<&'a [u8]>,
    pub data_md1: Option<&'a [u8]>,
    pub data_md_minus_1: Option<&'a [u8]>,
    pub data_des: Option<&'a [u8]>,
    pub data_bd: Option<&'a [u8]>,
    pub data_td: Option<&'a [u8]>,
    pub data_sd: Option<&'a [u8]>,
    pub data_caste: Option<&'a [u8]>,
    pub application_data_caste: Option<&'a [u8]>,
    pub data_race: Option<&'a [u8]>,
    pub application_data_race: Option<&'a [u8]>,
    pub current_data_race: Option<&'a [u8]>,
    pub current_data_caste: Option<&'a [u8]>,
    pub data_ni: Option<&'a [u8]>,
    pub data_ni_text: Option<NamedCompatibilitySource<'a>>,
    pub data_spell: Option<&'a [u8]>,
    pub data_spell_names: Option<NamedCompatibilitySource<'a>>,
    pub data_solids: Option<&'a [u8]>,
    pub scenario_resources: Option<&'a [u8]>,
    pub scenario_support: Option<PreservedCompatibilitySource<'a>>,
    pub data_custom_1_bd: Option<&'a [u8]>,
    pub data_custom_2_bd: Option<&'a [u8]>,
    pub data_custom_3_bd: Option<&'a [u8]>,
    pub scenario_music: [Option<PreservedCompatibilitySource<'a>>; 3],
}

#[derive(Debug, Clone, Copy)]
pub struct NamedCompatibilitySource<'a> {
    pub native_path: &'a str,
    pub bytes: &'a [u8],
}

#[derive(Debug, Clone, Copy)]
pub struct PreservedCompatibilitySource<'a> {
    pub blob: &'a BlobId,
    pub bytes: &'a [u8],
}
