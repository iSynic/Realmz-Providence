extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	func _request(_method: String, _params: Dictionary) -> Dictionary:
		OS.delay_msec(50)
		return {"ok": true, "result": {"identity": "land:0", "revision": 0, "dungeon": false,
			"settings": {"name": "Land level 0", "dark": false, "usesLos": false, "landlook": 6}, "landlooks": []}}

var _view: Window
var _origin: Button
var _png := ""
var _requests: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.gui_embed_subwindows = true
	_origin = Button.new()
	root.add_child(_origin)
	_view = load("res://src/level_settings_view.tscn").instantiate()
	root.add_child(_view)
	var pixels := Image.create(640, 320, false, Image.FORMAT_RGBA8)
	pixels.fill(Color("426889"))
	_png = Marshalls.raw_to_base64(pixels.save_png_to_buffer())
	var choices := [{"id": 0, "name": "Plains", "ownership": "Stock artwork", "available": true, "sharedBaseEditable": false, "baseTile": 156},
		{"id": 6, "name": "Custom 1", "ownership": "Scenario artwork", "available": true, "sharedBaseEditable": true, "baseTile": 156},
		{"id": 7, "name": "Custom 2", "ownership": "Scenario artwork", "available": false, "reason": "Create this Custom Landlook first.", "sharedBaseEditable": false, "baseTile": null}]
	_view.set_projection({"identity": "land:0", "revision": 3, "dungeon": false,
		"settings": {"name": "Land level 0", "dark": false, "usesLos": false, "landlook": 6}, "landlooks": choices}, _origin)
	_view.show_draft()
	await process_frame
	_view.get_node("%LandlookPicker").artwork_requested.connect(func(landlook: int, request_id: int): _requests.append({"landlook": landlook, "requestId": request_id}))
	await _check_browse_cancel_and_same_selection()
	await _check_unavailable_stale_preview_and_mouse_acceptance()
	await _check_tile_picker()
	_view.close()
	await _check_teardown()
	_view.free()
	_origin.free()
	await process_frame
	print("PROVIDENCE_LEVEL_SETTINGS_PICKER_OK nested-owner exact-destination search-focus current-revealed preview-only no-results unavailable disabled-use mouse-enter-double-click escape-cancel same-selection-kept-draft stale-preview tile-stage session-teardown")
	quit()


func _check_browse_cancel_and_same_selection() -> void:
	_view.get_node("%SharedEraseTile").value = 159
	_view.get_node("%ChooseLandlook").pressed.emit()
	var picker: Window = _view.get_node("%LandlookPicker")
	assert(picker.visible and picker.get_node("%LandlookDestination").text == "Land level 0 · Landlook")
	assert(_requests.back().landlook == 6 and picker.get_node("%LandlookChoices").get_selected_items()[0] == 1)
	picker.present_artwork(_artwork(), int(_requests.back().requestId))
	assert(_view.submitted().edit.landlook == 6 and _view.get_node("%SharedEraseTile").value == 159)
	picker.get_node("%LandlookSearch").grab_focus()
	await process_frame
	assert(picker.get_node("%LandlookSearch").has_focus())
	var enter := InputEventKey.new()
	enter.keycode = KEY_ENTER
	enter.pressed = true
	picker._input(enter)
	assert(not picker.visible and _view.submitted().edit.landlook == 6 and _view.get_node("%SharedEraseTile").value == 159)
	_view.get_node("%ChooseLandlook").pressed.emit()
	var old_request: int = _requests.back().requestId
	picker.get_node("%LandlookSearch").text = "no such Landlook"
	picker.get_node("%LandlookSearch").text_changed.emit("no such Landlook")
	picker.present_artwork(_artwork(), old_request)
	assert(picker.get_node("%LandlookPreview").texture == null and picker.get_node("%LandlookChoices").item_count == 0 and picker.get_node("%UseLandlook").disabled)
	picker.get_node("%CancelLandlook").pressed.emit()
	assert(_view.get_node("%ChooseLandlook").has_focus() and _view.get_node("%SharedEraseTile").value == 159)


func _check_unavailable_stale_preview_and_mouse_acceptance() -> void:
	_view.get_node("%ChooseLandlook").pressed.emit()
	var picker: Window = _view.get_node("%LandlookPicker")
	var old_request: int = _requests.back().requestId
	picker.get_node("%ShowUnavailable").button_pressed = true
	picker.get_node("%LandlookChoices").select(2)
	picker.get_node("%LandlookChoices").item_selected.emit(2)
	picker.present_artwork(_artwork(), old_request)
	assert(picker.get_node("%UseLandlook").disabled and picker.get_node("%LandlookDetails").text.contains("Create this Custom Landlook first."))
	picker.get_node("%UseLandlook").pressed.emit()
	assert(picker.visible and _view.submitted().edit.landlook == 6)
	picker.get_node("%LandlookChoices").select(0)
	picker.get_node("%LandlookChoices").item_selected.emit(0)
	picker.present_artwork(_artwork(), int(_requests.back().requestId))
	assert(_view.submitted().edit.landlook == 6)
	picker.get_node("%LandlookChoices").item_activated.emit(0)
	assert(not picker.visible and _view.submitted().edit.landlook == 0 and not _view.get_node("%SharedEraseTile").editable)
	_view.discard_draft()
	_view.get_node("%ChooseLandlook").pressed.emit()
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	picker._input(escape)
	assert(not picker.visible and _view.submitted().edit.landlook == 6)


func _check_tile_picker() -> void:
	_view.present_erase_artwork(_artwork())
	var picker: Window = _view.get_node("%EraseTilePicker")
	assert(picker.visible and _view.get_node("%SharedEraseTile").value == 156)
	picker.get_node("%EraseAtlas").select_tile(159)
	assert(_view.get_node("%SharedEraseTile").value == 156)
	picker.get_node("%CancelEraseTile").pressed.emit()
	assert(_view.get_node("%SharedEraseTile").value == 156)
	_view.present_erase_artwork(_artwork())
	picker.get_node("%EraseAtlas").select_tile(159)
	picker.get_node("%UseEraseTile").pressed.emit()
	assert(not picker.visible and _view.get_node("%SharedEraseTile").value == 159 and _view.has_unapplied_changes())


func _check_teardown() -> void:
	var operations := ProvidenceEditorOperation.new()
	root.add_child(operations)
	var map := ProvidenceMapDocumentController.new()
	map.identity = "land:0"
	var recovery := Button.new()
	root.add_child(recovery)
	var controller := preload("res://src/level_settings_controller.gd").new()
	controller.initialize(root, map, operations, func(_response): pass, _origin, recovery)
	var bridge := Bridge.new()
	controller.attach_session(bridge)
	controller.open()
	assert(operations.busy)
	controller.attach_session(null)
	await operations.completed
	await process_frame
	assert(not controller.view.visible and controller.view.identity.is_empty() and not controller.has_unapplied_changes())
	bridge.stop()
	controller.view.free()
	operations.free()
	recovery.free()


func _artwork() -> Dictionary:
	return {"available": true, "tilesetId": "classic.landlook.6", "renderMode": "outdoor-landlook",
		"base64": _png, "columns": 20, "rows": 10, "tileWidth": 32, "tileHeight": 32}
