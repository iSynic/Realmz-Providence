//! Editor LOS highlights are derived hints, not runtime visibility simulation.
use crate::{
    map_paint::terrain_tile,
    model::{MapCoordinate, MapLevel, ProjectSnapshot},
};

pub fn blocking_cells(snapshot: &ProjectSnapshot, map: &MapLevel) -> Vec<MapCoordinate> {
    let landlook = map.runtime.as_ref().and_then(|runtime| runtime.landlook);
    map.tiles
        .iter()
        .enumerate()
        .filter_map(|(index, &word)| {
            let tile = terrain_tile(word)? as i16;
            let profile = snapshot
                .terrain_catalog
                .iter()
                .find(|profile| profile.tile == tile && profile.landlook == landlook)
                .or_else(|| {
                    snapshot
                        .terrain_catalog
                        .iter()
                        .find(|profile| profile.tile == tile && profile.landlook.is_none())
                })?;
            profile.blocks_los.then_some(MapCoordinate {
                x: (index % 90) as u8,
                y: (index / 90) as u8,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        codecs::{MAPSTATS_CORE_BYTES, decode_landlook_mapstats},
        model::{BlobId, LevelType, StableId},
        session::{EditorCommand, EditorSession, ExpectedRevisionCommand, Revision},
    };

    #[test]
    fn editor_preview_uses_exact_landlook_metadata_preserves_marker_bands_and_does_not_guess_unknown_tiles()
     {
        let mut session =
            EditorSession::new(ProjectSnapshot::new_authored(StableId("preview".into())));
        session
            .execute(ExpectedRevisionCommand {
                expected_revision: Revision(0),
                command: EditorCommand::CreateMap {
                    level_type: LevelType::Land,
                },
            })
            .unwrap();
        let mut snapshot = session.snapshot().clone();
        let mut bytes = vec![0; MAPSTATS_CORE_BYTES];
        bytes[3 * 40 + 12..3 * 40 + 14].copy_from_slice(&1i16.to_be_bytes());
        snapshot.terrain_catalog =
            decode_landlook_mapstats(&bytes, 0, "preview fixture", BlobId("f".repeat(64)))
                .unwrap()
                .profiles;
        let map = &mut snapshot.world.maps[0];
        map.tiles[0] = 3;
        map.tiles[1] = 1003;
        map.tiles[2] = 0x6000 | 2003;
        map.tiles[3] = -3;
        map.tiles[4] = 205;
        let before = snapshot.clone();
        assert_eq!(
            blocking_cells(&snapshot, &snapshot.world.maps[0]),
            vec![
                MapCoordinate { x: 0, y: 0 },
                MapCoordinate { x: 1, y: 0 },
                MapCoordinate { x: 2, y: 0 }
            ]
        );
        assert_eq!(snapshot, before);
        snapshot.world.maps[0].runtime.as_mut().unwrap().landlook = Some(9);
        assert!(blocking_cells(&snapshot, &snapshot.world.maps[0]).is_empty());
    }
}
