use super::{
    RebuiltV3ReachableOwnerError, RebuiltV3RuntimeCatalogKind, RebuiltV3RuntimeCatalogReference,
};
use crate::{model::StableId, rebuilt::RebuiltV3ScenarioDocument};
use std::collections::BTreeSet;

pub(super) fn derive_catalog_references(
    scenario: &RebuiltV3ScenarioDocument,
) -> Result<Vec<RebuiltV3RuntimeCatalogReference>, RebuiltV3ReachableOwnerError> {
    let mut references = BTreeSet::new();
    for program in &scenario.programs {
        for instruction in &program.instructions {
            if scenario.incomplete_extra_code_for(instruction).is_some() {
                continue;
            }
            let action = format!("actions[{}]", instruction.slot);
            match instruction.opcode {
                6 => add_reference(
                    &mut references,
                    &program.id,
                    6,
                    format!("{action}.targetNativeId"),
                    RebuiltV3RuntimeCatalogKind::Shop,
                    instruction.id,
                ),
                10 => add_reference(
                    &mut references,
                    &program.id,
                    10,
                    format!("{action}.targetNativeId"),
                    RebuiltV3RuntimeCatalogKind::Treasure,
                    instruction.id,
                ),
                48 | 51 | 73 => {
                    let extra_code = instruction
                        .extra_code
                        .as_deref()
                        .filter(|values| values.len() >= 5)
                        .ok_or_else(|| RebuiltV3ReachableOwnerError::MissingExtraCode {
                            program: program.id.clone(),
                            slot: instruction.slot,
                            opcode: instruction.opcode,
                            native_id: instruction.id,
                        })?;
                    let (kind, index, zero_is_sentinel) = match instruction.opcode {
                        48 => (RebuiltV3RuntimeCatalogKind::Treasure, 4, true),
                        51 | 73 => (RebuiltV3RuntimeCatalogKind::Shop, 0, false),
                        _ => unreachable!(),
                    };
                    if !zero_is_sentinel || extra_code[index] != 0 {
                        add_reference(
                            &mut references,
                            &program.id,
                            instruction.opcode,
                            format!("{action}.extraCode[{index}]"),
                            kind,
                            extra_code[index],
                        );
                    }
                }
                _ => {}
            }
        }
    }
    Ok(references.into_iter().collect())
}

fn add_reference(
    references: &mut BTreeSet<RebuiltV3RuntimeCatalogReference>,
    source: &StableId,
    runtime_opcode: i16,
    field_path: String,
    target_kind: RebuiltV3RuntimeCatalogKind,
    raw_native_id: i16,
) {
    references.insert(RebuiltV3RuntimeCatalogReference {
        source: source.clone(),
        runtime_opcode,
        field_path,
        target_kind,
        raw_native_id,
        target_native_id: i32::from(raw_native_id).unsigned_abs(),
    });
}
