extends RefCounted


static func label(tile: int, row: Dictionary) -> String:
	var name := str(row.get("name", ""))
	return "Tile %d · %s" % [tile, name] if not name.is_empty() and name != "Tile %d" % tile else "Tile %d" % tile


static func tooltip(tile: int, row: Dictionary) -> String:
	var lines: PackedStringArray = [label(tile, row)]
	if row.is_empty(): return lines[0]
	lines.append("%s · %s" % [row.get("categoryLabel", "Unclassified"), row.get("confidence", "uncertain")])
	var material := str(row.get("material", ""))
	if not material.is_empty(): lines.append("Material: " + material)
	var shape := str(row.get("shapeDescription", ""))
	if not shape.is_empty(): lines.append(shape)
	var connections := PackedStringArray(row.get("connections", []))
	if not connections.is_empty(): lines.append("Connections: " + ", ".join(connections))
	return "\n".join(lines)


static func search_text(tile: int, row: Dictionary) -> String:
	return tooltip(tile, row).to_lower()
