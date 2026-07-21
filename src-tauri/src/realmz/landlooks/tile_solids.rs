use crate::error::{ProvidenceError, Result};
use crate::generated::native_manifest_policy::REALMZ_NATIVE_LAYOUT;
use crate::project::{
    TileAttributeConfidence, TileAttributeFlag, TileAttributeProfile, TileAttributeSourceKind,
    TileEditableScope,
};

pub const TILE_SOLIDS_BYTES: usize = REALMZ_NATIVE_LAYOUT.tile_solids_bytes;

pub(in crate::realmz) fn parse_tile_attributes(buffer: &[u8]) -> Vec<TileAttributeProfile> {
    buffer
        .iter()
        .take(TILE_SOLIDS_BYTES)
        .enumerate()
        .map(|(tile, solid_type)| TileAttributeProfile {
            tile: tile as i16,
            landlook: None,
            solid_type: Some(*solid_type as i16),
            movement_sound_id: None,
            movement_cost: None,
            shore: None,
            boat_requirement: None,
            path_flag: None,
            blocks_los: None,
            fly_float_required: None,
            forest_type: None,
            combat_build: Vec::new(),
            clear_land_id: None,
            base_tile: None,
            base_scale: None,
            editable_scope: TileEditableScope::SpecialTile,
            flags: if *solid_type == 0 {
                vec![TileAttributeFlag::Walkable]
            } else {
                vec![TileAttributeFlag::Solid]
            },
            confidence: TileAttributeConfidence::SourceBacked,
            source_kind: TileAttributeSourceKind::DataSolids,
            source: "Data Solids".to_string(),
        })
        .collect()
}

pub fn write_tile_solids(attributes: &[TileAttributeProfile]) -> Result<Vec<u8>> {
    let mut output = vec![0u8; TILE_SOLIDS_BYTES];
    let mut seen = [false; TILE_SOLIDS_BYTES];
    for attribute in attributes
        .iter()
        .filter(|attribute| matches!(attribute.source_kind, TileAttributeSourceKind::DataSolids))
    {
        let tile = usize::try_from(attribute.tile)
            .ok()
            .filter(|tile| *tile < TILE_SOLIDS_BYTES)
            .ok_or_else(|| {
                ProvidenceError::message(format!(
                    "Data Solids tile {} is outside the 0..{} table range.",
                    attribute.tile,
                    TILE_SOLIDS_BYTES - 1
                ))
            })?;
        if seen[tile] {
            return Err(ProvidenceError::message(format!(
                "Data Solids tile {} is defined more than once.",
                attribute.tile
            )));
        }
        seen[tile] = true;
        let semantic_value = match attribute.solid_type {
            Some(value) => Some(u8::try_from(value).map_err(|_| {
                ProvidenceError::message(format!(
                    "Data Solids tile {} solidity {} is outside the unsigned-byte range 0..255.",
                    attribute.tile, value
                ))
            })?),
            None => None,
        };
        output[tile] = semantic_value.unwrap_or(0);
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn changed_offsets(before: &[u8], after: &[u8]) -> Vec<usize> {
        before
            .iter()
            .zip(after.iter())
            .enumerate()
            .filter_map(|(offset, (left, right))| (left != right).then_some(offset))
            .collect()
    }

    #[test]
    fn data_solids_round_trip_from_tile_attributes() {
        let mut input = vec![0u8; TILE_SOLIDS_BYTES];
        input[35] = 1;
        input[190] = 2;
        input[998] = 1;
        let profiles = parse_tile_attributes(&input);
        let output = write_tile_solids(&profiles).unwrap();
        assert_eq!(output, input);
    }

    #[test]
    fn data_solids_mutates_only_selected_special_tile_solidity() {
        let input = vec![0u8; TILE_SOLIDS_BYTES];
        let mut profiles = parse_tile_attributes(&input);
        profiles[190].solid_type = Some(1);
        profiles[190].flags = vec![TileAttributeFlag::Solid];
        profiles[191].solid_type = None;

        let output = write_tile_solids(&profiles).unwrap();

        assert_eq!(changed_offsets(&input, &output), vec![190]);
        assert_eq!(output[190], 1);
        assert_eq!(output[191], 0);
    }

    #[test]
    fn data_solids_compiles_neutral_table_without_profiles() {
        assert_eq!(
            write_tile_solids(&[]).unwrap(),
            vec![0u8; TILE_SOLIDS_BYTES]
        );
    }

    #[test]
    fn data_solids_rejects_ambiguous_or_invalid_semantics() {
        let mut profiles = parse_tile_attributes(&[0]);
        profiles.push(profiles[0].clone());
        assert!(write_tile_solids(&profiles)
            .unwrap_err()
            .to_string()
            .contains("defined more than once"));

        profiles.pop();
        profiles[0].solid_type = Some(256);
        assert!(write_tile_solids(&profiles)
            .unwrap_err()
            .to_string()
            .contains("unsigned-byte range"));
    }
}
