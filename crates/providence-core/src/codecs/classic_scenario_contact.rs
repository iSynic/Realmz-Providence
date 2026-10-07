use crate::model::{CampaignContactProvenance, CampaignMetadata};

use super::classic_text_resources::{decode_mac_roman_text, encode_mac_roman_text};

pub const SCENARIO_CONTACT_INFO_BYTES: usize = 18 * 256;
pub const SCENARIO_CONTACT_INFO_SLOT_BYTES: usize = 256;

const CONTACT_FIELDS: &[(usize, &str)] = &[
    (0, "contact.title"),
    (1, "version"),
    (2, "contact.date"),
    (3, "author"),
    (4, "contact.email"),
    (5, "contact.web"),
    (6, "contact.fee"),
    (17, "description"),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodedScenarioContactInfo {
    pub title: String,
    pub version: String,
    pub date: String,
    pub author: String,
    pub email: String,
    pub web: String,
    pub fee: String,
    pub description: String,
}

impl DecodedScenarioContactInfo {
    pub fn apply_to_campaign(&self, campaign: &mut CampaignMetadata) {
        campaign.contact.title.clone_from(&self.title);
        campaign.version.clone_from(&self.version);
        campaign.contact.date.clone_from(&self.date);
        campaign.author.clone_from(&self.author);
        campaign.contact.email.clone_from(&self.email);
        campaign.contact.web.clone_from(&self.web);
        campaign.contact.fee.clone_from(&self.fee);
        campaign.description.clone_from(&self.description);
        campaign.contact_provenance = CampaignContactProvenance::SourceBacked;
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScenarioContactCodecError {
    Length { expected: usize, actual: usize },
    LegacyContactNeedsHydration,
    UnownedContactWithoutSource,
    TextTooLong { field: &'static str, bytes: usize },
    UnencodableText { field: &'static str, index: usize },
}

impl std::fmt::Display for ScenarioContactCodecError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Length { expected, actual } => write!(
                formatter,
                "Data CI must contain exactly {expected} bytes; found {actual}"
            ),
            Self::LegacyContactNeedsHydration => write!(
                formatter,
                "legacy Data CI metadata must be hydrated from its retained source before it can be edited"
            ),
            Self::UnownedContactWithoutSource => write!(
                formatter,
                "campaign contact fields are populated but are neither source-backed nor authored"
            ),
            Self::TextTooLong { field, bytes } => write!(
                formatter,
                "Data CI {field} needs {bytes} Classic bytes; the limit is 255"
            ),
            Self::UnencodableText { field, index } => write!(
                formatter,
                "Data CI {field} contains a character at index {index} that Classic MacRoman cannot represent"
            ),
        }
    }
}

impl std::error::Error for ScenarioContactCodecError {}

pub fn decode_scenario_contact_info(
    bytes: &[u8],
) -> Result<DecodedScenarioContactInfo, ScenarioContactCodecError> {
    validate_length(bytes)?;
    Ok(DecodedScenarioContactInfo {
        title: decode_slot(bytes, 0),
        version: decode_slot(bytes, 1),
        date: decode_slot(bytes, 2),
        author: decode_slot(bytes, 3),
        email: decode_slot(bytes, 4),
        web: decode_slot(bytes, 5),
        fee: decode_slot(bytes, 6),
        description: decode_slot(bytes, 17),
    })
}

pub fn encode_scenario_contact_info(
    campaign: &CampaignMetadata,
    source: Option<&[u8]>,
) -> Result<Option<Vec<u8>>, ScenarioContactCodecError> {
    if let Some(source) = source {
        validate_length(source)?;
    }
    match campaign.contact_provenance {
        CampaignContactProvenance::LegacyUnhydrated => {
            return source
                .map(|bytes| Some(bytes.to_vec()))
                .ok_or(ScenarioContactCodecError::LegacyContactNeedsHydration);
        }
        CampaignContactProvenance::Absent => {
            if source.is_some() {
                return Err(ScenarioContactCodecError::LegacyContactNeedsHydration);
            }
            if has_contact_content(campaign) {
                return Err(ScenarioContactCodecError::UnownedContactWithoutSource);
            }
            return Ok(None);
        }
        CampaignContactProvenance::SourceBacked if source.is_none() => {
            return Err(ScenarioContactCodecError::LegacyContactNeedsHydration);
        }
        CampaignContactProvenance::SourceBacked => {
            return Ok(source.map(ToOwned::to_owned));
        }
        CampaignContactProvenance::Authored => {}
    }

    let original = source.map(decode_scenario_contact_info).transpose()?;
    let mut output = source
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| vec![0; SCENARIO_CONTACT_INFO_BYTES]);
    let values = [
        campaign.contact.title.as_str(),
        campaign.version.as_str(),
        campaign.contact.date.as_str(),
        campaign.author.as_str(),
        campaign.contact.email.as_str(),
        campaign.contact.web.as_str(),
        campaign.contact.fee.as_str(),
        campaign.description.as_str(),
    ];
    let originals = original.as_ref().map(|contact| {
        [
            contact.title.as_str(),
            contact.version.as_str(),
            contact.date.as_str(),
            contact.author.as_str(),
            contact.email.as_str(),
            contact.web.as_str(),
            contact.fee.as_str(),
            contact.description.as_str(),
        ]
    });
    for ((slot, field), (index, value)) in CONTACT_FIELDS.iter().zip(values.iter().enumerate()) {
        if originals.is_some_and(|originals| originals[index] == *value) {
            continue;
        }
        write_slot(&mut output, *slot, field, value)?;
    }
    Ok(Some(output))
}

fn has_contact_content(campaign: &CampaignMetadata) -> bool {
    !campaign.contact.title.is_empty()
        || !campaign.version.is_empty()
        || !campaign.contact.date.is_empty()
        || (!campaign.author.is_empty() && campaign.author != campaign.creator_user_check)
        || !campaign.contact.email.is_empty()
        || !campaign.contact.web.is_empty()
        || !campaign.contact.fee.is_empty()
        || !campaign.description.is_empty()
}

fn validate_length(bytes: &[u8]) -> Result<(), ScenarioContactCodecError> {
    if bytes.len() == SCENARIO_CONTACT_INFO_BYTES {
        Ok(())
    } else {
        Err(ScenarioContactCodecError::Length {
            expected: SCENARIO_CONTACT_INFO_BYTES,
            actual: bytes.len(),
        })
    }
}

fn decode_slot(bytes: &[u8], slot: usize) -> String {
    let row = &bytes
        [slot * SCENARIO_CONTACT_INFO_SLOT_BYTES..(slot + 1) * SCENARIO_CONTACT_INFO_SLOT_BYTES];
    let length = usize::from(row[0]);
    decode_mac_roman_text(&row[1..1 + length])
}

fn write_slot(
    output: &mut [u8],
    slot: usize,
    field: &'static str,
    value: &str,
) -> Result<(), ScenarioContactCodecError> {
    let encoded =
        encode_mac_roman_text(value).ok_or_else(|| ScenarioContactCodecError::UnencodableText {
            field,
            index: value
                .char_indices()
                .find_map(|(index, character)| {
                    encode_mac_roman_text(&character.to_string())
                        .is_none()
                        .then_some(index)
                })
                .unwrap_or(0),
        })?;
    if encoded.len() > 255 {
        return Err(ScenarioContactCodecError::TextTooLong {
            field,
            bytes: encoded.len(),
        });
    }
    let row = &mut output
        [slot * SCENARIO_CONTACT_INFO_SLOT_BYTES..(slot + 1) * SCENARIO_CONTACT_INFO_SLOT_BYTES];
    row.fill(0);
    row[0] = encoded.len() as u8;
    row[1..1 + encoded.len()].copy_from_slice(&encoded);
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::model::{CampaignContact, CampaignRestrictions};

    use super::*;

    fn campaign() -> CampaignMetadata {
        CampaignMetadata {
            name: "Folder Name".into(),
            version: "8.3".into(),
            author: "Pierre Vachon".into(),
            creator_user_check: "Registered User".into(),
            contact: CampaignContact {
                title: "Display Title".into(),
                email: "author@example.test".into(),
                web: "https://example.test".into(),
                date: "October 2005".into(),
                fee: "Free".into(),
            },
            contact_provenance: CampaignContactProvenance::Authored,
            description: "A source-backed scenario.".into(),
            splash_asset_id: String::new(),
            recommended_party_levels: 1,
            maximum_party_levels: 999,
            guidance_authored: false,
            restrictions: CampaignRestrictions {
                description: String::new(),
                max_party_size: 6,
                max_level: 0,
                banned_races: Vec::new(),
                banned_castes: Vec::new(),
            },
        }
    }

    #[test]
    fn authored_contact_round_trips_only_the_eight_runtime_fields() {
        let campaign = campaign();
        let encoded = encode_scenario_contact_info(&campaign, None)
            .unwrap()
            .expect("authored Data CI");
        let decoded = decode_scenario_contact_info(&encoded).unwrap();

        assert_eq!(encoded.len(), SCENARIO_CONTACT_INFO_BYTES);
        assert_eq!(decoded.title, "Display Title");
        assert_eq!(decoded.version, "8.3");
        assert_eq!(decoded.author, "Pierre Vachon");
        assert_eq!(decoded.description, "A source-backed scenario.");
        assert!(encoded[7 * 256..17 * 256].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn source_backed_no_edit_and_one_edit_preserve_unowned_slots_and_other_slack() {
        let mut source = vec![0xa5; SCENARIO_CONTACT_INFO_BYTES];
        for (slot, value) in [
            (0, "Legacy title"),
            (1, "1.0"),
            (2, "1999"),
            (3, "Legacy author"),
            (4, "old@example.test"),
            (5, "legacy.example"),
            (6, "Shareware"),
            (17, "Legacy description"),
        ] {
            write_slot(&mut source, slot, "fixture", value).unwrap();
            source[(slot + 1) * 256 - 1] = 0x5a;
        }
        source[7 * 256..17 * 256].fill(0x7c);
        let decoded = decode_scenario_contact_info(&source).unwrap();
        let mut campaign = campaign();
        decoded.apply_to_campaign(&mut campaign);

        assert_eq!(
            encode_scenario_contact_info(&campaign, Some(&source)).unwrap(),
            Some(source.clone())
        );

        campaign.contact_provenance = CampaignContactProvenance::Authored;
        campaign.contact.email = "new@example.test".into();
        let edited = encode_scenario_contact_info(&campaign, Some(&source))
            .unwrap()
            .unwrap();
        assert_eq!(&edited[..4 * 256], &source[..4 * 256]);
        assert_eq!(&edited[5 * 256..], &source[5 * 256..]);
        assert_eq!(&edited[7 * 256..17 * 256], &source[7 * 256..17 * 256]);
        assert_eq!(
            decode_scenario_contact_info(&edited).unwrap().email,
            "new@example.test"
        );
    }

    #[test]
    fn legacy_unhydrated_contact_is_preserved_but_cannot_be_synthesized() {
        let source = vec![0x5a; SCENARIO_CONTACT_INFO_BYTES];
        let mut campaign = campaign();
        campaign.contact_provenance = CampaignContactProvenance::LegacyUnhydrated;
        assert_eq!(
            encode_scenario_contact_info(&campaign, Some(&source)).unwrap(),
            Some(source)
        );
        assert_eq!(
            encode_scenario_contact_info(&campaign, None),
            Err(ScenarioContactCodecError::LegacyContactNeedsHydration)
        );
    }

    #[test]
    fn absent_contact_is_omitted_and_lossy_text_is_refused() {
        let mut campaign = campaign();
        campaign.contact = CampaignContact::default();
        campaign.version.clear();
        campaign.author.clear();
        campaign.description.clear();
        campaign.contact_provenance = CampaignContactProvenance::Absent;
        assert_eq!(encode_scenario_contact_info(&campaign, None).unwrap(), None);

        campaign.contact.title = "Dragon 🐉".into();
        campaign.contact_provenance = CampaignContactProvenance::Authored;
        assert!(matches!(
            encode_scenario_contact_info(&campaign, None),
            Err(ScenarioContactCodecError::UnencodableText {
                field: "contact.title",
                ..
            })
        ));
    }
}
