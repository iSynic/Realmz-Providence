extends RefCounted

const KIND := "providence.monster-library-transfer"
var _view
var _dropping := false


func initialize(view) -> void:
	_view = view
	view.library.drag_provider = begin_drag
	view.scenario.configure_drop_target(can_drop, drop)


func begin_drag(_position: Vector2, identity: String, row: Button) -> Variant:
	var data := transfer_data(identity)
	if data.is_empty(): return null
	var preview := PanelContainer.new()
	var label := Label.new()
	label.add_theme_font_override("font", row.get_node("Contents/Facts/Name").get_theme_font("font"))
	label.text = "%s\nCopy to scenario" % (row.get_node("Contents/Facts/Name").text if data.entryIds.size() == 1 else "%d monsters" % data.entryIds.size())
	preview.add_child(label)
	row.set_drag_preview(preview)
	return data


func transfer_data(identity: String) -> Dictionary:
	var context: Dictionary = _view.library_drag_context()
	if context.is_empty() or _dropping: return {}
	var selected: Array = _view.library.selected_identities()
	var members: Array = selected.duplicate() if identity in selected else [identity]
	return {"kind": KIND, "owner": _view.get_instance_id(), "context": context, "entryIds": members}


func can_drop(_position: Vector2, data: Variant) -> bool:
	if _dropping or not data is Dictionary or data.get("kind", "") != KIND: return false
	if data.get("owner", -1) != _view.get_instance_id(): return false
	var context: Dictionary = _view.library_drag_context()
	if context.is_empty() or data.get("context", {}) != context: return false
	var members: Variant = data.get("entryIds", [])
	return members is Array and not members.is_empty() and members.all(func(identity): return identity is String and not identity.is_empty())


func drop(position: Vector2, data: Variant) -> void:
	if not can_drop(position, data): return
	_dropping = true
	await _accept(data.duplicate(true))
	_dropping = false


func _accept(data: Dictionary) -> void:
	if not await _view.request_draft_navigation("copying Library monsters"): return
	# The draft guard can apply an edit or switch projects while it is open.
	if data.context != _view.library_drag_context():
		_changed(); return
	var members: Array = data.entryIds
	if members != _view.library.selected_identities():
		if members.size() != 1:
			_changed(); return
		var selected: Dictionary = await _view.library.select_entry(str(members[0]))
		if not selected.get("ok", false):
			if not selected.get("canceled", false): _view.show_submission_failure(selected)
			return
	if data.context != _view.library_drag_context() or members != _view.library.selected_identities():
		_changed(); return
	_view.library_operation_requested.emit("DropTransfer")


func _changed() -> void:
	_view.show_submission_failure({"ok": false, "error": "The scenario or Library changed. Drag the monsters again."})
