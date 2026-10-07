use super::{ClassicSourceBlob, StableId};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignContact {
    #[serde(default)]
    pub title: String,
    pub email: String,
    pub web: String,
    pub date: String,
    pub fee: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CampaignContactProvenance {
    #[default]
    Absent,
    SourceBacked,
    Authored,
    LegacyUnhydrated,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignRestrictions {
    pub description: String,
    pub max_party_size: u8,
    pub max_level: u32,
    pub banned_races: Vec<StableId>,
    pub banned_castes: Vec<StableId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignMetadata {
    pub name: String,
    pub version: String,
    pub author: String,
    #[serde(default)]
    pub creator_user_check: String,
    pub contact: CampaignContact,
    #[serde(default)]
    pub contact_provenance: CampaignContactProvenance,
    pub description: String,
    pub splash_asset_id: String,
    pub recommended_party_levels: u32,
    pub maximum_party_levels: u32,
    pub guidance_authored: bool,
    pub restrictions: CampaignRestrictions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioStartupAuthoring {
    pub marker_filename: String,
    pub original_source: Option<ClassicSourceBlob>,
    pub security: Option<ScenarioSecurityAuthoring>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioSecurityAuthoring {
    pub segment1: String,
    pub segment2: String,
    pub backup_source: Option<ClassicSourceBlob>,
    pub backup_mask: [u8; 20],
    pub repair_backup: bool,
}

impl CampaignMetadata {
    pub fn neutral() -> Self {
        Self {
            name: "Untitled scenario".into(),
            version: String::new(),
            author: String::new(),
            creator_user_check: String::new(),
            contact: CampaignContact::default(),
            contact_provenance: CampaignContactProvenance::Absent,
            description: String::new(),
            splash_asset_id: String::new(),
            recommended_party_levels: 0,
            maximum_party_levels: 0,
            guidance_authored: false,
            restrictions: CampaignRestrictions::default(),
        }
    }
}

impl Default for CampaignRestrictions {
    fn default() -> Self {
        Self {
            description: String::new(),
            max_party_size: 6,
            max_level: 0,
            banned_races: Vec::new(),
            banned_castes: Vec::new(),
        }
    }
}
