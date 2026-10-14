extends RefCounted


static func player_details(record: Dictionary, names: Dictionary, preview: Dictionary) -> String:
	var lines := PackedStringArray()
	if str(preview.get("mode", "")).ends_with("crop"):
		var columns := int(preview.get("columns", 0))
		var cells: Array = preview.get("cells", [])
		if columns > 0: lines.append("%s %d · origin %d, %d · %d × %d cells" % ["Dungeon" if record.get("isDungeon", false) else "Land", int(record.get("level", 0)), int(record.get("startX", 0)), int(record.get("startY", 0)), columns, cells.size() / columns])
	lines.append("Available: %s\nUnavailable: %s" % [str(names.get("availableName", "")), str(names.get("unavailableName", ""))])
	var markers: Dictionary = {}
	for marker: Dictionary in record.get("markers", []):
		var icon := int(marker.get("iconId", 0))
		if icon == 0: continue
		if not markers.has(icon): markers[icon] = PackedStringArray()
		markers[icon].append("%d,%d" % [int(marker.get("x", 0)), int(marker.get("y", 0))])
	for icon: int in markers: lines.append("\n%d MARKERS · ICON %d\n%s" % [markers[icon].size(), icon, " · ".join(markers[icon])])
	return "\n".join(lines)


static func player_warnings(references: Array, diagnostics: Array) -> String:
	var missing_markers := 0
	var missing_party := false
	for reference: Dictionary in references:
		if str(reference.get("resolution", "missing")) == "resolved": continue
		var field := str(reference.get("field", ""))
		if field.begins_with("markers[") and str(reference.get("targetKind", "")) == "icon": missing_markers += 1
		if field == "partyMarker": missing_party = true
	var lines := PackedStringArray()
	if missing_markers > 0: lines.append("%d markers need artwork: choose replacements in Player Maps." % missing_markers)
	if missing_party: lines.append("Restore party-marker artwork in Assets.")
	for finding: Dictionary in diagnostics:
		var field := str(finding.get("field", ""))
		if missing_markers > 0 and field.begins_with("markers[") or missing_party and field == "partyMarker": continue
		var message := str(finding.get("message", ""))
		if not message.is_empty() and not lines.has(message): lines.append(message)
	return "\n".join(lines)
