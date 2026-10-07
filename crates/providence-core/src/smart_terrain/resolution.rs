use super::*;

pub(super) fn resolve(
    map: &MapLevel,
    profile: &Profile,
    intent: &SmartTerrainIntent,
    identity: &StableId,
    cell: MapCoordinate,
    set: &BTreeSet<(u8, u8)>,
) -> Option<i16> {
    let preset = intent.preset.as_str();
    let context = topology::context(map, profile, cell, set);
    let role = topology::role(context, preset == "water");
    if topology::interior(cell, set) || preset != "water" && role == "center" {
        return profile.center.first().copied();
    }
    if preset == "water" {
        let mask = context & 15;
        if topology::narrow(context)
            && let Some(tiles) = profile.masks.get(&mask).filter(|tiles| !tiles.is_empty())
        {
            return Some(pick(
                tiles,
                identity,
                preset,
                cell,
                &format!("narrow-water:{mask}"),
            ));
        }
        if let Some(tile) = topology::broad_water(context, role) {
            return Some(tile);
        }
    }
    let water = topology::touches_water(map, cell, context, &rules().presets["water"]);
    let (candidates, source) = if let Some(tiles) = profile
        .masks
        .get(&context)
        .filter(|tiles| !tiles.is_empty())
    {
        (tiles, "curated-mask")
    } else {
        let roles = if preset == "mountains" && water {
            &profile.water_roles
        } else {
            &profile.roles
        };
        (roles.get(role)?, "curated-role")
    };
    let choices = filtered_candidates(candidates, profile, preset, context, water);
    (!choices.is_empty()).then(|| {
        pick(
            &choices,
            identity,
            preset,
            cell,
            &format!("{source}:{role}:{context}"),
        )
    })
}

fn filtered_candidates(
    candidates: &[i16],
    profile: &Profile,
    preset: &str,
    context: u8,
    water: bool,
) -> Vec<i16> {
    let mut filtered: Vec<_> = candidates
        .iter()
        .copied()
        .filter(|tile| !profile.center.contains(tile))
        .collect();
    if preset == "mountains" {
        let preferred = if water { 86..=93 } else { 61..=85 };
        let narrowed: Vec<_> = filtered
            .iter()
            .copied()
            .filter(|tile| preferred.contains(tile))
            .collect();
        if !narrowed.is_empty() {
            filtered = narrowed;
        }
    }
    if preset == "water" && (context & 15).count_ones() <= 2 {
        filtered.retain(|tile| *tile != 22);
    }
    if preset == "forest" {
        filtered.retain(|tile| (121..=129).contains(tile));
    }
    if filtered.is_empty() {
        candidates.to_vec()
    } else {
        filtered
    }
}

pub(super) fn best_fit(
    map: &MapLevel,
    profile: &Profile,
    cell: MapCoordinate,
    set: &BTreeSet<(u8, u8)>,
) -> i16 {
    let context = topology::context(map, profile, cell, set);
    if context == 0 {
        return profile.center[0];
    }
    let water = topology::touches_water(map, cell, context, &rules().presets["water"]);
    let roles = if water && !profile.water_roles.is_empty() {
        &profile.water_roles
    } else {
        &profile.roles
    };
    roles
        .iter()
        .filter(|(role, tiles)| role.as_str() != "center" && !tiles.is_empty())
        .min_by_key(|(role, _)| {
            let difference = topology::role_mask(role) ^ context;
            (
                (difference & 15).count_ones(),
                (difference & 240).count_ones(),
                *role,
            )
        })
        .map_or(profile.center[0], |(_, tiles)| tiles[0])
}
