use crate::error::{ProvidenceError, Result};
use crate::project::{
    GlobalMacroHook, ScenarioContactInfo, ScenarioGlobalMacroHooks, ScenarioRestrictions,
    ScenarioShell, ScenarioSupportFile,
};

use super::record_bytes::{
    copy_fixed_bytes, decode_pascal_text, encode_pascal_text, i16_be, i32_be, pascal_record_string,
    provenance, write_i16_be, write_i32_be,
};

pub const SCENARIO_CONTACT_INFO_BYTES: usize = 4608;
pub const SCENARIO_RESTRICTIONS_BYTES: usize = 320;
pub const GLOBAL_MACRO_HOOK_BYTES: usize = 60;
pub const SCENARIO_SUPPORT_FILE_BYTES: usize = 600;

pub fn parse_scenario_shell(source_file: &str, buffer: &[u8]) -> Result<ScenarioShell> {
    if buffer.len() < 316 {
        return Err(ProvidenceError::message(format!(
            "{} is {} byte(s); scenario marker/main file must be at least 316 bytes",
            source_file,
            buffer.len()
        )));
    }
    Ok(ScenarioShell {
        source_file: source_file.to_string(),
        rec_level: i32_be(buffer, 0),
        max_level: i32_be(buffer, 4),
        land_level: i32_be(buffer, 8),
        look_x: i32_be(buffer, 12),
        look_y: i32_be(buffer, 16),
        codeseg1: buffer[20..40].to_vec(),
        codeseg2: buffer[40..60].to_vec(),
        creator_user: decode_pascal_text(&buffer[60..316]),
        authored: false,
        provenance: Some(provenance(source_file, 0, 0, buffer.len())),
    })
}

pub fn write_scenario_shell(shell: &ScenarioShell) -> Result<Vec<u8>> {
    let mut output = vec![0u8; 316];
    write_i32_be(&mut output, 0, shell.rec_level);
    write_i32_be(&mut output, 4, shell.max_level);
    write_i32_be(&mut output, 8, shell.land_level);
    write_i32_be(&mut output, 12, shell.look_x);
    write_i32_be(&mut output, 16, shell.look_y);
    copy_fixed_bytes(&mut output[20..40], &shell.codeseg1);
    copy_fixed_bytes(&mut output[40..60], &shell.codeseg2);
    encode_pascal_text(&mut output[60..316], &shell.creator_user)?;
    Ok(output)
}

pub fn parse_scenario_support_file(
    source_file: &str,
    buffer: &[u8],
) -> Result<ScenarioSupportFile> {
    if buffer.len() < 40 {
        return Err(ProvidenceError::message(format!(
            "{} is {} byte(s); Scenario support file must be at least 40 bytes",
            source_file,
            buffer.len()
        )));
    }
    Ok(ScenarioSupportFile {
        source_file: source_file.to_string(),
        divinity_string_editor_slot: Some(buffer[23] as i32),
        divinity_string_sound_id: Some(i16_be(buffer, 38) as i32),
        authored: false,
        provenance: Some(provenance(source_file, 0, 0, buffer.len())),
    })
}

pub fn write_scenario_support_file(support: &ScenarioSupportFile) -> Result<Vec<u8>> {
    let mut output = vec![0u8; SCENARIO_SUPPORT_FILE_BYTES];
    if let Some(slot) = support.divinity_string_editor_slot {
        if !(0..=255).contains(&slot) {
            return Err(ProvidenceError::message(format!(
                "Divinity string editor slot {slot} is outside the 0..255 byte range"
            )));
        }
        output[23] = slot as u8;
    }
    if let Some(sound_id) = support.divinity_string_sound_id {
        if !(i16::MIN as i32..=i16::MAX as i32).contains(&sound_id) {
            return Err(ProvidenceError::message(format!(
                "Divinity string sound id {sound_id} is outside the signed 16-bit range"
            )));
        }
        write_i16_be(&mut output, 38, sound_id as i16);
    }
    Ok(output)
}

pub fn parse_scenario_contact_info(buffer: &[u8]) -> Result<ScenarioContactInfo> {
    if buffer.len() < 4608 {
        return Err(ProvidenceError::message(format!(
            "Data CI is {} byte(s); expected 4608 bytes",
            buffer.len()
        )));
    }
    Ok(ScenarioContactInfo {
        scenario_name: pascal_record_string(buffer, 0),
        version: pascal_record_string(buffer, 1),
        date: pascal_record_string(buffer, 2),
        author: pascal_record_string(buffer, 3),
        email: pascal_record_string(buffer, 4),
        web: pascal_record_string(buffer, 5),
        fee: pascal_record_string(buffer, 6),
        pay_info: (7..12)
            .map(|slot| pascal_record_string(buffer, slot))
            .collect(),
        titles: (12..17)
            .map(|slot| pascal_record_string(buffer, slot))
            .collect(),
        description: pascal_record_string(buffer, 17),
        authored: false,
        provenance: Some(provenance("Data CI", 0, 0, 4608)),
    })
}

pub fn write_scenario_contact_info(contact: &ScenarioContactInfo) -> Result<Vec<u8>> {
    let mut output = vec![0u8; 4608];
    let fields = [
        contact.scenario_name.as_str(),
        contact.version.as_str(),
        contact.date.as_str(),
        contact.author.as_str(),
        contact.email.as_str(),
        contact.web.as_str(),
        contact.fee.as_str(),
    ];
    for (slot, value) in fields.iter().enumerate() {
        encode_pascal_text(&mut output[slot * 256..slot * 256 + 256], value)?;
    }
    for index in 0..5 {
        encode_pascal_text(
            &mut output[(7 + index) * 256..(8 + index) * 256],
            contact
                .pay_info
                .get(index)
                .map(String::as_str)
                .unwrap_or(""),
        )?;
        encode_pascal_text(
            &mut output[(12 + index) * 256..(13 + index) * 256],
            contact.titles.get(index).map(String::as_str).unwrap_or(""),
        )?;
    }
    encode_pascal_text(&mut output[17 * 256..18 * 256], &contact.description)?;
    Ok(output)
}

pub fn parse_scenario_restrictions(buffer: &[u8]) -> Result<ScenarioRestrictions> {
    if buffer.len() < 320 {
        return Err(ProvidenceError::message(format!(
            "Data RI is {} byte(s); expected 320 bytes",
            buffer.len()
        )));
    }
    Ok(ScenarioRestrictions {
        description: decode_pascal_text(&buffer[0..256]),
        max_party_characters: i16_be(buffer, 256),
        max_party_level: i16_be(buffer, 258),
        banned_races: buffer[260..290]
            .iter()
            .enumerate()
            .filter_map(|(index, value)| (*value != 0).then_some((index + 1) as u8))
            .collect(),
        banned_castes: buffer[290..320]
            .iter()
            .enumerate()
            .filter_map(|(index, value)| (*value != 0).then_some((index + 1) as u8))
            .collect(),
        authored: false,
        provenance: Some(provenance("Data RI", 0, 0, 320)),
    })
}

pub fn write_scenario_restrictions(restrictions: &ScenarioRestrictions) -> Result<Vec<u8>> {
    let mut output = vec![0u8; 320];
    encode_pascal_text(&mut output[0..256], &restrictions.description)?;
    write_i16_be(&mut output, 256, restrictions.max_party_characters);
    write_i16_be(&mut output, 258, restrictions.max_party_level);
    output[260..320].fill(0);
    for race in &restrictions.banned_races {
        if (1..=30).contains(race) {
            output[260 + *race as usize - 1] = 1;
        }
    }
    for caste in &restrictions.banned_castes {
        if (1..=30).contains(caste) {
            output[290 + *caste as usize - 1] = 1;
        }
    }
    Ok(output)
}

pub fn parse_global_macro_hooks(buffer: &[u8]) -> ScenarioGlobalMacroHooks {
    let mut slots = Vec::new();
    for slot in 0..7 {
        let door = if buffer.len() >= slot * 2 + 2 {
            i16_be(buffer, slot * 2)
        } else {
            0
        };
        slots.push(GlobalMacroHook {
            slot,
            label: global_macro_slot_label(slot).to_string(),
            door,
            source_backed: matches!(slot, 0 | 1 | 2 | 4 | 5),
            runtime_consumer: global_macro_slot_runtime_consumer(slot).to_string(),
        });
    }
    ScenarioGlobalMacroHooks {
        slots,
        authored: false,
        provenance: Some(provenance("Global", 0, 0, buffer.len())),
    }
}

pub fn write_global_macro_hooks(hooks: &ScenarioGlobalMacroHooks) -> Result<Vec<u8>> {
    let mut output = vec![0u8; GLOBAL_MACRO_HOOK_BYTES];
    for hook in &hooks.slots {
        if matches!(hook.slot, 0 | 1 | 2 | 4 | 5) {
            write_i16_be(&mut output, hook.slot * 2, hook.door);
        }
    }
    Ok(output)
}

fn global_macro_slot_label(slot: usize) -> &'static str {
    match slot {
        0 => "Start",
        1 => "Death",
        2 => "Quit",
        4 => "Shop",
        5 => "Temple",
        _ => "Reserved",
    }
}

fn global_macro_slot_runtime_consumer(slot: usize) -> &'static str {
    match slot {
        0 => "mainscreeninit/new-game start",
        1 => "partyloss death/revive path",
        2 => "end current game",
        4 => "shop button when a shop is available",
        5 => "shop/temple button when a temple is available",
        _ => "no source-backed runtime consumer found",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
        before
            .iter()
            .zip(after)
            .enumerate()
            .filter_map(|(offset, (before, after))| (before != after).then_some(offset))
            .collect()
    }

    #[test]
    fn scenario_records_follow_authoritative_ownership_boundaries() {
        let mut shell_input = vec![0u8; 320];
        shell_input[20] = 0x41;
        shell_input[319] = 0x5a;
        let shell = parse_scenario_shell("Scenario", &shell_input).unwrap();
        let shell_output = write_scenario_shell(&shell).unwrap();
        assert_eq!(shell_output.len(), 316);
        assert_eq!(shell_output[20], 0x41);
        assert!(shell_output[21..40].iter().all(|byte| *byte == 0));

        let mut support_input = vec![0u8; 600];
        support_input[23] = 2;
        support_input[599] = 0x5a;
        let support = parse_scenario_support_file("Scenario", &support_input).unwrap();
        let support_output = write_scenario_support_file(&support).unwrap();
        assert_eq!(support_output.len(), SCENARIO_SUPPORT_FILE_BYTES);
        assert_eq!(support_output[23], 2);
        assert!(support_output[24..].iter().all(|byte| *byte == 0));

        let mut global_input = vec![0u8; 60];
        global_input[1] = 7;
        global_input[59] = 0x5a;
        let hooks = parse_global_macro_hooks(&global_input);
        let global_output = write_global_macro_hooks(&hooks).unwrap();
        assert_eq!(&global_output[..2], &global_input[..2]);
        assert!(global_output[2..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn scenario_shell_contact_and_restrictions_round_trip() {
        let shell = ScenarioShell {
            source_file: "Tutorial".to_string(),
            rec_level: 5,
            max_level: 42,
            land_level: 1,
            look_x: 12,
            look_y: 34,
            creator_user: "Eric".to_string(),
            codeseg1: (0..20).collect(),
            codeseg2: (20..40).collect(),
            authored: true,
            provenance: None,
        };
        let shell_bytes = write_scenario_shell(&shell).unwrap();
        let parsed_shell = parse_scenario_shell("Tutorial", &shell_bytes).unwrap();
        assert_eq!(parsed_shell.rec_level, 5);
        assert_eq!(parsed_shell.max_level, 42);
        assert_eq!(parsed_shell.land_level, 1);
        assert_eq!(parsed_shell.look_x, 12);
        assert_eq!(parsed_shell.look_y, 34);
        assert_eq!(parsed_shell.creator_user, "Eric");
        assert_eq!(parsed_shell.codeseg1[19], 19);
        assert_eq!(parsed_shell.codeseg2[0], 20);

        let contact = ScenarioContactInfo {
            scenario_name: "New Scenario".to_string(),
            version: "1.0".to_string(),
            date: "2026".to_string(),
            author: "Providence".to_string(),
            email: "none".to_string(),
            web: "example".to_string(),
            fee: "free".to_string(),
            pay_info: vec![
                "A".to_string(),
                "B".to_string(),
                "C".to_string(),
                "D".to_string(),
                "E".to_string(),
            ],
            titles: vec![
                "T1".to_string(),
                "T2".to_string(),
                "T3".to_string(),
                "T4".to_string(),
                "T5".to_string(),
            ],
            description: "Description".to_string(),
            authored: true,
            provenance: None,
        };
        let contact_bytes = write_scenario_contact_info(&contact).unwrap();
        let parsed_contact = parse_scenario_contact_info(&contact_bytes).unwrap();
        assert_eq!(parsed_contact.scenario_name, "New Scenario");
        assert_eq!(parsed_contact.pay_info[2], "C");
        assert_eq!(parsed_contact.titles[4], "T5");
        assert_eq!(parsed_contact.description, "Description");

        let restrictions = ScenarioRestrictions {
            description: "No giants".to_string(),
            max_party_characters: 4,
            max_party_level: 20,
            banned_races: vec![1, 30],
            banned_castes: vec![2, 29],
            authored: true,
            provenance: None,
        };
        let restrictions_bytes = write_scenario_restrictions(&restrictions).unwrap();
        let parsed_restrictions = parse_scenario_restrictions(&restrictions_bytes).unwrap();
        assert_eq!(parsed_restrictions.description, "No giants");
        assert_eq!(parsed_restrictions.max_party_characters, 4);
        assert_eq!(parsed_restrictions.max_party_level, 20);
        assert_eq!(parsed_restrictions.banned_races, vec![1, 30]);
        assert_eq!(parsed_restrictions.banned_castes, vec![2, 29]);
    }

    #[test]
    fn scenario_startup_shell_writer_compiles_only_the_semantic_core() {
        let mut input = vec![0u8; 320];
        input[60] = 1;
        input[61] = b'A';
        input[316..320].copy_from_slice(&[0x11, 0x22, 0x33, 0x44]);

        let mut shell = parse_scenario_shell("Startup", &input).unwrap();
        shell.authored = true;
        shell.rec_level = 0x01020304;
        shell.creator_user = "Go".to_string();

        let output = write_scenario_shell(&shell).unwrap();

        assert_eq!(output.len(), 316);
        assert_eq!(&output[0..4], &[1, 2, 3, 4]);
        assert_eq!(&output[20..40], &input[20..40]);
        assert_eq!(&output[40..60], &input[40..60]);
        assert_eq!(&output[60..63], &[2, b'G', b'o']);
        assert!(output[63..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn scenario_support_file_decodes_divinity_string_sound_evidence_fields() {
        let mut input = vec![0u8; 600];
        input[23] = 2;
        write_i16_be(&mut input, 38, 143);

        let support = parse_scenario_support_file("Scenario", &input).unwrap();

        assert_eq!(support.divinity_string_editor_slot, Some(2));
        assert_eq!(support.divinity_string_sound_id, Some(143));
    }

    #[test]
    fn scenario_support_file_compiles_bounded_editor_state_without_raw_identity() {
        let mut input = vec![0u8; 600];
        input[23] = 2;
        write_i16_be(&mut input, 38, 143);
        input[429] = 0x44;

        let mut support = parse_scenario_support_file("Scenario", &input).unwrap();
        support.authored = true;
        support.divinity_string_editor_slot = Some(3);
        support.divinity_string_sound_id = Some(145);

        let output = write_scenario_support_file(&support).unwrap();

        assert_eq!(output.len(), SCENARIO_SUPPORT_FILE_BYTES);
        assert_eq!(output[23], 3);
        assert_eq!(i16_be(&output, 38), 145);
        assert!(output[..23].iter().all(|byte| *byte == 0));
        assert!(output[24..38].iter().all(|byte| *byte == 0));
        assert!(output[40..].iter().all(|byte| *byte == 0));
    }

    #[test]
    fn fixed_record_scenario_shell_writers_mutate_only_owned_fields() {
        let contact_input = vec![0u8; 4608];
        let mut contact = parse_scenario_contact_info(&contact_input).unwrap();
        contact.authored = true;
        contact.scenario_name = "Go".to_string();
        let contact_output = write_scenario_contact_info(&contact).unwrap();
        assert_eq!(contact_output.len(), contact_input.len());
        assert_eq!(
            changed_offsets(&contact_input, &contact_output),
            vec![0, 1, 2]
        );

        let restrictions_input = vec![0u8; 320];
        let mut restrictions = parse_scenario_restrictions(&restrictions_input).unwrap();
        restrictions.authored = true;
        restrictions.description = "No".to_string();
        restrictions.max_party_characters = 0x0102;
        restrictions.max_party_level = 0x0304;
        restrictions.banned_races = vec![1, 30];
        restrictions.banned_castes = vec![2];
        let restrictions_output = write_scenario_restrictions(&restrictions).unwrap();
        assert_eq!(restrictions_output.len(), restrictions_input.len());
        assert_eq!(
            changed_offsets(&restrictions_input, &restrictions_output),
            vec![0, 1, 2, 256, 257, 258, 259, 260, 289, 291]
        );
    }

    #[test]
    fn global_macro_hooks_compile_only_source_backed_slots() {
        let mut input = vec![0u8; 60];
        write_i16_be(&mut input, 6, 0x1111);

        let mut hooks = parse_global_macro_hooks(&input);
        assert!(!hooks.slots[3].source_backed);
        assert!(hooks.slots[4].source_backed);
        hooks.authored = true;
        hooks.slots[0].door = 0x0102;
        hooks.slots[4].door = 0x0304;

        let output = write_global_macro_hooks(&hooks).unwrap();
        assert_eq!(output.len(), input.len());
        assert_eq!(i16_be(&output, 6), 0);
        assert_eq!(changed_offsets(&input, &output), vec![0, 1, 6, 7, 8, 9]);
    }
}
