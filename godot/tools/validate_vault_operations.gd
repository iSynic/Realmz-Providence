extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var responder := preload("res://tools/validate_vault_workflow.gd").FixtureBridge.new()
	var calls: Array = []
	var fail_method := ""
	var unknown := false
	func is_project_backed() -> bool: return true
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append({"method": method, "params": params.duplicate(true)})
		if method == fail_method: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled artwork failure"}
		match method:
			"session.describe": return {"ok": true, "result": {"revision": 7}}
			"artwork.check-copy-number": return {"ok": true, "result": {"available": true}}
			"reference-catalog.copy-icon": return {"ok": true, "result": {"revision": 8}}
		return responder.request(method, params)

var _view: Control
var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _pending: Dictionary = {}
var _frames := 0
var _applied: Array = []
var _copied: Array = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	root.add_child(_operations)
	process_frame.connect(func(): _frames += 1)
	var image := Image.create(32, 32, false, Image.FORMAT_RGBA8)
	image.fill(Color.WHITE)
	_bridge.responder.png = Marshalls.raw_to_base64(image.save_png_to_buffer())
	_view = preload("res://src/vault_editor.tscn").instantiate()
	_view.standalone_copy = true
	root.add_child(_view)
	_view.configure_operations(_operations, func(): return _bridge)
	_view.artwork_applied.connect(func(projection, index): _applied.append([projection, index, _operations.busy]))
	_view.scenario_changed.connect(func(projection): _copied.append([projection, _operations.busy]))
	var frames := _frames
	assert((await _view.reload(_bridge)).ok and _frames > frames + 1)
	assert(_bridge.calls.map(func(entry): return entry.method) == ["reference-catalog.list", "reference-catalog.preview"])
	_view.get_node("%ArtworkGallery").item_selected.emit(0)
	assert(not _view.get_node("%UseInItem").disabled)
	await _check_history()
	await _check_apply()
	await _check_copy()
	await _check_search_and_teardown()
	await _check_unknown()
	_bridge.stop()
	_view.free()
	_operations.free()
	print("PROVIDENCE_VAULT_OPERATIONS_OK worker-catalog awaited-preview borrowed-history retained-selection bounded-pages apply-once copy-once late-search teardown unknown-no-retry")
	quit()


func _check_history() -> void:
	assert(_operations.begin(_bridge, "Undo"))
	var response: Dictionary = await _view.refresh_workbench(_operations)
	assert(response.ok and _operations.busy and _view.get_node("%ArtworkGallery").is_selected(0))
	assert(_view.get_node("%SelectedArtwork").texture != null)
	_operations.finish(response)
	_view.hide()
	_view.show()
	assert(_view.get_node("%ArtworkGallery").is_selected(0))
	_bridge.fail_method = "reference-catalog.list"
	assert(not (await _view.reload(_bridge)).ok and _view.get_node("%SelectedArtwork").texture != null)
	_bridge.fail_method = ""
	_bridge.responder.paged = true
	assert((await _view.reload(_bridge)).ok)
	_view.get_node("%ArtworkGallery").item_selected.emit(0)
	await _view._show_more()
	assert(_view.get_node("%ArtworkGallery").item_count == 26 and _view.get_node("%ArtworkGallery").is_selected(0))
	assert((await _view.reload(_bridge)).ok and _view.get_node("%ArtworkGallery").item_count == 26)
	assert(_bridge.responder.requested_offsets == [0, 25, 0, 25])
	_bridge.responder.paged = false
	assert((await _view.reload(_bridge)).ok)


func _check_apply() -> void:
	_view.get_node("%ArtworkGallery").item_selected.emit(0)
	_bridge.fail_method = "scenario-item.apply-library-artwork"
	await _view._apply_artwork("vault:9000", 102, 7)
	assert(_applied.is_empty() and not _operations.requires_reopen)
	_bridge.fail_method = ""
	_view._apply_artwork("vault:9000", 102, 7)
	assert(_operations.busy)
	await _view._apply_artwork("vault:9000", 102, 7)
	await _operations.completed
	await process_frame
	assert(_applied == [[{"revision": 8}, 102, false]])
	assert(_bridge.responder.applied == {"identity": "vault:9000", "recordIndex": 102, "expectedRevision": 7})


func _check_copy() -> void:
	_view.get_node("%ArtworkGallery").item_selected.emit(0)
	await _view._copy_dialog()
	var dialog = _view.get_node("%CopyDialog")
	assert(dialog.visible and not dialog.get_ok_button().disabled)
	var start := _bridge.calls.size()
	await _view._copy_artwork()
	assert(_copied == [[{"revision": 8}, false]])
	assert(_bridge.calls.slice(start).map(func(entry): return entry.method) == ["artwork.check-copy-number", "reference-catalog.copy-icon"])
	assert(_bridge.calls[-1].params == {"identity": "vault:9000", "resourceId": 9000, "expectedRevision": 7})
	dialog.hide()


func _check_search_and_teardown() -> void:
	_bridge.responder.paged = true
	call("_start_refresh")
	var search: LineEdit = _view.get_node("%VaultSearch")
	search.text = "new query"
	search.text_changed.emit(search.text)
	await _operations.completed
	await process_frame
	while _operations.busy: await _operations.completed
	await process_frame
	assert(_pending.get("stale", false) and _view.get_node("%ArtworkGallery").item_count == 0)
	assert(_bridge.calls[-1].params.query == "new query")
	search.text = ""
	call("_start_refresh")
	_view.teardown_session()
	await _operations.completed
	await process_frame
	assert(_pending.get("stale", false) and _view.get_node("%ArtworkGallery").item_count == 0)


func _check_unknown() -> void:
	_bridge.responder.paged = false
	assert((await _view.reload(_bridge)).ok)
	_bridge.fail_method = "scenario-item.apply-library-artwork"
	_bridge.unknown = true
	await _view._apply_artwork("vault:9000", 102, 7)
	assert(_operations.requires_reopen and _applied.size() == 1)
	var count := _bridge.calls.size()
	await _view._apply_artwork("vault:9000", 102, 7)
	assert(_bridge.calls.size() == count)
	assert(_view.get_node("%ItemArtworkPicker").get_node("%PickerStatus").text.begins_with("Outcome unknown."))


func _start_refresh() -> void:
	_pending = await _view.reload(_bridge)
