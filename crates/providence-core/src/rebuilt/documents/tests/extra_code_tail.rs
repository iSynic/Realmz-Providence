use super::*;
use crate::model::{ClassicSourceBlob, ExtraCodeRow, NativeRecordId};

#[test]
fn extra_code_tail_guard_tracks_native_output_after_appending_complete_rows() {
    for appended in [Some(1), Some(4), None] {
        check_tail_position(appended, false);
    }
    check_tail_position(None, true);
}

fn check_tail_position(appended: Option<u32>, edit_first: bool) {
    let source = [vec![0; 10], vec![0xde, 0xad, 0xbe, 0xef, 0x12, 0x34]].concat();
    let mut project = snapshot();
    project.origin = ProjectOrigin::Imported {
        compatibility_annex: BlobId(format!("sha256:{}", "a".repeat(64))),
    };
    project.classic_sources.push(ClassicSourceBlob {
        native_path: "Data EDCD".into(),
        blob: BlobId(format!("sha256:{}", sha256_hex(&source))),
        byte_length: source.len() as u64,
    });
    add_tail_requests(&mut project);
    if let Some(id) = appended {
        project.extra_codes.push(ExtraCodeRow {
            native_id: NativeRecordId(id),
            values: [1, 2, 3, 4, 5],
        });
    }
    if edit_first {
        project.extra_codes[0].values[0] = 1234;
    }
    let native = crate::codecs::encode_extra_codes(&project.extra_codes, Some(&source)).unwrap();
    assert_eq!(&native[native.len() - 6..], &source[10..]);
    assert_eq!(
        &native[..10],
        &project.extra_codes[0].values.map(i16::to_be_bytes).concat()
    );
    if appended.is_none() && !edit_first {
        assert_eq!(native, source);
    }
    let artifact = compile_rebuilt_document_set(&project, &compiler(), &[]).unwrap();
    let scenario: RebuiltV3ScenarioDocument =
        serde_json::from_slice(&artifact.scenario_json).unwrap();
    let tail = scenario.extra_code_tail.as_ref().unwrap();
    assert_eq!(tail.available_bytes, 6);
    assert_eq!(
        tail.row_id,
        (native.len() as u64 - tail.available_bytes) / 10
    );
    assert_eq!(artifact.manifest.manifest.schema_version, 6);
    check_consumption_guards(&scenario, appended.unwrap_or(0) as i16);
    assert_eq!(project.classic_sources[0].byte_length, source.len() as u64);
}

fn check_consumption_guards(scenario: &RebuiltV3ScenarioDocument, complete_row: i16) {
    let tail = scenario.extra_code_tail.as_ref().unwrap();
    let instruction = |opcode, id| crate::rebuilt::RebuiltV3ClassicInstruction {
        kind: crate::rebuilt::RebuiltV3InstructionKind::ClassicAction,
        slot: 0,
        raw_opcode: opcode,
        opcode,
        id,
        gosub: false,
        extra_code: None,
    };
    assert_eq!(
        scenario.incomplete_extra_code_for(&instruction(17, complete_row)),
        None
    );
    assert_eq!(
        scenario.incomplete_extra_code_for(&instruction(17, tail.row_id as i16)),
        Some(tail)
    );
    assert_eq!(
        scenario.incomplete_extra_code_for(&instruction(92, tail.row_id as i16 - 1)),
        Some(tail)
    );
    assert_eq!(
        scenario.incomplete_extra_code_for(&instruction(1, tail.row_id as i16)),
        None
    );
}
