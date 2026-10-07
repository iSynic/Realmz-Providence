//! Spell authoring owns its complete new table and only the encoded name-resource overlay.
use super::*;
use crate::codecs::{
    SCENARIO_SPELL_BYTES, SCENARIO_SPELL_RECORDS, encode_scenario_spell_name_resources,
    encode_scenario_spells,
};
use crate::compiler::ClassicOwnedResourceEdit;

pub(super) fn allocate_binary(
    snapshot: &ProjectSnapshot,
    manifest: &NativeManifest,
    baseline: &mut BTreeMap<String, Vec<u8>>,
    transitions: &mut Vec<ClassicOwnedFileTransition>,
) -> Result<(), ClassicOwnedEditCertificationError> {
    let path = "Data Spell";
    if baseline.contains_key(path) {
        return Ok(());
    }
    let Some(output) = manifest.get(path) else {
        return Ok(());
    };
    let rows = &snapshot.scenario_spells;
    if rows.len() != SCENARIO_SPELL_RECORDS
        || !rows.iter().any(|row| row.definition.authored)
        || rows.iter().any(|row| row.source_blob.is_some())
        || output.bytes.len() != SCENARIO_SPELL_BYTES
    {
        return Err(outside(path));
    }
    let encoded = encode_scenario_spells(rows, None)
        .map_err(|error| ClassicOwnedEditCertificationError::Compile(error.into()))?;
    if encoded != output.bytes {
        return Err(outside(path));
    }
    baseline.insert(path.into(), vec![0; SCENARIO_SPELL_BYTES]);
    transitions.push(ClassicOwnedFileTransition {
        from_path: None,
        to_path: path.into(),
        before_bytes: 0,
        after_bytes: output.bytes.len(),
    });
    Ok(())
}

pub(super) fn certify_names(
    snapshot: &ProjectSnapshot,
    manifest: &NativeManifest,
    baseline: &mut BTreeMap<String, Vec<u8>>,
    transitions: &mut Vec<ClassicOwnedFileTransition>,
) -> Result<Vec<ClassicOwnedResourceEdit>, ClassicOwnedEditCertificationError> {
    let path = "Data Spell.rsrc";
    let Some(output) = manifest.get(path) else {
        return Ok(Vec::new());
    };
    let original = baseline.get(path);
    if original == Some(&output.bytes) {
        return Ok(Vec::new());
    }
    let rows = &snapshot.scenario_spells;
    if !rows.iter().any(|row| row.name_authored) {
        return Err(outside(path));
    }
    validate_name_source(snapshot, original.is_some())?;
    let encoded = encode_scenario_spell_name_resources(rows, original.map(Vec::as_slice))
        .map_err(|error| ClassicOwnedEditCertificationError::Compile(error.into()))?;
    if encoded != output.bytes {
        return Err(outside(path));
    }
    let before_bytes = original.map_or(0, Vec::len);
    if original.is_none() {
        transitions.push(ClassicOwnedFileTransition {
            from_path: None,
            to_path: path.into(),
            before_bytes: 0,
            after_bytes: encoded.len(),
        });
    }
    let resource_keys = rows
        .iter()
        .filter(|row| row.name_authored)
        .map(|row| format!("STR#:{}", 5000 + row.definition.record_index / 15))
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    let edit = ClassicOwnedResourceEdit {
        native_path: path.into(),
        resource_keys,
        before_bytes,
        after_bytes: encoded.len(),
    };
    baseline.insert(path.into(), encoded);
    Ok(vec![edit])
}

fn validate_name_source(
    snapshot: &ProjectSnapshot,
    original_present: bool,
) -> Result<(), ClassicOwnedEditCertificationError> {
    let path = "Data Spell.rsrc";
    let rows = &snapshot.scenario_spells;
    let blob = rows.first().and_then(|row| row.text_source_blob.as_ref());
    if rows.iter().any(|row| row.text_source_blob.as_ref() != blob) {
        return Err(outside(path));
    }
    if let Some(blob) = blob {
        let sources = snapshot
            .classic_sources
            .iter()
            .filter(|source| source.native_path == path)
            .collect::<Vec<_>>();
        if sources.len() != 1 || &sources[0].blob != blob || !original_present {
            return Err(outside(path));
        }
    } else if original_present {
        return Err(outside(path));
    }
    Ok(())
}

fn outside(path: &str) -> ClassicOwnedEditCertificationError {
    ClassicOwnedEditCertificationError::OutsideDeclaredOwnership(vec![path.into()])
}

#[cfg(test)]
mod tests;
