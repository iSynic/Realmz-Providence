use super::*;

fn wrath() -> RegistrationInput {
    RegistrationInput {
        scenario_name: "Wrath of the Mind Lords".into(),
        segment1: "p38beta".into(),
        segment2: "p38delta".into(),
        registration_name: "SAMUEL".into(),
        serial_number: "9140886".into(),
        recommended_level: 72,
        maximum_level: 84,
    }
}

#[test]
fn four_source_algorithms_match_pinned_wrath_vector_without_merging_evidence() {
    let rows = registration_variants(&wrath()).unwrap();
    for (identity, expected) in [
        ("pcBundledV71", "772486"),
        ("macBundledClassic", "376986"),
        ("pcCustomV71", "268585916"),
        ("macCustomLegacy", "629108726"),
    ] {
        assert_eq!(
            rows.iter()
                .find(|row| row.algorithm_id == identity)
                .unwrap()
                .code
                .as_deref(),
            Some(expected)
        );
    }
    assert!(
        rows.iter().any(|row| row.algorithm_id == "reportedEvidence"
            && row.code.as_deref() == Some("268585916"))
    );
}

#[test]
fn unavailable_bundled_rows_remain_visible_and_invalid_inputs_are_rejected() {
    let mut input = wrath();
    input.scenario_name = "A fresh custom scenario".into();
    let rows = registration_variants(&input).unwrap();
    assert_eq!(rows.len(), 4);
    assert!(
        rows[0].code.is_none()
            && rows[0]
                .availability_reason
                .as_ref()
                .unwrap()
                .contains("slot")
    );
    assert!(rows[1].code.is_none());
    assert!(rows[2].code.is_some());
    input.serial_number = "2147483648".into();
    assert!(registration_variants(&input).is_err());
    input.serial_number = "0".into();
    assert!(registration_variants(&input).is_err());
    input.serial_number = "9140886".into();
    input.registration_name = "a".repeat(27);
    assert!(registration_variants(&input).is_err());
}

#[test]
fn recorded_platform_codes_remain_separate_from_synthetic_guidance_computations() {
    let input = RegistrationInput {
        scenario_name: "Prelude to Pestilence".into(),
        segment1: "Macdom".into(),
        segment2: "Norman Baites".into(),
        registration_name: "RABREAUS".into(),
        serial_number: "9140886".into(),
        recommended_level: 12,
        maximum_level: 18,
    };
    let rows = registration_variants(&input).unwrap();
    assert_eq!(rows[0].code.as_deref(), Some("2382050"));
    assert_eq!(rows[1].code.as_deref(), Some("31837992"));
    assert_eq!(rows[2].code.as_deref(), Some("260560660"));
    assert_eq!(rows[3].code.as_deref(), Some("1485452096"));
    assert!(
        rows.iter()
            .any(|row| row.algorithm_id == "officialMacEvidence"
                && row.code.as_deref() == Some("25470888"))
    );
    assert!(
        rows.iter()
            .any(|row| row.algorithm_id == "officialWindowsEvidence"
                && row.code.as_deref() == Some("1905660"))
    );
}

#[test]
fn custom_mac_uses_all_twenty_segment_bytes() {
    let input = RegistrationInput {
        scenario_name: "Custom preservation scenario".into(),
        segment1: "ABCDEFGHIJKLMNOPQRST".into(),
        segment2: "ABCDEFGHIJKLMNOPQRST".into(),
        registration_name: "Author".into(),
        serial_number: "9140886".into(),
        recommended_level: 1,
        maximum_level: 999,
    };
    let rows = registration_variants(&input).unwrap();
    // Pinned donor algorithm, correcting only its width-minus-one segment truncation.
    assert_eq!(rows[3].code.as_deref(), Some("1744830541"));
}

#[test]
fn long_titles_and_small_signed_serials_follow_the_classic_branches() {
    let mut input = wrath();
    input.serial_number = "1".into();
    let rows = registration_variants(&input).unwrap();
    assert!(
        rows.iter()
            .find(|row| row.algorithm_id == "macBundledClassic")
            .unwrap()
            .code
            .is_some()
    );
    input.scenario_name = "Griloch's Revenge".into();
    let rows = registration_variants(&input).unwrap();
    assert!(
        rows.iter()
            .find(|row| row.algorithm_id == "macBundledClassic")
            .unwrap()
            .availability_reason
            .as_ref()
            .unwrap()
            .contains("zero")
    );
    input.serial_number = "9140886".into();
    input.scenario_name = "A".repeat(60);
    let first = registration_variants(&input)
        .unwrap()
        .into_iter()
        .find(|row| row.algorithm_id == "pcCustomV71")
        .unwrap()
        .code
        .unwrap()
        .parse::<i32>()
        .unwrap();
    input.scenario_name.push('Z');
    let second = registration_variants(&input)
        .unwrap()
        .into_iter()
        .find(|row| row.algorithm_id == "pcCustomV71")
        .unwrap()
        .code
        .unwrap()
        .parse::<i32>()
        .unwrap();
    assert_eq!(second, first.wrapping_add(112233 * i32::from(b'Z')));
    for serial in ["-2147483648", "2147483647", "-1"] {
        input.serial_number = serial.into();
        assert_eq!(registration_variants(&input).unwrap().len(), 4);
    }
}

#[test]
fn recorded_vectors_require_exact_text_inputs() {
    for field in [0, 1, 2, 3] {
        let mut input = wrath();
        match field {
            0 => input.registration_name = "S.A.M.U.E.L".into(),
            1 => input.registration_name = "SAM UEL".into(),
            2 => input.segment1 = "P38BETA".into(),
            _ => input.scenario_name = "Wrath--of the Mind Lords".into(),
        }
        let rows = registration_variants(&input).unwrap();
        assert!(
            !rows
                .iter()
                .any(|row| row.algorithm_id == "reportedEvidence")
        );
        assert_eq!(rows.len(), 4);
    }
}
