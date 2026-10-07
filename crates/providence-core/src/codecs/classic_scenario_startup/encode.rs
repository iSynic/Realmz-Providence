use super::super::classic_text_resources::encode_mac_roman_text;
use super::{
    DecodedScenarioStartup, SCENARIO_RESTRICTIONS_BYTES, SCENARIO_STARTUP_BYTES,
    ScenarioStartupCodecError, decode_scenario_startup,
};
use crate::model::{CampaignMetadata, CampaignRestrictions, StableId, StartLocation};

pub fn encode_scenario_startup(
    scenario_name: &str,
    campaign: &CampaignMetadata,
    start_location: &StartLocation,
    startup_source: Option<&[u8]>,
    restrictions_source: Option<&[u8]>,
) -> Result<(Vec<u8>, Vec<u8>), ScenarioStartupCodecError> {
    validate_scenario_name(scenario_name)?;
    let original = decode_original(scenario_name, startup_source, restrictions_source)?;
    if campaign.name != scenario_name {
        return Err(ScenarioStartupCodecError::ScenarioNameMismatch {
            expected: scenario_name.into(),
            actual: campaign.name.clone(),
        });
    }
    if !campaign.splash_asset_id.is_empty() {
        return Err(ScenarioStartupCodecError::UnsupportedCampaignField(
            "splashAssetId",
        ));
    }

    // Validate both files' authored fields before patching either captured source.
    let fields = EncodedFields::new(campaign, start_location)?;
    let mut startup = startup_source
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| vec![0; SCENARIO_STARTUP_BYTES]);
    let mut restrictions = restrictions_source
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| vec![0; SCENARIO_RESTRICTIONS_BYTES]);
    let original = original.as_ref();
    patch_startup(&mut startup, campaign, original, &fields);
    patch_restrictions(
        &mut restrictions,
        &campaign.restrictions,
        original.map(|decoded| &decoded.campaign.restrictions),
        &fields,
    );
    Ok((startup, restrictions))
}

fn validate_scenario_name(scenario_name: &str) -> Result<(), ScenarioStartupCodecError> {
    if scenario_name.is_empty()
        || scenario_name == "."
        || scenario_name == ".."
        || scenario_name.ends_with(' ')
        || scenario_name.ends_with('.')
        || scenario_name
            .chars()
            .any(|character| character.is_control() || "<>:\"/\\|?*".contains(character))
    {
        return Err(ScenarioStartupCodecError::InvalidScenarioName(
            scenario_name.into(),
        ));
    }
    Ok(())
}

fn decode_original(
    scenario_name: &str,
    startup_source: Option<&[u8]>,
    restrictions_source: Option<&[u8]>,
) -> Result<Option<DecodedScenarioStartup>, ScenarioStartupCodecError> {
    let neutral_restrictions = [0_u8; SCENARIO_RESTRICTIONS_BYTES];
    let original = match (startup_source, restrictions_source) {
        (Some(startup), Some(restrictions)) => Some(decode_scenario_startup(
            scenario_name,
            startup,
            restrictions,
        )?),
        (Some(startup), None) => Some(decode_scenario_startup(
            scenario_name,
            startup,
            &neutral_restrictions,
        )?),
        (None, None) => None,
        (None, Some(_)) => return Err(ScenarioStartupCodecError::IncompleteSourcePair),
    };
    Ok(original)
}

struct EncodedFields {
    recommended: i32,
    maximum: i32,
    land_level: i32,
    x: i32,
    y: i32,
    restriction_max_level: i16,
    creator_user_check: Vec<u8>,
    restriction_description: Vec<u8>,
    race_flags: [bool; 30],
    caste_flags: [bool; 30],
}

impl EncodedFields {
    fn new(
        campaign: &CampaignMetadata,
        start_location: &StartLocation,
    ) -> Result<Self, ScenarioStartupCodecError> {
        let recommended =
            classic_i32("recommended party level", campaign.recommended_party_levels)?;
        let maximum = classic_i32("maximum party level", campaign.maximum_party_levels)?;
        let land_level = start_location
            .map
            .0
            .strip_prefix("land:")
            .and_then(|value| value.parse::<u32>().ok())
            .ok_or_else(|| {
                ScenarioStartupCodecError::InvalidStartMap(start_location.map.0.clone())
            })?;
        let land_level = classic_i32("land level", land_level)?;
        let x = i32::from(start_location.coordinate.x);
        let y = i32::from(start_location.coordinate.y);
        if !(0..90).contains(&x) || !(0..90).contains(&y) {
            return Err(ScenarioStartupCodecError::StartCoordinateOutOfRange { x, y });
        }
        if !(1..=6).contains(&campaign.restrictions.max_party_size) {
            return Err(ScenarioStartupCodecError::PartySizeOutOfRange(i16::from(
                campaign.restrictions.max_party_size,
            )));
        }
        let restriction_max_level =
            i16::try_from(campaign.restrictions.max_level).map_err(|_| {
                ScenarioStartupCodecError::NumericValueOutOfRange {
                    field: "restriction maximum level",
                    value: campaign.restrictions.max_level,
                }
            })?;
        let creator_user_check =
            classic_pascal("creator user check", &campaign.creator_user_check)?;
        let restriction_description = classic_pascal(
            "restriction description",
            &campaign.restrictions.description,
        )?;
        let race_flags = restriction_flags(&campaign.restrictions.banned_races, "race")?;
        let caste_flags = restriction_flags(&campaign.restrictions.banned_castes, "caste")?;

        Ok(Self {
            recommended,
            maximum,
            land_level,
            x,
            y,
            restriction_max_level,
            creator_user_check,
            restriction_description,
            race_flags,
            caste_flags,
        })
    }
}

fn patch_startup(
    startup: &mut [u8],
    campaign: &CampaignMetadata,
    original: Option<&DecodedScenarioStartup>,
    fields: &EncodedFields,
) {
    write_i32_if_changed(
        startup,
        0,
        fields.recommended,
        original.map(|decoded| decoded.campaign.recommended_party_levels),
        campaign.recommended_party_levels,
    );
    write_i32_if_changed(
        startup,
        4,
        fields.maximum,
        original.map(|decoded| decoded.campaign.maximum_party_levels),
        campaign.maximum_party_levels,
    );
    write_i32_if_changed(
        startup,
        8,
        fields.land_level,
        original.and_then(|decoded| {
            decoded
                .start_location
                .map
                .0
                .strip_prefix("land:")
                .and_then(|value| value.parse::<u32>().ok())
        }),
        fields.land_level as u32,
    );
    write_i32_if_changed(
        startup,
        12,
        fields.x,
        original.map(|decoded| u32::from(decoded.start_location.coordinate.x)),
        fields.x as u32,
    );
    write_i32_if_changed(
        startup,
        16,
        fields.y,
        original.map(|decoded| u32::from(decoded.start_location.coordinate.y)),
        fields.y as u32,
    );
    if original
        .is_none_or(|decoded| decoded.campaign.creator_user_check != campaign.creator_user_check)
    {
        write_pascal_field(
            &mut startup[60..SCENARIO_STARTUP_BYTES],
            &fields.creator_user_check,
        );
    }
}

fn patch_restrictions(
    restrictions: &mut [u8],
    requested: &CampaignRestrictions,
    original: Option<&CampaignRestrictions>,
    fields: &EncodedFields,
) {
    if original.is_none_or(|decoded| decoded.description != requested.description) {
        write_pascal_field(&mut restrictions[..256], &fields.restriction_description);
    }
    if original.is_none_or(|decoded| decoded.max_party_size != requested.max_party_size) {
        restrictions[256..258].copy_from_slice(&i16::from(requested.max_party_size).to_be_bytes());
    }
    if original.is_none_or(|decoded| decoded.max_level != requested.max_level) {
        restrictions[258..260].copy_from_slice(&fields.restriction_max_level.to_be_bytes());
    }
    overlay_flags(
        &mut restrictions[260..290],
        original.map(|decoded| decoded.banned_races.as_slice()),
        &fields.race_flags,
        "race",
    );
    overlay_flags(
        &mut restrictions[290..320],
        original.map(|decoded| decoded.banned_castes.as_slice()),
        &fields.caste_flags,
        "caste",
    );
}

fn classic_i32(field: &'static str, value: u32) -> Result<i32, ScenarioStartupCodecError> {
    i32::try_from(value)
        .map_err(|_| ScenarioStartupCodecError::NumericValueOutOfRange { field, value })
}

fn classic_pascal(field: &'static str, value: &str) -> Result<Vec<u8>, ScenarioStartupCodecError> {
    let bytes =
        encode_mac_roman_text(value).ok_or(ScenarioStartupCodecError::UnencodableText { field })?;
    if bytes.len() > 255 {
        return Err(ScenarioStartupCodecError::TextTooLong {
            field,
            bytes: bytes.len(),
        });
    }
    Ok(bytes)
}

fn restriction_flags(
    identities: &[StableId],
    kind: &'static str,
) -> Result<[bool; 30], ScenarioStartupCodecError> {
    let mut flags = [false; 30];
    let prefix = format!("classic.{kind}.");
    for identity in identities {
        let index = identity
            .0
            .strip_prefix(&prefix)
            .and_then(|value| value.parse::<usize>().ok())
            .filter(|value| (1..=30).contains(value))
            .ok_or_else(|| ScenarioStartupCodecError::InvalidRuleId {
                kind,
                identity: identity.0.clone(),
            })?;
        flags[index - 1] = true;
    }
    Ok(flags)
}

fn write_i32_if_changed(
    output: &mut [u8],
    offset: usize,
    encoded: i32,
    original: Option<u32>,
    requested: u32,
) {
    if original != Some(requested) {
        output[offset..offset + 4].copy_from_slice(&encoded.to_be_bytes());
    }
}

fn write_pascal_field(field: &mut [u8], bytes: &[u8]) {
    field.fill(0);
    field[0] = bytes.len() as u8;
    field[1..1 + bytes.len()].copy_from_slice(bytes);
}

fn overlay_flags(
    bytes: &mut [u8],
    original: Option<&[StableId]>,
    requested: &[bool; 30],
    kind: &'static str,
) {
    // An unchanged semantic flag keeps its original noncanonical byte spelling.
    for (index, byte) in bytes.iter_mut().enumerate() {
        let was_set = original.is_some_and(|identities| {
            identities
                .iter()
                .any(|identity| identity.0 == format!("classic.{kind}.{}", index + 1))
        });
        if original.is_none() || was_set != requested[index] {
            *byte = u8::from(requested[index]);
        }
    }
}
