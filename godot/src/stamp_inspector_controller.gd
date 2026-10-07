extends RefCounted

var land: Control
var dungeon: Control
var _connections: Array = []
var _land_view: Control
var _dungeon_view: Control
var _atlas: Control
var _activate: Callable


func initialize(land_author, dungeon_stamps, land_host: Control, dungeon_host: Control, land_view: Control, dungeon_view: Control, atlas: Control, activate: Callable, choose: Callable) -> void:
	_land_view = land_view; _dungeon_view = dungeon_view; _atlas = atlas; _activate = activate
	land = _mount(land_host, land_author, choose)
	dungeon = _mount(dungeon_host, dungeon_stamps, choose)
	_connect(land_author.stamp_selected, _selected.bind(false))
	_connect(dungeon_stamps.stamp_selected, _selected.bind(true))


func _mount(host: Control, controller, choose: Callable) -> Control:
	var view := preload("res://src/stamp_context.tscn").instantiate()
	host.add_child(view); host.mount(view, "stamp")
	_connect(controller.status_changed, view.set_status)
	_connect(controller.stamp_state_changed, view.set_state)
	view.choose_requested.connect(choose)
	view.retry_requested.connect(controller.commit_selected)
	view.discard_requested.connect(controller.discard_draft)
	view.recovery_requested.connect(controller.check_original)
	return view


func _selected(resource: Dictionary, presentation: Dictionary, is_dungeon: bool) -> void:
	var view: Control = dungeon if is_dungeon else land
	var projection: Dictionary = _dungeon_view.atlas_projection if is_dungeon else _land_view.atlas_projection
	view.present(resource, presentation, projection, null if is_dungeon else _atlas)
	_activate.call("stamp")


func _connect(source: Signal, target: Callable) -> void:
	source.connect(target); _connections.append([source, target])


func dispose() -> void:
	for pair in _connections:
		if pair[0].is_connected(pair[1]): pair[0].disconnect(pair[1])
	_connections.clear(); _activate = Callable()
