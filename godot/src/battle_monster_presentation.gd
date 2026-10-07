extends RefCounted


static func footprint(record: Dictionary) -> Vector2i:
	# Castle placemonster/drawbody size controls cells and the destination rectangle.
	# Artwork dimensions never change occupancy, including after async image loading.
	var value := int(record.get("size", 0))
	return Vector2i(2 if value > 1 else 1, 2 if value in [1, 3] else 1)


static func details(row: Dictionary) -> String:
	if not row.get("monster") is Dictionary: return str(row.get("reason", "Unavailable"))
	var record: Dictionary = row.monster
	var area := footprint(record)
	var facts := "HD %d · Armor %d · %d×%d footprint" % [int(record.get("hitDice", 0)), int(record.get("armor", 0)), area.x, area.y]
	return facts if row.get("available", false) else facts + "\n" + str(row.get("reason", "Unavailable"))
