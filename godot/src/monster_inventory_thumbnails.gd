extends Node

const AppearanceView = preload("res://src/monster_appearance_view.gd")
const MAX_ENTRIES := 64
const THUMBNAIL_SIZE := 32

var _bridge
var _operations: ProvidenceEditorOperation
var _inventories: Array = []
var _cache: Dictionary = {}
var _epoch := 0
var _loading := false


func attach(bridge, inventories: Array, operations: ProvidenceEditorOperation = null) -> void:
	for inventory in _inventories:
		_bind_inventory(inventory, false)
	_bridge = bridge
	_operations = operations
	_inventories = inventories
	_cache.clear()
	_epoch += 1
	for inventory in _inventories:
		_bind_inventory(inventory, true)
		for row in inventory.get_node("InventoryScroll/Rows").get_children():
			(row.get_node("Contents/Portrait") as TextureRect).texture = null
			(row.get_node("Contents/Portrait") as TextureRect).tooltip_text = ""
	set_process(bridge != null)


func _process(_delta: float) -> void:
	set_process(false)
	var epoch := _epoch
	_loading = true
	var more := await load_visible_row()
	_loading = false
	if epoch == _epoch: set_process(more)


func is_loading() -> bool:
	return _loading or is_processing()


func load_visible_row() -> bool:
	if _bridge == null:
		return false
	if _operations != null and (_operations.busy or _operations.requires_reopen):
		return not _operations.requires_reopen
	for inventory in _inventories:
		if not is_instance_valid(inventory) or not inventory.is_visible_in_tree():
			continue
		var scroll := inventory.get_node("InventoryScroll") as ScrollContainer
		for row: Control in scroll.get_node("Rows").get_children():
			if int(row.get_meta("thumbnail_epoch", -1)) == _epoch or not row.get_global_rect().intersects(scroll.get_global_rect()):
				continue
			if not row.has_meta("icon_id"):
				row.set_meta("thumbnail_epoch", _epoch)
				continue
			var icon_id := int(row.get_meta("icon_id"))
			var epoch := _epoch
			var thumbnail := await _thumbnail(icon_id)
			if epoch != _epoch or not is_instance_valid(row) or row.is_queued_for_deletion(): return false
			row.set_meta("thumbnail_epoch", _epoch)
			var portrait := row.get_node("Contents/Portrait") as TextureRect
			portrait.texture = thumbnail.get("texture")
			portrait.tooltip_text = str(thumbnail.get("status", "Appearance unavailable."))
			return true
	return false


func _wake(_value: Variant = null) -> void:
	set_process(_bridge != null)


func _bind_inventory(inventory, enabled: bool) -> void:
	if not is_instance_valid(inventory):
		return
	var scroll := inventory.get_node("InventoryScroll") as ScrollContainer
	var events: Array[Signal] = [inventory.resized, inventory.visibility_changed, scroll.resized, scroll.get_v_scroll_bar().value_changed]
	if inventory.has_signal("rows_changed"):
		events.append(Signal(inventory, "rows_changed"))
	for event in events:
		if enabled and not event.is_connected(_wake):
			event.connect(_wake)
		elif not enabled and event.is_connected(_wake):
			event.disconnect(_wake)


func _thumbnail(icon_id: int) -> Dictionary:
	if _cache.has(icon_id):
		return _cache[icon_id]
	var epoch := _epoch
	var result: Dictionary
	if _operations == null:
		result = AppearanceView.load_portrait(_bridge, icon_id)
	else:
		var response := await _operations.run_workflow(_bridge, "Load monster thumbnail", _read_thumbnail.bind(icon_id))
		if not response.get("ok", false): return {"texture": null, "status": str(response.get("error", "Appearance unavailable."))}
		result = AppearanceView.from_projection(response.get("result", {}), icon_id)
	if epoch != _epoch: return {}
	var texture: Texture2D = result.get("texture")
	if texture != null:
		var image := texture.get_image()
		var scale := minf(1.0, float(THUMBNAIL_SIZE) / maxf(image.get_width(), image.get_height()))
		image.resize(maxi(1, roundi(image.get_width() * scale)), maxi(1, roundi(image.get_height() * scale)), Image.INTERPOLATE_NEAREST)
		result.texture = ImageTexture.create_from_image(image)
	if _cache.size() >= MAX_ENTRIES:
		_cache.erase(_cache.keys()[0])
	_cache[icon_id] = result
	return result


func _read_thumbnail(operation: ProvidenceEditorOperation, icon_id: int) -> Dictionary:
	return await operation.request("monster-appearance.open", {"iconId": icon_id})
