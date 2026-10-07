extends GridContainer

signal ban_toggled(identity: String, checked: bool)

var _enabled := false


func set_choices(catalog: Array, bans: Array) -> Array:
	var focus := get_viewport().gui_get_focus_owner()
	var focused_identity := str(focus.get_meta("identity", "")) if focus != null else ""
	for child in get_children():
		remove_child(child)
		child.queue_free()
	var missing: Array = bans.duplicate()
	for row in catalog:
		if int(row.get("classicId", 0)) < 1 or int(row.get("classicId", 0)) > 30: continue
		var identity := str(row.identity)
		var label := str(row.get("displayName", row.get("name", "")))
		if label.strip_edges().is_empty(): label = "Custom %s %d" % [identity.get_slice(".", 1), int(row.authorId)]
		_add_choice(identity, label, identity in bans, false, focused_identity)
		missing.erase(identity)
	for identity in missing:
		_add_choice(str(identity), "%s · missing definition" % identity, true, true, focused_identity)
	return missing


func set_enabled(enabled: bool) -> void:
	_enabled = enabled
	for child in get_children(): child.disabled = not enabled


func clear_choices() -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()


func _add_choice(identity: String, label: String, checked: bool, missing: bool, focused_identity: String) -> void:
	var check := CheckBox.new()
	check.theme_type_variation = "ScenarioBan"
	check.text = label
	check.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	check.clip_text = true
	check.button_pressed = checked
	check.disabled = not _enabled
	check.set_meta("identity", identity)
	check.tooltip_text = "Exact imported ban; uncheck to remove it explicitly." if missing else label + " · checked means cannot play"
	check.toggled.connect(func(value: bool): ban_toggled.emit(identity, value))
	add_child(check)
	if identity == focused_identity:
		call_deferred("_restore_focus", check)


func _restore_focus(check: CheckBox) -> void:
	if is_instance_valid(check) and check.is_inside_tree(): check.grab_focus()


func filter_choices(query: String) -> void:
	for child in get_children(): child.visible = query.is_empty() or child.text.to_lower().contains(query.to_lower()) or str(child.get_meta("identity", "")).to_lower().contains(query.to_lower())

func choice_for(identity: String) -> CheckBox:
	for child in get_children():
		if child.get_meta("identity", "") == identity: return child
	return null
