use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::model::{ClassicAction, ExtraCodeRow, StableId};

use super::{
    REBUILT_V3_SCHEMA_SHA256, RebuiltV3ClassicInstruction,
    canonical::canonical_json_bytes,
    scenario::{extra_code_index, instructions_projection},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActionRuntimeContract {
    contract_version: u32,
    schema_version: u32,
    schema_hash: String,
    owner: String,
    source_actions: Vec<ClassicAction>,
    extra_code_rows: Vec<ExtraCodeRow>,
    expected_instructions: Vec<RebuiltV3ClassicInstruction>,
    expected_projection_sha256: String,
    runtime_expectations: Vec<RuntimeExpectation>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeExpectation {
    opcode: i16,
    case_id: String,
    corrected_behavior: String,
}

fn fixture() -> ActionRuntimeContract {
    serde_json::from_str(include_str!(
        "fixtures/corrected-action-runtime-contract-v1.json"
    ))
    .expect("corrected action runtime contract fixture")
}

#[test]
fn corrected_action_contract_projects_exact_schema_v3_operands() {
    let fixture = fixture();
    assert_eq!(fixture.contract_version, 1);
    assert_eq!(fixture.schema_version, 3);
    assert_eq!(fixture.schema_hash, REBUILT_V3_SCHEMA_SHA256);

    let extra_codes = extra_code_index(&fixture.extra_code_rows).expect("unique fixture rows");
    let actual = instructions_projection(
        &StableId(fixture.owner),
        &fixture.source_actions,
        &extra_codes,
    )
    .expect("settled actions project to Rebuilt schema v3");
    assert_eq!(actual, fixture.expected_instructions);

    let canonical = canonical_json_bytes(&actual).expect("canonical instruction JSON");
    let digest = format!("{:x}", Sha256::digest(canonical));
    assert_eq!(digest, fixture.expected_projection_sha256);
}

#[test]
fn runtime_expectations_cover_only_the_providence_authored_contract_set() {
    let fixture = fixture();
    let mut projected = fixture
        .expected_instructions
        .iter()
        .map(|instruction| instruction.opcode)
        .collect::<Vec<_>>();
    projected.sort_unstable();

    let mut described = fixture
        .runtime_expectations
        .iter()
        .map(|expectation| {
            assert!(!expectation.case_id.trim().is_empty());
            assert!(!expectation.corrected_behavior.trim().is_empty());
            expectation.opcode
        })
        .collect::<Vec<_>>();
    described.sort_unstable();

    assert_eq!(projected, [52, 55, 68, 81, 90]);
    assert_eq!(described, projected);
}
