extends VBoxContainer

@export var row_scene: PackedScene


func clear_rows() -> void:
	for row in $Rows.get_children():
		$Rows.remove_child(row)
		row.queue_free()
	$Status.show()
	$Status.text = "—"


func set_slots(value: Variant, kind: String, empty_label: String, projection: Variant = null) -> void:
	clear_rows()
	var limit := 10 if kind == "Spell" else 6
	if row_scene == null or not value is Array or value.size() > limit:
		$Status.text = "Slot data unavailable"
		return
	for slot in value.size():
		var id: Variant = value[slot]
		if not (id is int or id is float) or not is_finite(float(id)) or float(id) != floor(float(id)):
			clear_rows()
			$Status.text = "Slot data unavailable"
			return
		if int(id) == 0:
			continue
		var row := row_scene.instantiate()
		row.name = "Slot%d" % slot
		row.set_meta("slot", slot)
		row.set_meta("native_id", int(id))
		row.set_meta("resolution_state", "unavailable")
		row.tooltip_text = "%s slot %d · raw ID %d\nReference resolution and navigation are not connected." % [kind, slot + 1, int(id)]
		row.get_node("Contents/Target").text = "%s %d" % [kind, int(id)]
		apply_preview(row, projection, slot, int(id), kind)
		$Rows.add_child(row)
	$Status.text = empty_label
	$Status.visible = $Rows.get_child_count() == 0


func apply_preview(row: Control, projection: Variant, slot: int, id: int, kind: String) -> void:
	if not projection is Array or projection.size() > 10:
		return
	var matches: Array = projection.filter(func(item): return item is Dictionary and item.get("slot") == slot and item.get("rawId") == id)
	if matches.size() != 1:
		return
	var item: Dictionary = matches[0]
	var state := str(item.get("resolution", ""))
	var labels := {"resolved": "Resolved · navigation unavailable", "ambiguous": "Ambiguous target", "context-unavailable": "Catalog context unavailable", "missing": "Missing target", "unsupported-signed": "Signed slot interpretation unavailable"}
	if not labels.has(state):
		return
	if state == "resolved":
		if not item.get("target") is String or str(item.target).is_empty() or not item.get("label") is String:
			return
		var label := str(item.label)
		row.get_node("Contents/Target").text = "%s · %s %d" % [label, kind, id] if not label.is_empty() else "%s %d · unnamed" % [kind, id]
	row.set_meta("resolution_state", state)
	row.get_node("Contents/Resolution").text = labels[state]
	row.tooltip_text = "%s\n%s\nSlot %d · navigation is not connected." % [row.get_node("Contents/Target").text, labels[state], slot + 1]
