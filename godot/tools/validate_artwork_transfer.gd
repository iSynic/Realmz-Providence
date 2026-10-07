extends SceneTree

class Bridge extends "res://tools/assets/fixture_bridge.gd":
	var unknown := false
	func _request(method: String, params: Dictionary = {}) -> Dictionary:
		OS.delay_msec(25)
		if method == "personal-library.copy-icon" and failed_method != method:
			calls.append({"method": method, "params": params})
			assert(params == {"identity": "Personal Ruby", "expectedRevision": 7, "expectedLibraryRevision": 0, "resourceId": 30126})
			return {"ok": true, "result": {"revision": 8}}
		var response := super._request(method, params)
		if method == failed_method: response["outcomeUnknown"] = unknown
		return response

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _workbench: Control
var _panel: Control
var _applied: Array = []
var _copies: Array = []
var _frames := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	root.add_child(_operations)
	_workbench = load("res://src/unified_assets_editor.tscn").instantiate()
	root.add_child(_workbench)
	_workbench.configure_operations(_operations)
	_panel = _workbench.get_node("%Gallery")
	# Exercise the shared transfer controller; unified Assets owns a separate review dialog.
	_panel.unified_browser = false
	var image := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	image.fill(Color.WHITE)
	_bridge.png = Marshalls.raw_to_base64(image.save_png_to_buffer())
	_workbench.artwork_applied.connect(func(projection, index): _applied.append([projection, index]))
	_workbench.scenario_changed.connect(func(projection): _copies.append(projection))
	process_frame.connect(func(): _frames += 1)
	await _workbench.reload(_bridge)
	await _workbench.show_scope("personal")
	await _check_copy()
	await _check_assignment()
	await _check_unknown_and_teardown()
	await _settle()
	_bridge.stop()
	_workbench.free()
	_operations.free()
	print("PROVIDENCE_ARTWORK_TRANSFER_OK shared-worker collections copy-check-lease direct-apply-once picker-search-coalesced changed-number-no-write known-rejection unknown-no-retry drafts teardown")
	quit()


func _check_copy() -> void:
	await _panel._select(0)
	var frames := _frames
	await _panel._copy_dialog()
	assert(_frames > frames + 3 and _workbench.has_unapplied_changes())
	var count := _bridge.calls.size()
	await _workbench.show_scope("stock")
	assert(_workbench.current_scope() == "personal" and _bridge.calls.size() == count)
	assert((await _workbench.refresh_after_history(_bridge)).get("draft", false))
	_bridge.calls.clear()
	_panel._copy_selected()
	assert(_operations.busy)
	await _panel._copy_selected()
	await _settle()
	assert(_copies.size() == 1)
	assert(_methods() == ["artwork.check-copy-number", "personal-library.copy-icon"])
	await _panel._copy_dialog()
	count = _copies.size()
	_panel._copy_selected()
	_panel.get_node("%CopyDialog").get_node("%CopyNumber").value = 32000
	await _settle()
	assert(_copies.size() == count)
	_workbench.discard_draft()
	await _panel._move_dialog()
	assert(_panel.get_node("%Collections").item_count == 1 and not _operations.busy)
	_workbench.discard_draft()


func _check_assignment() -> void:
	await _workbench.begin_item_selection(_bridge, {"id": "classic.item.800", "classicId": 800, "iconId": 0}, 7)
	await _panel._select(0)
	_bridge.calls.clear()
	_panel._transfer.use_artwork()
	assert(_operations.busy)
	await _panel._transfer.use_artwork()
	await _settle()
	assert(_applied.size() == 1 and _methods() == ["scenario-item.use-scenario-artwork"])
	await _workbench.show_scope("personal")
	await _panel._select(0)
	await _panel._transfer.use_artwork()
	_panel.get_node("%CopyDialog").get_node("%CopyNumber").value = 30127
	_bridge.failed_method = "personal-library.apply-item-artwork"
	await _panel._copy_selected()
	assert(_applied.size() == 1 and _panel.get_node("%Status").text.contains("reopen"))
	_bridge.failed_method = ""
	await _panel._copy_selected()
	assert(_applied.size() == 2)
	await _workbench.end_item_selection()
	await _workbench.show_scope("stock")
	await _panel._select(0)
	await _panel._transfer.use_artwork()
	var picker: ProvidenceItemArtworkPicker = _panel.get_node("%StockPicker")
	picker.get_node("%DestinationSearch").text = "latest query"
	picker.get_node("%DestinationSearch").text_changed.emit("latest query")
	await _settle()
	assert(_bridge.calls.back().params.query == "latest query")
	picker._select_item(0)
	picker._on_apply()
	await _settle()
	assert(_applied.size() == 3)


func _check_unknown_and_teardown() -> void:
	await _workbench.begin_item_selection(_bridge, {"id": "classic.item.800", "classicId": 800, "iconId": 0}, 7)
	await _panel._select(0)
	_bridge.failed_method = "scenario-item.use-scenario-artwork"
	_bridge.unknown = true
	await _panel._transfer.use_artwork()
	assert(_operations.requires_reopen and _applied.size() == 3)
	var count := _bridge.calls.size()
	await _panel._transfer.use_artwork()
	assert(_bridge.calls.size() == count)
	_bridge.stop()
	_operations.reset_session()
	_bridge.failed_method = ""
	_bridge.unknown = false
	await _workbench.end_item_selection()
	await _workbench.show_scope("personal")
	await _panel._select(0)
	_panel._copy_dialog()
	assert(_operations.busy)
	await _workbench.reload(null)
	await _settle()
	assert(not _panel.get_node("%CopyDialog").visible and _panel.get_node("%Gallery").item_count == 0)
	assert(_copies.size() == 1 and _applied.size() == 3)


func _settle() -> void:
	var idle_frames := 0
	for frame in range(300):
		await process_frame
		idle_frames = 0 if _operations.busy else idle_frames + 1
		if idle_frames >= 3: return
	assert(false, "The artwork workflow did not finish")


func _methods() -> Array:
	return _bridge.calls.map(func(entry): return entry.method)
