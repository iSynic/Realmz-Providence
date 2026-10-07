extends SceneTree

var _query_id := 0
var _applied: Array = []
var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var picker = load("res://src/item_artwork_picker.tscn").instantiate()
	root.add_child(picker)
	picker.search_requested.connect(func(_query, _offset, request_id): _query_id = request_id)
	picker.apply_requested.connect(func(identity, index, revision): _applied.append([identity, index, revision]))
	await process_frame
	var image := Image.create(32, 32, false, Image.FORMAT_RGBA8)
	image.fill(Color.WHITE)
	picker.begin("vault:9000", ImageTexture.create_from_image(image))
	var apply: Button = picker.get_node("%ApplyArtwork")
	_check(apply.disabled, "Apply requires an explicit destination")
	var result := {"revision": 7, "total": 1, "items": [{
		"identity": "classic.item.902", "classicId": 902, "recordIndex": 102,
		"name": "Long named figurine", "iconId": 0, "editable": true,
	}]}
	picker.receive_items(result, _query_id - 1)
	_check(picker.get_node("%DestinationItems").item_count == 0, "stale search response must be ignored")
	picker.receive_items(result, _query_id)
	picker.get_node("%DestinationItems").item_selected.emit(0)
	_check(_applied.is_empty(), "selecting must not mutate an item")
	_check(not apply.disabled, "loaded artwork and destination allow Apply")
	apply.pressed.emit()
	apply.pressed.emit()
	_check(_applied == [["vault:9000", 102, 7]], "Apply sends exact destination and revision only once")
	picker.apply_failed("This item changed. Review it before applying again.", true)
	_check(apply.disabled, "conflict must not allow a blind retry")
	picker.get_node("%DestinationItems").item_selected.emit(0)
	_check(apply.disabled, "reselecting cannot bypass conflict review")
	picker.get_node("%ReviewCurrentItem").pressed.emit()
	result["revision"] = 8
	picker.receive_items(result, _query_id)
	_check(apply.disabled, "review requires renewed selection")
	picker.get_node("%DestinationItems").item_selected.emit(0)
	apply.pressed.emit()
	_check(_applied[1] == ["vault:9000", 102, 8], "renewed confirmation uses refreshed revision")
	picker.apply_failed("The picture could not be copied.")
	picker.get_node("%DestinationSearch").text_changed.emit("absent")
	picker.receive_items({"revision": 8, "total": 0, "items": []}, _query_id)
	_check(apply.disabled, "no matches clear the destination")
	picker.begin("vault:9001", ImageTexture.create_from_image(image))
	_check(picker.get_node("%DestinationSearch").editable, "reopening restores search")
	_check(not picker.get_node("%CancelArtwork").disabled, "reopening restores Cancel")
	_check(apply.disabled, "reopening clears prior destination")
	result["items"][0]["iconId"] = 9999
	picker.receive_items(result, _query_id)
	picker.get_node("%DestinationItems").item_selected.emit(0)
	_check(apply.disabled, "wait for current-picture lookup before confirming replacement")
	picker.receive_current_picture(null, picker._preview_id - 1)
	_check(apply.disabled, "stale missing-picture response must not enable Apply")
	picker.receive_current_picture(null, picker._preview_id)
	_check(not apply.disabled, "missing current artwork must not prevent replacing it")
	_check(picker.get_node("%CurrentPictureState").text == "Current picture unavailable. You can replace it.", "missing current picture needs truthful repair guidance")
	apply.pressed.emit()
	_check(_applied.back() == ["vault:9001", 102, 8], "repair still uses the selected artwork, exact item and revision")
	picker.begin("vault:missing", null)
	picker.receive_items(result, _query_id)
	picker.get_node("%DestinationItems").item_selected.emit(0)
	picker.receive_current_picture(null, picker._preview_id)
	_check(apply.disabled, "missing proposed artwork must still block Apply")
	picker.queue_free()
	await process_frame
	if not _failed:
		print("PROVIDENCE_ITEM_ARTWORK_PICKER_OK")
	quit(1 if _failed else 0)


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error("PROVIDENCE_ITEM_ARTWORK_PICKER_FAILED: " + message)
