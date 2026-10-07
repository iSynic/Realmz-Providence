//! Startup offsets 20..60 hold two byte-mixed, twenty-byte C strings.
//! The backup's first segment is a mask; all other backup bytes remain source owned.
use super::SCENARIO_STARTUP_BYTES;
use crate::model::ScenarioSecurityAuthoring;

pub const SECURITY_SEGMENT_BYTES: usize = 20;

pub fn encode_registration_title(title: &str) -> Result<Vec<u8>, String> {
    super::classic_text_resources::encode_mac_roman_text(title)
        .filter(|bytes| bytes.len() <= 255)
        .ok_or_else(|| "The runtime title must fit 255 MacRoman bytes.".into())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScenarioSecurityCodecError(pub String);

impl std::fmt::Display for ScenarioSecurityCodecError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for ScenarioSecurityCodecError {}

pub fn validate_security_segments(
    first: &str,
    second: &str,
) -> Result<(), ScenarioSecurityCodecError> {
    segment_bytes(first, 1)?;
    segment_bytes(second, 2)?;
    Ok(())
}

fn segment_bytes(value: &str, index: u8) -> Result<[u8; 20], ScenarioSecurityCodecError> {
    if value.len() > 20 || !value.bytes().all(|byte| (32..=126).contains(&byte)) {
        return Err(ScenarioSecurityCodecError(format!(
            "Code Segment {index} must contain at most twenty printable ASCII characters."
        )));
    }
    let mut result = [0; 20];
    result[..value.len()].copy_from_slice(value.as_bytes());
    Ok(result)
}

pub fn security_backup_mask(backup: &[u8]) -> [u8; 20] {
    let mut mask = [0; 20];
    for (index, byte) in mask.iter_mut().enumerate() {
        *byte = backup.get(20 + index).copied().unwrap_or(0);
    }
    mask
}

pub fn decode_scenario_security(
    startup: &[u8],
    backup: Option<&[u8]>,
) -> Result<(String, String), ScenarioSecurityCodecError> {
    if startup.len() < 60 {
        return Err(ScenarioSecurityCodecError(
            "Startup security segments are incomplete.".into(),
        ));
    }
    let backup = match backup {
        Some(bytes) if bytes.len() >= SCENARIO_STARTUP_BYTES => bytes,
        Some(_) => return Err(ScenarioSecurityCodecError("Data CS is incomplete. Review its repair before editing security.".into())),
        None if startup[20..60].iter().all(|byte| *byte == 0) => return Ok((String::new(), String::new())),
        None => return Err(ScenarioSecurityCodecError("Data CS is missing; the stored segments cannot be decoded reliably. Enter replacement segments explicitly.".into())),
    };
    let mask = security_backup_mask(backup);
    let mut first = [0; 20];
    let mut second = [0; 20];
    for index in 0..20 {
        second[index] = startup[40 + index].wrapping_sub(mask[index]);
        first[index] = startup[20 + index].wrapping_sub(second[index]);
    }
    Ok((read_segment(&first, 1)?, read_segment(&second, 2)?))
}

fn read_segment(bytes: &[u8; 20], index: u8) -> Result<String, ScenarioSecurityCodecError> {
    let end = bytes.iter().position(|byte| *byte == 0).unwrap_or(20);
    // Classic consumes a C string; bytes after its terminator are retained residue.
    if !bytes[..end].iter().all(|byte| (32..=126).contains(byte)) {
        return Err(ScenarioSecurityCodecError(format!(
            "Code Segment {index} has unknown imported bytes. Enter a replacement explicitly."
        )));
    }
    Ok(String::from_utf8(bytes[..end].to_vec()).expect("validated ASCII"))
}

pub fn encode_scenario_security(
    startup: &mut [u8],
    backup_source: Option<&[u8]>,
    security: &ScenarioSecurityAuthoring,
) -> Result<Vec<u8>, ScenarioSecurityCodecError> {
    let first = segment_bytes(&security.segment1, 1)?;
    let second = segment_bytes(&security.segment2, 2)?;
    if startup.len() < SCENARIO_STARTUP_BYTES {
        return Err(ScenarioSecurityCodecError(
            "Startup record is incomplete.".into(),
        ));
    }
    let mut backup = backup_source
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| vec![0; SCENARIO_STARTUP_BYTES]);
    if backup.len() < SCENARIO_STARTUP_BYTES {
        if !security.repair_backup {
            return Err(ScenarioSecurityCodecError(
                "Data CS repair has not been accepted.".into(),
            ));
        }
        backup.resize(SCENARIO_STARTUP_BYTES, 0);
    }
    if security_backup_mask(&backup) != security.backup_mask {
        return Err(ScenarioSecurityCodecError(
            "Data CS mask does not match the reviewed source.".into(),
        ));
    }
    for index in 0..20 {
        startup[20 + index] = first[index].wrapping_add(second[index]);
        startup[40 + index] = second[index].wrapping_add(security.backup_mask[index]);
    }
    Ok(backup)
}

/// Marker output cannot replace another native family or an existing retained file.
pub fn validate_marker_filename(filename: &str) -> Result<(), String> {
    let reserved = [
        "Scenario",
        "Scenario.rsrc",
        "Layout",
        "Global",
        "Text",
        "Custom 1 Music",
        "Custom 2 Music",
        "Custom 3 Music",
    ];
    if filename.to_ascii_lowercase().starts_with("data ")
        || reserved
            .iter()
            .any(|name| filename.eq_ignore_ascii_case(name))
    {
        return Err("Marker filename conflicts with a reserved Classic file.".into());
    }
    encode_registration_title(filename)?;
    Ok(())
}

pub fn encode_scenario_startup_as(
    marker_filename: &str,
    campaign: &crate::model::CampaignMetadata,
    location: &crate::model::StartLocation,
    startup_source: Option<&[u8]>,
    restrictions_source: Option<&[u8]>,
) -> Result<(Vec<u8>, Vec<u8>), super::ScenarioStartupCodecError> {
    let mut output_campaign = campaign.clone();
    output_campaign.name = marker_filename.into();
    super::encode_scenario_startup(
        marker_filename,
        &output_campaign,
        location,
        startup_source,
        restrictions_source,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft() -> ScenarioSecurityAuthoring {
        ScenarioSecurityAuthoring {
            segment1: "ABCDEFGHIJKLMNOPQRST".into(),
            segment2: "zyxwvutsrqponmlkjihg".into(),
            backup_source: None,
            backup_mask: [0; 20],
            repair_backup: false,
        }
    }

    #[test]
    fn full_twenty_byte_segments_round_trip_and_only_owned_startup_bytes_change() {
        let mut startup = vec![0xa7; 321];
        let before = startup.clone();
        let mut backup = vec![0xb3; 325];
        for (index, byte) in backup[20..40].iter_mut().enumerate() {
            *byte = (240 + index) as u8;
        }
        let mut security = draft();
        security.backup_mask = security_backup_mask(&backup);
        let output = encode_scenario_security(&mut startup, Some(&backup), &security).unwrap();
        assert_eq!(output, backup);
        assert_eq!(&startup[..20], &before[..20]);
        assert_eq!(&startup[60..], &before[60..]);
        assert_eq!(
            decode_scenario_security(&startup, Some(&output)).unwrap(),
            (security.segment1, security.segment2)
        );
    }

    #[test]
    fn imported_c_strings_ignore_residue_after_the_first_nul() {
        let mut startup = vec![0; 316];
        let backup = vec![0; 316];
        let first = *b"Avast Matey!\0es\0\0\0\0\0";
        let second = *b"Holy 28 Toes Batman\0";
        for index in 0..20 {
            startup[20 + index] = first[index].wrapping_add(second[index]);
            startup[40 + index] = second[index];
        }
        let source = startup.clone();
        assert_eq!(
            decode_scenario_security(&startup, Some(&backup)).unwrap(),
            ("Avast Matey!".into(), "Holy 28 Toes Batman".into())
        );
        assert_eq!(startup, source);
        startup[33] = 255;
        assert!(decode_scenario_security(&startup, Some(&backup)).is_ok());
        startup[23] = second[3].wrapping_add(1);
        assert!(decode_scenario_security(&startup, Some(&backup)).is_err());
    }

    #[test]
    fn missing_and_malformed_backups_require_explicit_replacement_or_repair() {
        assert!(decode_scenario_security(&vec![17; 316], None).is_err());
        let mut startup = vec![0; 316];
        let mut security = draft();
        security.backup_mask = security_backup_mask(&[5; 32]);
        assert!(encode_scenario_security(&mut startup, Some(&[5; 32]), &security).is_err());
        security.repair_backup = true;
        let output = encode_scenario_security(&mut startup, Some(&[5; 32]), &security).unwrap();
        assert_eq!(&output[..32], &[5; 32]);
        assert_eq!(&output[32..], &[0; 284]);
        assert!(validate_security_segments(&"a".repeat(21), "").is_err());
        assert!(validate_security_segments("a\n", "").is_err());
    }
}
