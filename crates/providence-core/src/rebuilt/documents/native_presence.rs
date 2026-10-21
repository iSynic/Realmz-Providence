//! Original complete rows cannot become authored absence in an older imported model.
use crate::{
    codecs::CODEC_REGISTRY,
    model::{LevelType, ProjectSnapshot},
};
use std::collections::{BTreeMap, BTreeSet};

pub(super) fn validate(
    snapshot: &ProjectSnapshot,
    sources: &BTreeMap<String, Vec<u8>>,
) -> Result<(), String> {
    for (path, ids) in program_rows(snapshot)
        .into_iter()
        .chain(catalog_rows(snapshot))
    {
        require_rows(path, sources, ids)?;
    }
    for set in &snapshot.monster_sets {
        require_rows(
            &set.native_path,
            sources,
            set.monsters
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        )?;
    }
    for path in ["Data MD", "Data MD-1", "Data MD1"] {
        if sources.contains_key(path)
            && !snapshot
                .monster_sets
                .iter()
                .any(|set| set.native_path == path)
        {
            require_rows(path, sources, Vec::new())?;
        }
    }
    Ok(())
}

fn program_rows(snapshot: &ProjectSnapshot) -> Vec<(&'static str, Vec<u64>)> {
    let ap_ids = |kind| {
        snapshot
            .world
            .action_points
            .iter()
            .filter(|row| row.level_type == kind)
            .map(|row| u64::from(row.level_index) * 100 + u64::from(row.record_index))
            .collect()
    };
    vec![
        ("Data DD", ap_ids(LevelType::Land)),
        ("Data DDD", ap_ids(LevelType::Dungeon)),
        (
            "Data ED3",
            snapshot
                .extra_action_points
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        ),
        (
            "Data ED",
            snapshot
                .simple_encounters
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        ),
        (
            "Data ED2",
            snapshot
                .complex_encounters
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        ),
        (
            "Data EDCD",
            snapshot
                .extra_codes
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        ),
    ]
}

fn catalog_rows(snapshot: &ProjectSnapshot) -> Vec<(&'static str, Vec<u64>)> {
    vec![
        (
            "Data SD",
            snapshot
                .shops
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        ),
        (
            "Data TD3",
            snapshot
                .timed_encounters
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        ),
        (
            "Data BD",
            snapshot
                .battles
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        ),
        (
            "Data TD",
            snapshot
                .treasures
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        ),
        (
            "Data TD2",
            snapshot
                .rogue_encounters
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        ),
        (
            "Data SD2",
            snapshot
                .messages
                .iter()
                .map(|row| u64::from(row.native_id.0))
                .collect(),
        ),
    ]
}

fn require_rows(
    path: &str,
    sources: &BTreeMap<String, Vec<u8>>,
    ids: Vec<u64>,
) -> Result<(), String> {
    let Some(bytes) = sources.get(path) else {
        return if ids.is_empty() {
            Ok(())
        } else {
            Err(format!(
                "{path} has model records but no effective native source representation. First-family native authoring is not implemented for imported v7 export. Save this project to retain your edits; use a separate fresh authored project or explicitly import an existing native family in a separate project for comparison."
            ))
        };
    };
    let codec = CODEC_REGISTRY
        .iter()
        .find(|codec| codec.native_path == path)
        .ok_or_else(|| format!("native row preservation has no registered geometry for {path}"))?;
    let present = ids.into_iter().collect::<BTreeSet<_>>();
    if let Some(id) =
        (0..(bytes.len() / codec.record_bytes) as u64).find(|id| !present.contains(id))
    {
        return Err(format!(
            "{path} supplied native row {id} is absent from this model: a model/import preservation defect. Keep this project and its authored edits; explicitly reimport the source into a separate project for comparison."
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{ProjectSnapshot, StableId};

    #[test]
    fn complete_rows_require_model_presence_but_a_fragment_does_not_invent_a_row() {
        let mut snapshot = ProjectSnapshot::new_authored(StableId("presence".into()));
        let stride = crate::codecs::SHOP_RECORD_BYTES;
        let mut sources = BTreeMap::from([("Data SD".into(), vec![0; stride * 2 + 3])]);
        snapshot.shops = crate::codecs::decode_shops(&sources["Data SD"]).records;
        validate(&snapshot, &sources).unwrap();
        snapshot.shops.pop();
        assert!(
            validate(&snapshot, &sources)
                .unwrap_err()
                .contains("native row 1")
        );
        sources.insert("Data SD".into(), vec![0; stride - 1]);
        snapshot.shops.clear();
        validate(&snapshot, &sources).unwrap();
    }
}
