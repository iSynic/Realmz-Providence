extends RefCounted

signal projection_applied(projection: Dictionary)
signal inspector_requested(kind: String, document: Dictionary)
signal route_requested(identity: String)
signal special_land_requested
signal library_requested(scope: String)
signal paint_tile_requested(resource_id: int)
signal compile_requested
signal status_changed(message: String)

const MediaController = preload("res://src/scenario_media_controller.gd")
var pictures := MediaController.new()
var sounds := MediaController.new()
var icons := MediaController.new()
var special_land := MediaController.new()


func initialize(documents: RefCounted, operations: ProvidenceEditorOperation, read_context: Callable, accept_read: Callable, accept_draft: Callable, refresh_affected: Callable) -> void:
	for entry in [["assets.pictures", "picture", pictures], ["assets.sounds", "sound", sounds], ["assets.icons", "icon", icons], ["maps.special-land", "special-land", special_land]]:
		var view: Control = documents.view(entry[0])
		var controller = entry[2]
		controller.initialize(entry[1], view, operations, read_context, accept_read, accept_draft)
		controller.refresh_affected = refresh_affected
		controller.projection_applied.connect(func(projection): projection_applied.emit(projection))
		controller.status_changed.connect(func(message): status_changed.emit(message))
		_bind_commands(view, entry[1], controller)
		documents.register_controller(entry[0], preload("res://src/workbench_controller.gd").new(
			entry[0], view, controller.refresh_workbench, controller.teardown))
	_bind_navigation(documents)


func _bind_commands(view: Control, prefix: String, controller: RefCounted) -> void:
	var signal_prefix := "tile" if prefix == "special-land" else prefix
	view.connect(signal_prefix + "_open_requested", controller.open_media)
	view.connect(signal_prefix + "_import_requested", controller.import_media)
	view.connect(signal_prefix + "_remove_requested", controller.remove_media)
	view.compile_requested.connect(func(): compile_requested.emit())
	if prefix == "special-land":
		view.tile_update_requested.connect(controller.update_tile)
		view.paint_tile_requested.connect(func(id): paint_tile_requested.emit(id))
	else:
		view.connect(signal_prefix + "_update_requested", controller.update_resource)
		view.selection_changed.connect(func(document): _present_selection(view, prefix, document))
		view.library_scope_requested.connect(func(scope): library_requested.emit(scope))


func _present_selection(view: Control, prefix: String, document: Dictionary) -> void:
	# Hidden origin views can refresh after a gallery mutation. They must not
	# replace the active workbench's shared Inspector context.
	if view.is_visible_in_tree(): inspector_requested.emit(prefix, document)


func _bind_navigation(documents: RefCounted) -> void:
	var picture_view: Control = documents.view("assets.pictures")
	var sound_view: Control = documents.view("assets.sounds")
	var icon_view: Control = documents.view("assets.icons")
	picture_view.sound_route_requested.connect(func(): route_requested.emit("assets.sounds"))
	picture_view.icon_route_requested.connect(func(): route_requested.emit("assets.icons"))
	picture_view.special_land_route_requested.connect(func(): special_land_requested.emit())
	sound_view.picture_route_requested.connect(func(): route_requested.emit("assets.pictures"))
	sound_view.icon_route_requested.connect(func(): route_requested.emit("assets.icons"))
	icon_view.picture_route_requested.connect(func(): route_requested.emit("assets.pictures"))
	icon_view.sound_route_requested.connect(func(): route_requested.emit("assets.sounds"))
	icon_view.special_land_route_requested.connect(func(): special_land_requested.emit())


func attach_session(bridge: RefCounted) -> void:
	for controller in [pictures, sounds, icons, special_land]: controller.attach_session(bridge)


func dispose() -> void:
	for controller in [pictures, sounds, icons, special_land]: controller.dispose()
