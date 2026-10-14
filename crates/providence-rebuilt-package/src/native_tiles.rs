use providence_core::rebuilt::RebuiltV3WorldDocument;

use crate::RebuiltV3ArchiveError;

pub(crate) fn validate_presence(
    version: u8,
    world: &serde_json::Value,
) -> Result<(), RebuiltV3ArchiveError> {
    if version < 6
        && world["maps"].as_array().is_some_and(|maps| {
            maps.iter().any(|map| {
                map.as_object()
                    .is_some_and(|object| object.contains_key("classicTileValues"))
            })
        })
    {
        return Err(RebuiltV3ArchiveError::InvalidDocument {
            path: "world.json".into(),
            reason: "classicTileValues is not permitted before schema v6".into(),
        });
    }
    Ok(())
}

pub(crate) fn validate(
    version: u8,
    world: &RebuiltV3WorldDocument,
) -> Result<(), RebuiltV3ArchiveError> {
    for map in &world.maps {
        let expected = usize::from(map.width) * usize::from(map.height);
        let valid = match (version, &map.classic_tile_values) {
            (6, Some(values)) => values.len() == expected && expected != 0,
            (3..=5, None) => true,
            _ => false,
        };
        if !valid {
            return Err(RebuiltV3ArchiveError::InvalidDocument {
                path: "world.json".into(),
                reason: format!(
                    "map '{}' classicTileValues must be absent before v6 and complete in v6 (expected {expected} signed words)",
                    map.id.0
                ),
            });
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v6_requires_exact_signed_words_without_changing_legacy_contracts() {
        let values = vec![i16::MIN, -1158, 0, 3158, i16::MAX];
        let mut world: RebuiltV3WorldDocument = serde_json::from_value(serde_json::json!({
            "kind":"realmz2.world", "schemaVersion":6, "battleTerrainSets":[],
            "maps":[{"id":"land:0","name":"Native","levelType":"land","levelIndex":0,
                "width":5,"height":1,"metadata":{"dark":false,"usesLos":false,"landlook":0,"baseScale":1,"battleTerrainSetId":null},
                "topologyFormat":"realmz2.compact-cell-rows.v2","cells":[], "classicTileValues":values,
                "boatReplacementProfiles":null,"randomRectangles":[]}],
            "playerMaps":[],"triggers":[],"transitions":[],"landLayout":null,"timedEncounters":[]
        })).unwrap();
        assert!(validate(6, &world).is_ok());
        for version in 3..=5 {
            assert!(validate(version, &world).is_err());
        }
        world.maps[0].classic_tile_values.as_mut().unwrap().pop();
        assert!(validate(6, &world).is_err());
        world.maps[0].classic_tile_values = None;
        assert!(validate(6, &world).is_err());
        for version in 3..=5 {
            assert!(validate(version, &world).is_ok());
        }
        let explicit_null = serde_json::json!({"maps":[{"classicTileValues":null}]});
        for version in 3..=5 {
            assert!(validate_presence(version, &explicit_null).is_err());
        }
        assert!(serde_json::from_str::<Vec<i16>>("[32768]").is_err());
    }
}
