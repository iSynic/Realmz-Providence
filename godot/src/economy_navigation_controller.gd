extends RefCounted

var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _views: Array
var _request := 0
var _navigate: Callable


func initialize(views: Array, operations: ProvidenceEditorOperation, read_bridge: Callable, navigate: Callable) -> void:
	_views = views; _operations = operations; _read_bridge = read_bridge
	_navigate = navigate
	for view: Control in views:
		view.visibility_changed.connect(_refresh.bind(view))
	views[1].get_node("EconomyNavigation").route_requested.connect(navigate)
	for view: Control in views: _refresh(view)


func dispose() -> void:
	_request += 1
	for view: Control in _views:
		if is_instance_valid(view): view.visibility_changed.disconnect(_refresh.bind(view))
	if _views.size() > 1 and is_instance_valid(_views[1]):
		_views[1].get_node("EconomyNavigation").route_requested.disconnect(_navigate)
	_views.clear()
	_read_bridge = Callable()


func _refresh(view: Control) -> void:
	if not is_instance_valid(view) or not view.is_visible_in_tree(): return
	_request += 1
	var request := _request
	while _operations.busy:
		await view.get_tree().process_frame
		if request != _request or not is_instance_valid(view) or not view.is_visible_in_tree(): return
	var bridge = _read_bridge.call()
	if bridge == null: return
	var epoch: int = bridge.connection_epoch()
	var response: Dictionary = await _operations.run_workflow(bridge, "Read Economy counts", _counts)
	if request != _request or bridge != _read_bridge.call() or epoch != bridge.connection_epoch(): return
	if not response.get("ok", false): return
	for editor: Control in _views: editor.get_node("EconomyNavigation").set_counts(response.result)


func _counts(operation: ProvidenceEditorOperation) -> Dictionary:
	var counts := {}
	for pair in [["economy.treasure", "treasure.list"], ["economy.items", "item.list"], ["economy.shops", "shop.list"]]:
		var response := await operation.request(pair[1], {"offset": 0, "limit": 1})
		if not response.get("ok", false): return response
		counts[pair[0]] = int(response.result.total)
	return {"ok": true, "result": counts}
