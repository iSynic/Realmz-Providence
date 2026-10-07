//! Registration arithmetic follows the pinned Classic main.c paths and Providence
//! 56ac232c registrationCodes.ts. Candidate arithmetic and recorded evidence remain distinct.
mod algorithms;
mod evidence;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationInput {
    pub scenario_name: String,
    pub segment1: String,
    pub segment2: String,
    pub registration_name: String,
    pub serial_number: String,
    pub recommended_level: u32,
    pub maximum_level: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationVariant {
    pub algorithm_id: String,
    pub label: String,
    pub code: Option<String>,
    pub availability_reason: Option<String>,
    pub confidence: String,
    pub detail: String,
}

pub fn registration_variants(
    input: &RegistrationInput,
) -> Result<Vec<RegistrationVariant>, String> {
    let serial = validated_serial(input)?;
    let title = crate::codecs::encode_registration_title(&input.scenario_name)?;
    let mut rows = arithmetic_candidates(input, serial, &title);
    for vector in evidence::matching(input, serial) {
        for row in &mut rows {
            if row.code.as_deref() == Some(vector.code) {
                row.confidence = "matches-recorded-vector".into();
            }
        }
        rows.push(RegistrationVariant {
            algorithm_id: vector.identity.into(),
            label: vector.label.into(),
            code: Some(vector.code.into()),
            availability_reason: None,
            confidence: "recorded-evidence".into(),
            detail: vector.source.into(),
        });
    }
    Ok(rows)
}

fn validated_serial(input: &RegistrationInput) -> Result<i32, String> {
    if input.registration_name.trim().is_empty()
        || input.registration_name.len() > 26
        || !input
            .registration_name
            .bytes()
            .all(|byte| (32..=126).contains(&byte))
    {
        return Err(
            "Registration name must contain one through twenty-six printable ASCII characters."
                .into(),
        );
    }
    let serial: i32 = input
        .serial_number
        .trim()
        .parse()
        .map_err(|_| "Serial must be a signed 32-bit integer.".to_string())?;
    if serial == 0 {
        return Err("Serial cannot be zero.".into());
    }
    crate::codecs::validate_security_segments(&input.segment1, &input.segment2)
        .map_err(|error| error.to_string())?;
    Ok(serial)
}

fn bundled_levels(input: &RegistrationInput, slot: Option<i32>) -> Result<(i32, i32, i32), String> {
    let slot = slot.ok_or("No bundled scenario slot matches this runtime title.")?;
    let rec = i32::try_from(input.recommended_level)
        .map_err(|_| "Recommended level exceeds the Classic signed range.")?;
    let max = i32::try_from(input.maximum_level)
        .map_err(|_| "Maximum level exceeds the Classic signed range.")?;
    if rec == 0 {
        return Err("Bundled algorithms require a nonzero recommended level.".into());
    }
    Ok((slot, rec, max))
}

fn arithmetic_candidates(
    input: &RegistrationInput,
    serial: i32,
    title: &[u8],
) -> Vec<RegistrationVariant> {
    let slot = official_scenario_slot(&input.scenario_name);
    let bundled = || bundled_levels(input, slot);
    vec![
        candidate(
            "pcBundledV71",
            "Windows bundled scenario",
            bundled()
                .and_then(|(slot, rec, max)| algorithms::pc_bundled(input, serial, slot, rec, max)),
            "Classic regscen_pc arithmetic.",
        ),
        candidate(
            "macBundledClassic",
            "Mac bundled scenario",
            bundled().and_then(|(slot, rec, max)| {
                algorithms::mac_bundled(input, serial, slot, rec, max)
            }),
            if slot.is_some_and(|slot| slot > 14) {
                "Later-slot source branch; compiled runtime acceptance remains unresolved."
            } else {
                "Classic regscen bundled arithmetic."
            },
        ),
        candidate(
            "pcCustomV71",
            "Divinity Coder / custom",
            algorithms::pc_custom(input, serial, title),
            "Classic regscen_pc_custom arithmetic. Matching vectors do not establish universal runtime acceptance.",
        ),
        candidate(
            "macCustomLegacy",
            "Mac classic custom",
            Ok(algorithms::mac_custom(input, serial, title)),
            "Classic third-party regscen arithmetic, retaining its C/Pascal loop behavior.",
        ),
    ]
}

fn candidate(
    identity: &str,
    label: &str,
    result: Result<i32, String>,
    detail: &str,
) -> RegistrationVariant {
    let (code, availability_reason) = match result {
        Ok(code) => (Some(code.to_string()), None),
        Err(reason) => (None, Some(reason)),
    };
    RegistrationVariant {
        algorithm_id: identity.into(),
        label: label.into(),
        code,
        availability_reason,
        confidence: "source-candidate".into(),
        detail: detail.into(),
    }
}

pub(super) fn normalized(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect()
}

pub fn official_scenario_slot(title: &str) -> Option<i32> {
    Some(match normalized(title).as_str() {
        "cityofbywater" => 10,
        "preludetopestilence" => 11,
        "assaultongiantmountain" => 12,
        "destroythenecronomicon" => 13,
        "castleintheclouds" => 14,
        "grilochsrevenge" => 15,
        "whitedragon" => 16,
        "mithrilvault" => 17,
        "twinsandsoftime" => 18,
        "troubleintheswordlands" => 19,
        "warintheswordlands" => 20,
        "halftruth" | "wrathofthemindlords" => 21,
        _ => return None,
    })
}

#[cfg(test)]
mod tests;
