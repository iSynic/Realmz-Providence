use super::{
    contracts::*,
    inputs::{cell_random_rectangle_ids, cell_trigger_ids, map_runtime},
    terrain::edge_flags,
};
use crate::{
    codecs::{DungeonCellProfile, decode_dungeon_cell},
    model::{CLASSIC_MAP_SIZE, MapLevel, MapRuntimeMetadata, ProjectSnapshot, StableId},
};

pub(super) fn project_dungeon_topology(
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
) -> Result<RebuiltV3Topology, RebuiltV3TopologyError> {
    let runtime = map_runtime(map)?;
    let mut cells = Vec::with_capacity(map.tiles.len());
    for y in 0..CLASSIC_MAP_SIZE {
        for x in 0..CLASSIC_MAP_SIZE {
            cells.push(dungeon_cell(snapshot, map, runtime, x, y));
        }
    }
    Ok(RebuiltV3Topology {
        id: map.identity.clone(),
        topology_format: "realmz2.compact-cell-rows.v2".into(),
        cells,
        boat_replacement_profiles: None,
    })
}

fn dungeon_cell(
    snapshot: &ProjectSnapshot,
    map: &MapLevel,
    runtime: &MapRuntimeMetadata,
    x: usize,
    y: usize,
) -> RebuiltV3CompactCell {
    let profile = decode_dungeon_cell(map.tiles[y * CLASSIC_MAP_SIZE + x]);
    let cell_id = StableId(format!("{}:cell:{x},{y}", map.identity.0));
    let door_id = (profile.horizontal_door || profile.vertical_door)
        .then(|| StableId(format!("{}:door", cell_id.0)));
    let base_open =
        !profile.wall || door_id.is_some() || profile.action_point_marker || profile.note_marker;
    let (edges, mut features) = directional_edges(&profile, &cell_id, &door_id, base_open);
    append_cell_features(&profile, &cell_id, &door_id, &mut features);
    let topology_flags = cell_flags(&profile, &door_id, base_open);
    RebuiltV3CompactCell(
        StableId(
            if profile.wall {
                "classic.dungeon.wall"
            } else {
                "classic.dungeon.floor"
            }
            .into(),
        ),
        1,
        topology_flags,
        None,
        cell_trigger_ids(snapshot, map, x, y),
        cell_random_rectangle_ids(runtime, x, y),
        edges,
        features,
        0,
        runtime.tileset_id.clone(),
        None,
        0,
        0,
    )
}

fn directional_edges(
    profile: &DungeonCellProfile,
    cell_id: &StableId,
    door_id: &Option<StableId>,
    base_open: bool,
) -> ([RebuiltV3CompactEdge; 4], Vec<RebuiltV3CompactFeature>) {
    let revealed = profile.revealed_secret;
    let directions = [
        ("north", profile.allow_move_north),
        ("east", profile.allow_move_east),
        ("south", profile.allow_move_south),
        ("west", profile.allow_move_west),
    ];
    let mut edges = Vec::with_capacity(4);
    let mut features = Vec::new();
    for (direction, secret_passage) in directions {
        let secret_id =
            secret_passage.then(|| StableId(format!("{}:secret:{direction}", cell_id.0)));
        let passable = base_open || secret_passage;
        let kind = if secret_passage {
            "secret"
        } else if door_id.is_some() {
            "door"
        } else if profile.visible_arch {
            "archway"
        } else if passable {
            "open"
        } else {
            "wall"
        };
        edges.push(RebuiltV3CompactEdge(
            kind.into(),
            edge_flags(
                passable,
                if secret_passage { !revealed } else { !passable },
                !secret_passage || revealed,
            ),
            door_id.clone(),
            secret_id.clone(),
        ));
        if let Some(secret_id) = secret_id {
            features.push(RebuiltV3CompactFeature(
                secret_id,
                "secret".into(),
                Some(if revealed { "revealed" } else { "hidden" }.into()),
                Some(direction.into()),
            ));
        }
    }
    (edges.try_into().expect("four dungeon directions"), features)
}

fn append_cell_features(
    profile: &DungeonCellProfile,
    cell_id: &StableId,
    door_id: &Option<StableId>,
    features: &mut Vec<RebuiltV3CompactFeature>,
) {
    if let Some(door_id) = door_id.clone() {
        features.push(RebuiltV3CompactFeature(
            door_id,
            "door".into(),
            Some("closed".into()),
            Some(
                if profile.horizontal_door {
                    "horizontal"
                } else {
                    "vertical"
                }
                .into(),
            ),
        ));
    }
    for (kind, enabled) in [
        ("stairs", profile.stairs),
        ("column", profile.column),
        ("unmapped", profile.unmapped),
        ("note", profile.note_marker),
        ("action-point", profile.action_point_marker),
        ("archway", profile.visible_arch),
        ("no-wall-in-battle", profile.no_wall_in_battle),
    ] {
        if enabled {
            features.push(RebuiltV3CompactFeature(
                StableId(format!("{}:{kind}", cell_id.0)),
                kind.into(),
                None,
                None,
            ));
        }
    }
}

fn cell_flags(profile: &DungeonCellProfile, door_id: &Option<StableId>, base_open: bool) -> u16 {
    let revealed = profile.revealed_secret;
    let any_secret = profile.allow_move_north
        || profile.allow_move_east
        || profile.allow_move_south
        || profile.allow_move_west;
    let passable = base_open || any_secret;
    let blocks_los = profile.wall && door_id.is_none() && (!any_secret || !revealed);
    u16::from(passable) | (u16::from(blocks_los) << 1)
}
