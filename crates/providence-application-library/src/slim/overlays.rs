use serde_json::Value;
use std::collections::BTreeMap;

pub(super) fn rewrite_strings(value: &mut Value, replacements: &BTreeMap<String, String>) -> usize {
    match value {
        Value::String(current) => replacements
            .get(current)
            .map(|replacement| {
                *current = replacement.clone();
                1
            })
            .unwrap_or(0),
        Value::Array(values) => values
            .iter_mut()
            .map(|value| rewrite_strings(value, replacements))
            .sum(),
        Value::Object(values) => values
            .values_mut()
            .map(|value| rewrite_strings(value, replacements))
            .sum(),
        _ => 0,
    }
}

pub(super) fn restore_land_overlay_references(
    world: &mut Value,
    scenario_cicn_identities: &BTreeMap<i64, String>,
) -> Result<usize, String> {
    let base_tiles = world
        .get("battleTerrainSets")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|set| {
            Some((
                set.get("id")?.as_str()?.to_string(),
                set.get("baseTile")?.as_i64()?,
            ))
        })
        .collect::<BTreeMap<_, _>>();
    let Some(maps) = world.get_mut("maps").and_then(Value::as_array_mut) else {
        return Ok(0);
    };
    let mut restored = 0;
    for map in maps {
        restored += restore_map_overlay(map, &base_tiles, scenario_cicn_identities)?;
    }
    Ok(restored)
}

fn restore_map_overlay(
    map: &mut Value,
    base_tiles: &BTreeMap<String, i64>,
    scenario_cicn_identities: &BTreeMap<i64, String>,
) -> Result<usize, String> {
    if map.get("levelType").and_then(Value::as_str) != Some("land") {
        return Ok(0);
    }
    let map_id = map
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let terrain_set_id = map
        .get("metadata")
        .and_then(|metadata| metadata.get("battleTerrainSetId"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let base_tile = base_tiles.get(terrain_set_id).copied();
    let Some(cells) = map.get_mut("cells").and_then(Value::as_array_mut) else {
        return Ok(0);
    };
    let base_profile = base_tile.and_then(|tile| {
        cells.iter().find_map(|cell| {
            let values = cell.as_array()?;
            (values.len() > 12 && values[8].as_i64() == Some(tile)).then(|| values.clone())
        })
    });
    let mut restored = 0;
    for cell in cells {
        restored += usize::from(restore_cell_overlay(
            cell,
            &base_profile,
            scenario_cicn_identities,
            &map_id,
        )?);
    }
    Ok(restored)
}

#[cfg(test)]
#[path = "overlay_tests.rs"]
mod tests;

fn restore_cell_overlay(
    cell: &mut Value,
    base_profile: &Option<Vec<Value>>,
    identities: &BTreeMap<i64, String>,
    map_id: &str,
) -> Result<bool, String> {
    let Some(values) = cell.as_array_mut() else {
        return Ok(false);
    };
    if values.len() <= 10 || !values[10].is_null() {
        return Ok(false);
    }
    let Some(terrain_id) = values[0]
        .as_str()
        .and_then(|id| id.strip_prefix("classic.terrain."))
        .and_then(|id| id.parse::<i64>().ok())
    else {
        return Ok(false);
    };
    if (0..=200).contains(&terrain_id) {
        return Ok(false);
    }
    if let Some(identity) = identities.get(&terrain_id) {
        if values.len() < 13 {
            return Err(format!(
                "land map {map_id} has scenario CICN {terrain_id} in a cell with {} fields; overlay restoration requires at least 13",
                values.len()
            ));
        }
        let Some(profile) = base_profile else {
            return Err(format!(
                "land map {map_id} has scenario CICN {terrain_id} but no reusable base-terrain profile"
            ));
        };
        for index in [0, 1, 2, 3, 6, 8, 9, 11, 12] {
            values[index] = profile[index].clone();
        }
        values[10] = Value::String(identity.clone());
        return Ok(true);
    }
    Ok(false)
}
