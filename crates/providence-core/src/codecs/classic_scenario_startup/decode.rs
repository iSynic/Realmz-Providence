use super::super::classic_text_resources::decode_mac_roman_text;
use super::{
    DecodedScenarioStartup, SCENARIO_RESTRICTIONS_BYTES, SCENARIO_STARTUP_BYTES,
    ScenarioStartupCodecError,
};
use crate::model::{
    CampaignContact, CampaignContactProvenance, CampaignMetadata, CampaignRestrictions,
    MapCoordinate, StableId, StartLocation,
};

pub fn decode_scenario_startup(
    scenario_name: &str,
    startup: &[u8],
    restrictions: &[u8],
) -> Result<DecodedScenarioStartup, ScenarioStartupCodecError> {
    if startup.len() < SCENARIO_STARTUP_BYTES {
        return Err(ScenarioStartupCodecError::StartupLength {
            expected: SCENARIO_STARTUP_BYTES,
            actual: startup.len(),
        });
    }
    if restrictions.len() != SCENARIO_RESTRICTIONS_BYTES {
        return Err(ScenarioStartupCodecError::RestrictionsLength {
            expected: SCENARIO_RESTRICTIONS_BYTES,
            actual: restrictions.len(),
        });
    }

    let values = StartupValues::read(startup)?;
    let restrictions = decode_restrictions(restrictions)?;
    Ok(DecodedScenarioStartup {
        campaign: campaign_metadata(scenario_name, startup, &values, restrictions),
        start_location: StartLocation {
            map: StableId(format!("land:{}", values.land_level)),
            coordinate: MapCoordinate {
                x: values.x as u8,
                y: values.y as u8,
            },
        },
    })
}

struct StartupValues {
    recommended_party_levels: u32,
    maximum_party_levels: u32,
    land_level: u32,
    x: i32,
    y: i32,
}

impl StartupValues {
    fn read(startup: &[u8]) -> Result<Self, ScenarioStartupCodecError> {
        let recommended_party_levels =
            nonnegative_u32("recommended party level", i32_be(startup, 0))?;
        let maximum_party_levels = nonnegative_u32("maximum party level", i32_be(startup, 4))?;
        let land_level = nonnegative_u32("land level", i32_be(startup, 8))?;
        let x = i32_be(startup, 12);
        let y = i32_be(startup, 16);
        if !(0..90).contains(&x) || !(0..90).contains(&y) {
            return Err(ScenarioStartupCodecError::StartCoordinateOutOfRange { x, y });
        }

        Ok(Self {
            recommended_party_levels,
            maximum_party_levels,
            land_level,
            x,
            y,
        })
    }
}

fn decode_restrictions(
    restrictions: &[u8],
) -> Result<CampaignRestrictions, ScenarioStartupCodecError> {
    let raw_party_size = i16_be(restrictions, 256);
    let max_party_size = match raw_party_size {
        0 => 6,
        1..=6 => raw_party_size as u8,
        value => return Err(ScenarioStartupCodecError::PartySizeOutOfRange(value)),
    };
    let restriction_max_level = i16_be(restrictions, 258);
    if restriction_max_level < 0 {
        return Err(ScenarioStartupCodecError::NegativeValue {
            field: "restriction maximum level",
            value: i32::from(restriction_max_level),
        });
    }

    Ok(CampaignRestrictions {
        description: decode_pascal(&restrictions[..256]),
        max_party_size,
        max_level: restriction_max_level as u32,
        banned_races: flagged_rule_ids(&restrictions[260..290], "race"),
        banned_castes: flagged_rule_ids(&restrictions[290..320], "caste"),
    })
}

fn campaign_metadata(
    scenario_name: &str,
    startup: &[u8],
    values: &StartupValues,
    restrictions: CampaignRestrictions,
) -> CampaignMetadata {
    let creator_user_check = decode_pascal(&startup[60..]);
    CampaignMetadata {
        name: scenario_name.to_string(),
        version: String::new(),
        author: creator_user_check.clone(),
        creator_user_check,
        contact: CampaignContact {
            title: String::new(),
            email: String::new(),
            web: String::new(),
            date: String::new(),
            fee: String::new(),
        },
        contact_provenance: CampaignContactProvenance::Absent,
        description: String::new(),
        splash_asset_id: String::new(),
        recommended_party_levels: values.recommended_party_levels,
        maximum_party_levels: values.maximum_party_levels,
        guidance_authored: false,
        restrictions,
    }
}

fn nonnegative_u32(field: &'static str, value: i32) -> Result<u32, ScenarioStartupCodecError> {
    u32::try_from(value).map_err(|_| ScenarioStartupCodecError::NegativeValue { field, value })
}

fn decode_pascal(bytes: &[u8]) -> String {
    let length = bytes.first().copied().unwrap_or_default() as usize;
    decode_mac_roman_text(&bytes[1..1 + length.min(bytes.len().saturating_sub(1))])
}

fn flagged_rule_ids(flags: &[u8], kind: &str) -> Vec<StableId> {
    flags
        .iter()
        .enumerate()
        .filter(|(_, flag)| **flag != 0)
        .map(|(index, _)| StableId(format!("classic.{kind}.{}", index + 1)))
        .collect()
}

fn i16_be(bytes: &[u8], offset: usize) -> i16 {
    i16::from_be_bytes([bytes[offset], bytes[offset + 1]])
}

fn i32_be(bytes: &[u8], offset: usize) -> i32 {
    i32::from_be_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ])
}
