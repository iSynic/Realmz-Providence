extends RefCounted

# Native tile values carry artwork IDs and marker bits; retain one decoding policy.

static func normalize_atlas_tile(raw_tile: int, base_tile: int) -> int:
	var tile := raw_tile
	if tile < 0:
		while tile < -999:
			tile += 1000
		tile = base_tile
	if tile > 999:
		tile = clear_realmz_short_bit(tile, 1)
		tile = clear_realmz_short_bit(tile, 2)
		for _attempt in 3:
			if tile <= 999:
				break
			tile -= 1000
	if tile > 200:
		tile = base_tile
	while tile > 999:
		tile -= 1000
	while tile < -999:
		tile += 1000
	return maxi(1, tile)


static func overlay_resource_id(raw_tile: int) -> int:
	if raw_tile < 0:
		var resource_id := raw_tile
		if resource_id < -1999:
			resource_id += 2000
		elif resource_id < -999:
			resource_id += 1000
		return resource_id
	var icon_id := clear_realmz_short_bit(raw_tile, 1)
	icon_id = clear_realmz_short_bit(icon_id, 2)
	for _attempt in 3:
		if icon_id <= 999:
			break
		icon_id -= 1000
	return icon_id if icon_id > 200 and icon_id < 1000 else 0


static func clear_realmz_short_bit(value: int, bit: int) -> int:
	var cleared := (value & 0xffff) & ~(1 << (15 - bit))
	return cleared - 0x10000 if cleared >= 0x8000 else cleared
