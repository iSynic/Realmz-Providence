extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var pixels := ""
	var calls: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(30)
		assert(method == "map.thumbnail")
		calls.append(str(params.identity))
		return {"ok":true,"result":{"available":true,"revision":0,"base64":pixels}}

var _bridge := Bridge.new()
var _operations := ProvidenceEditorOperation.new()
var _controller := preload("res://src/layout_thumbnail_controller.gd").new()
var _view: ProvidenceLandLayoutEditor


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var image := Image.create(180,180,false,Image.FORMAT_RGBA8)
	image.fill(Color(0.3,0.6,0.2)); _bridge.pixels = Marshalls.raw_to_base64(image.save_png_to_buffer())
	root.add_child(_operations)
	_view = preload("res://src/land_layout_editor.tscn").instantiate()
	root.add_child(_view); _view.hide()
	_controller.initialize(_view,_operations); _controller.attach_session(_bridge)
	var cells: Array = []; cells.resize(128); cells.fill(0); cells[0] = -1; cells[1] = 1
	_view.set_projection({"revision":0,"layout":{"cells":cells},"landMaps":[{"identity":"land:0","nativeIndex":0},{"identity":"land:1","nativeIndex":1}]})
	_view._show_selected(0,0); _view.show()
	assert(not _operations.busy, "Visibility must leave tab presentation free to finish.")
	for frame in 120:
		await process_frame
		if _operations.busy: break
	assert(_operations.busy)
	# A selection change supersedes the in-flight read, then must finish the new set.
	_view._show_selected(0,1)
	for frame in 1200:
		await process_frame
		if not _operations.busy and _view.thumbnail_candidates().is_empty(): break
	assert(not _operations.busy and _view.thumbnail_candidates().is_empty())
	assert(_view.get_node("%WestNeighbor").icon != null and _view.get_node("%WestNeighbor").get_meta("identity") == "land:0")
	assert(_view.get_node("%LandMapPalette").get_item_icon(0) != null and _view.get_node("%LandMapPalette").get_item_icon(1) != null)
	_controller.dispose(); _bridge.stop(); _view.free(); _operations.free()
	print("PROVIDENCE_LAYOUT_THUMBNAILS_OK deferred-visibility superseded-read current-neighbor complete-palette teardown")
	quit()
