use super::*;
const DIRECTIONS: [(i16, i16, u8); 8] = [
    (0, -1, 4),
    (1, 0, 8),
    (0, 1, 1),
    (-1, 0, 2),
    (1, -1, 64),
    (1, 1, 128),
    (-1, 1, 16),
    (-1, -1, 32),
];

pub(super) fn neighbors(cell: MapCoordinate) -> impl Iterator<Item = (i16, i16)> {
    DIRECTIONS[..4]
        .iter()
        .map(move |(dx, dy, _)| (cell.x as i16 + dx, cell.y as i16 + dy))
}

fn read(map: &MapLevel, x: i16, y: i16) -> Option<i16> {
    if !(0..90).contains(&x) || !(0..90).contains(&y) {
        return None;
    }
    map_paint::terrain_tile(map.tiles[y as usize * 90 + x as usize]).map(|tile| tile as i16)
}

fn connections(profile: &Profile, tile: i16, bit: u8) -> bool {
    if !profile.family.contains(&tile) {
        return false;
    }
    let masks: Vec<_> = profile
        .masks
        .iter()
        .filter(|(_, tiles)| tiles.contains(&tile))
        .map(|(mask, _)| *mask)
        .chain(
            profile
                .roles
                .iter()
                .chain(&profile.water_roles)
                .filter(|(_, tiles)| tiles.contains(&tile))
                .map(|(role, _)| role_mask(role)),
        )
        .chain(profile.center.contains(&tile).then_some(255))
        .collect();
    masks.is_empty() || masks.iter().any(|mask| mask & bit != 0)
}

pub(super) fn context(
    map: &MapLevel,
    profile: &Profile,
    cell: MapCoordinate,
    set: &BTreeSet<(u8, u8)>,
) -> u8 {
    let mut context = 0;
    for (index, (dx, dy, bit)) in DIRECTIONS.iter().enumerate() {
        let (x, y) = (cell.x as i16 + dx, cell.y as i16 + dy);
        if set.contains(&(x as u8, y as u8))
            || read(map, x, y).is_some_and(|tile| connections(profile, tile, *bit))
        {
            context |= 1 << index;
        }
    }
    context
}

pub(super) fn role(mask: u8, water: bool) -> &'static str {
    let cardinal = mask & 15;
    if cardinal == 15 {
        if water {
            for (bit, name) in [
                (16, "notchNorthEast"),
                (128, "notchNorthWest"),
                (32, "notchSouthEast"),
                (64, "notchSouthWest"),
            ] {
                if mask & bit == 0 {
                    return name;
                }
            }
        }
        return "center";
    }
    match cardinal {
        0 => "single",
        1 => "capNorth",
        2 => "capEast",
        4 => "capSouth",
        8 => "capWest",
        5 => "lineVertical",
        10 => "lineHorizontal",
        3 => "southWest",
        6 => "northWest",
        9 => "southEast",
        12 => "northEast",
        7 => "west",
        11 => "south",
        13 => "east",
        14 => "north",
        _ => "single",
    }
}

pub(super) fn role_mask(role: &str) -> u8 {
    match role {
        "center" => 255,
        "north" => 110,
        "south" => 155,
        "east" => 205,
        "west" => 55,
        "northEast" => 76,
        "northWest" => 38,
        "southEast" => 137,
        "southWest" => 19,
        "lineHorizontal" => 10,
        "lineVertical" => 5,
        "capNorth" => 1,
        "capSouth" => 4,
        "capEast" => 2,
        "capWest" => 8,
        "notchNorthEast" => 239,
        "notchNorthWest" => 127,
        "notchSouthEast" => 223,
        "notchSouthWest" => 191,
        _ => 0,
    }
}

pub(super) fn interior(cell: MapCoordinate, set: &BTreeSet<(u8, u8)>) -> bool {
    DIRECTIONS
        .iter()
        .all(|(dx, dy, _)| set.contains(&((cell.x as i16 + dx) as u8, (cell.y as i16 + dy) as u8)))
}

pub(super) fn narrow(mask: u8) -> bool {
    let count = (mask & 15).count_ones();
    (1..=3).contains(&count)
        && ![19, 38, 76, 137]
            .iter()
            .any(|corner| mask & corner == *corner)
}

pub(super) fn broad_water(mask: u8, role: &str) -> Option<i16> {
    match role {
        "northEast" if mask & 76 == 76 => Some(26),
        "northWest" if mask & 38 == 38 => Some(25),
        "southEast" if mask & 137 == 137 => Some(28),
        "southWest" if mask & 19 == 19 => Some(27),
        "notchNorthEast" => Some(29),
        "notchNorthWest" => Some(30),
        "notchSouthEast" => Some(31),
        "notchSouthWest" => Some(32),
        _ => None,
    }
}

pub(super) fn touches_water(
    map: &MapLevel,
    cell: MapCoordinate,
    context: u8,
    water: &Profile,
) -> bool {
    DIRECTIONS.iter().enumerate().any(|(index, (dx, dy, bit))| {
        context & (1 << index) == 0
            && read(map, cell.x as i16 + dx, cell.y as i16 + dy)
                .is_some_and(|tile| connections(water, tile, *bit))
    })
}
