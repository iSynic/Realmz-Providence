extends VBoxContainer

signal callers_requested(record: Dictionary)

var _bridge
var _operations: ProvidenceEditorOperation
var _generation := 0
var _offset := 0
var _selected_id := -1
var _selected: Dictionary = {}


func _ready() -> void:
	$Records.item_selected.connect(_select)
	$Actions/Callers.pressed.connect(func(): callers_requested.emit(_selected.duplicate(true)))
	$Actions/Refresh.pressed.connect(func(): reload(_bridge, _operations))
	$Paging/Previous.pressed.connect(func(): _offset = maxi(0, _offset - 64); reload(_bridge, _operations))
	$Paging/Next.pressed.connect(func(): _offset += 64; reload(_bridge, _operations))
	reset()


func reset() -> void:
	_generation += 1
	_offset = 0
	_selected_id = -1
	_selected.clear()
	if not is_node_ready(): return
	$Records.clear()
	$Details.text = ""
	$Status.text = "UNVERIFIED SOURCE RECORDS"
	$Actions/Callers.disabled = true
	$Paging/Previous.disabled = true
	$Paging/Next.disabled = true
	$Paging/Page.text = ""


func navigation_state() -> Dictionary:
	return {"offset": _offset, "nativeId": _selected_id}


func restore(state: Dictionary) -> void:
	_offset = maxi(0, int(state.get("offset", 0)))
	_selected_id = int(state.get("nativeId", -1))
	await reload(_bridge, _operations)


func reload(bridge, operations: ProvidenceEditorOperation, borrowed: ProvidenceEditorOperation = null) -> void:
	_generation += 1
	var generation := _generation
	_bridge = bridge; _operations = operations
	_selected.clear(); $Actions/Callers.disabled = true
	if bridge == null or not visible: return
	var epoch: int = bridge.connection_epoch()
	$Status.text = "Loading unverified records…"
	while operations.busy and borrowed == null:
		await get_tree().process_frame
		if generation != _generation or epoch != bridge.connection_epoch() or not visible: return
	var response: Dictionary = await operations.run_workflow(bridge, "Load unverified Shop records", func(op):
		return await op.request("shop.unverified.list", {"offset": _offset, "limit": 64}), borrowed)
	if generation != _generation or epoch != bridge.connection_epoch() or not visible: return
	$Records.clear(); $Details.text = ""
	$Paging/Previous.disabled = true; $Paging/Next.disabled = true
	if not response.get("ok", false):
		$Status.text = "Unverified records unavailable"
		$Details.text = str(response.get("error", "Choose Refresh to retry."))
		return
	_render(response.result)


func _render(result: Dictionary) -> void:
	var total := int(result.total)
	$Status.text = "%d UNVERIFIED SOURCE RECORDS" % total
	$Paging/Page.text = "%d–%d / %d" % [mini(_offset + 1, total), mini(_offset + 64, total), total]
	$Paging/Previous.disabled = _offset == 0
	$Paging/Next.disabled = not result.get("truncated", false)
	for record: Dictionary in result.get("items", []):
		var row: int = $Records.add_item("Slot %03d · %d caller%s" % [int(record.nativeId), int(record.callers), "" if int(record.callers) == 1 else "s"])
		$Records.set_item_metadata(row, record.duplicate(true))
		$Records.set_item_tooltip(row, str(record.reason))
		if int(record.nativeId) == _selected_id: $Records.select(row); _select(row)
	if total == 0: $Details.text = "No unverified source records."


func _select(row: int) -> void:
	_selected = $Records.get_item_metadata(row).duplicate(true)
	_selected_id = int(_selected.nativeId)
	$Details.text = str(_selected.reason) + "\nPreserved source; unavailable as a Shop."
	$Actions/Callers.disabled = false
