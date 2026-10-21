//! Preserve the bundled baseline's reviewed movement projection during record regeneration.
use std::collections::{BTreeMap, BTreeSet};

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

// Identity, native words, triggers, random slots, features and artwork are not
// movement-profile corrections. They remain the newly compiled source facts.
const MOVEMENT_COLUMNS: [usize; 6] = [1, 2, 3, 6, 11, 12];

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WorldProjection {
    pub before_sha256: String,
    pub after_sha256: String,
    pub baseline_world_sha256: String,
    pub baseline_archive_sha256: String,
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(crate) fn apply(
    receipt: &WorldProjection,
    current_bytes: &[u8],
    baseline_bytes: &[u8],
    baseline_archive: &[u8],
) -> Result<(Value, usize), String> {
    if hash(current_bytes) != receipt.before_sha256
        || hash(baseline_bytes) != receipt.baseline_world_sha256
        || hash(baseline_archive) != receipt.baseline_archive_sha256
    {
        return Err("Movement projection input identity differs".into());
    }
    let mut current: Value = serde_json::from_slice(current_bytes).map_err(|e| e.to_string())?;
    let baseline: Value = serde_json::from_slice(baseline_bytes).map_err(|e| e.to_string())?;
    let changes = retain_movement(&mut current, &baseline)?;
    let output = serde_json::to_vec(&current).map_err(|e| e.to_string())?;
    if hash(&output) != receipt.after_sha256 {
        return Err("Movement projection result identity differs".into());
    }
    Ok((current, changes))
}

fn retain_movement(current: &mut Value, baseline: &Value) -> Result<usize, String> {
    let mut old_by_id = BTreeMap::new();
    for map in baseline["maps"].as_array().ok_or("Baseline maps missing")? {
        let id = map["id"].as_str().ok_or("Baseline map identity missing")?;
        if old_by_id.insert(id, map).is_some() {
            return Err("Duplicate baseline map".into());
        }
    }
    let maps = current["maps"]
        .as_array_mut()
        .ok_or("Current maps missing")?;
    if maps.len() != old_by_id.len() {
        return Err("Movement projection map inventory differs".into());
    }
    let mut seen = BTreeSet::new();
    let mut changes = 0;
    for map in maps {
        let id = map["id"]
            .as_str()
            .ok_or("Current map identity missing")?
            .to_owned();
        if !seen.insert(id.clone()) {
            return Err("Duplicate current map".into());
        }
        let old = old_by_id
            .get(id.as_str())
            .ok_or("Movement projection map missing")?;
        changes += retain_map_movement(map, old, &id)?;
    }
    Ok(changes)
}

fn retain_map_movement(map: &mut Value, old: &Value, id: &str) -> Result<usize, String> {
    let mut changes = 0;
    for key in [
        "id",
        "width",
        "height",
        "levelType",
        "levelIndex",
        "classicTileValues",
        "topologyFormat",
    ] {
        if map.get(key).is_none() || map[key] != old[key] {
            return Err(format!(
                "Movement projection cannot change native map {id}:{key}"
            ));
        }
    }
    let old_cells = old["cells"].as_array().ok_or("Baseline cells missing")?;
    let cells = map["cells"].as_array_mut().ok_or("Current cells missing")?;
    if cells.len() != old_cells.len() {
        return Err("Movement projection cell count differs".into());
    }
    for (cell, old_cell) in cells.iter_mut().zip(old_cells) {
        let row = cell.as_array_mut().ok_or("Current cell tuple missing")?;
        let old_row = old_cell.as_array().ok_or("Baseline cell tuple missing")?;
        if row.len() != 13 || old_row.len() != 13 {
            return Err("Movement projection cell shape differs".into());
        }
        for index in MOVEMENT_COLUMNS {
            if row[index] != old_row[index] {
                row[index] = old_row[index].clone();
                changes += 1;
            }
        }
    }
    if map.get("boatReplacementProfiles").is_none() || old.get("boatReplacementProfiles").is_none()
    {
        return Err("Movement projection boat profiles missing".into());
    }
    if map["boatReplacementProfiles"] != old["boatReplacementProfiles"] {
        map["boatReplacementProfiles"] = old["boatReplacementProfiles"].clone();
        changes += 1;
    }
    Ok(changes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn world(cost: i32, raw: i32, random: &str) -> Value {
        json!({"maps":[{"id":"land:0","width":1,"height":1,"levelType":"land",
            "levelIndex":0,"topologyFormat":"realmz2.compact-cell-rows.v2","classicTileValues":[raw],
            "boatReplacementProfiles":null,"randomRectangles":[random],
            "cells":[["terrain",cost,1,82,["ap"],[random],["edges"],["feature"],1,"tiles","overlay",0,3]]}]})
    }

    #[test]
    fn movement_retention_keeps_new_records_and_requires_identical_native_maps() {
        let baseline = world(3, -63, "old");
        let mut candidate = world(2, -63, "native-slot");
        assert_eq!(retain_movement(&mut candidate, &baseline).unwrap(), 1);
        assert_eq!(candidate["maps"][0]["cells"][0][1], 3);
        assert_eq!(candidate["maps"][0]["cells"][0][5][0], "native-slot");
        assert_eq!(candidate["maps"][0]["randomRectangles"][0], "native-slot");
        assert_eq!(candidate["maps"][0]["cells"][0][4][0], "ap");
        assert!(retain_movement(&mut world(2, -64, "native-slot"), &baseline).is_err());
        let mut duplicate = world(2, -63, "native-slot");
        let repeated = duplicate["maps"][0].clone();
        duplicate["maps"].as_array_mut().unwrap().push(repeated);
        assert!(retain_movement(&mut candidate, &duplicate).is_err());
    }

    #[test]
    fn every_input_and_result_is_hash_pinned() {
        let current = serde_json::to_vec(&world(2, -63, "native-slot")).unwrap();
        let baseline = serde_json::to_vec(&world(3, -63, "old")).unwrap();
        let expected = serde_json::to_vec(&world(3, -63, "native-slot")).unwrap();
        let mut receipt = WorldProjection {
            before_sha256: hash(&current),
            after_sha256: hash(&expected),
            baseline_world_sha256: hash(&baseline),
            baseline_archive_sha256: hash(b"archive"),
        };
        assert!(apply(&receipt, &current, &baseline, b"archive").is_ok());
        assert!(apply(&receipt, &current, &baseline, b"stale").is_err());
        receipt.after_sha256 = "0".repeat(64);
        assert!(apply(&receipt, &current, &baseline, b"archive").is_err());
    }
}
