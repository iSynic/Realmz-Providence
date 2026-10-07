use super::{ClassicCompatibilitySources, ClassicSliceCompileError, NativeManifest};
use crate::model::ProjectSnapshot;

pub(super) fn item_text(
    manifest: &NativeManifest,
    full_scenario: bool,
) -> Option<&super::ManifestEntry> {
    let scenario = manifest.get("Scenario.rsrc").filter(|source| {
        crate::codecs::parse_resource_entries_preserving_duplicates(&source.bytes).is_ok_and(
            |entries| {
                entries
                    .iter()
                    .any(|entry| entry.resource_type == *b"STR#" && (800..=802).contains(&entry.id))
            },
        )
    });
    if full_scenario {
        scenario
    } else {
        manifest.get("Data NI.rsrc").or(scenario)
    }
}

pub(super) fn preserve_unprojected(
    snapshot: &ProjectSnapshot,
    sources: ClassicCompatibilitySources<'_>,
    manifest: &mut NativeManifest,
) -> Result<(), ClassicSliceCompileError> {
    let Some(files) = sources.retained_files else {
        return Ok(());
    };
    for source in &snapshot.classic_sources {
        if manifest.get(&source.native_path).is_some()
            || !unprojected(snapshot, &source.native_path)
        {
            continue;
        }
        let bytes = files.get(&source.native_path).ok_or_else(|| {
            ClassicSliceCompileError::Compatibility(vec![format!(
                "preservation.source-missing: {}",
                source.native_path
            )])
        })?;
        if bytes.len() as u64 != source.byte_length {
            return Err(ClassicSliceCompileError::Compatibility(vec![format!(
                "preservation.source-length: {}",
                source.native_path
            )]));
        }
        manifest.insert_preserved(&source.native_path, source.blob.clone(), bytes.clone());
    }
    Ok(())
}

fn unprojected(snapshot: &ProjectSnapshot, path: &str) -> bool {
    match path {
        // These optional forks may contain unrelated resources even when their
        // corresponding text family is resolved through Scenario instead.
        "Data NI.rsrc" | "Data Spell.rsrc" => true,
        "Data Spell" => snapshot.scenario_spells.is_empty(),
        "Data Race" => !snapshot.race_rules.iter().any(|rule| {
            snapshot.classic_sources.iter().any(|source| {
                source.native_path == path && rule.source_blob.as_ref() == Some(&source.blob)
            })
        }),
        "Data Custom 1 BD" | "Data Custom 2 BD" | "Data Custom 3 BD" => true,
        _ => false,
    }
}
