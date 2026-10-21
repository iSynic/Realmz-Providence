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
const PAGES := {"assets.pictures": "picture", "assets.sounds": "sound", "assets.icons": "icon", "maps.special-land": "special-land"}
const MEDIA_ROUTES := {"picture": "assets.pictures", "sound": "assets.sounds", "icon": "assets.icons", "special-land-tile": "maps.special-land"}
# Each controller binds with its page; reading one realizes its page (see lazy-workbench-pages.md).
var pictures: MediaController:
	get: return _controller("assets.pictures")
var sounds: MediaController:
	get: return _controller("assets.sounds")
var icons: MediaController:
	get: return _controller("assets.icons")
var special_land: MediaController:
	get: return _controller("maps.special-land")
var _controllers: Dictionary = {}
var _documents: RefCounted
var _operations: ProvidenceEditorOperation
var _read_context: Callable
var _accept_read: Callable
var _accept_draft: Callable
var _refresh_affected: Callable
var _bridge: RefCounted


func initialize(documents: RefCounted, operations: ProvidenceEditorOperation, read_context: Callable, accept_read: Callable, accept_draft: Callable, refresh_affected: Callable) -> void:
	_documents = documents
	_operations = operations
	_read_context = read_context
	_accept_read = accept_read
	_accept_draft = accept_draft
	_refresh_affected = refresh_affected
	for route in PAGES: documents.on_realize(route, _bind_page.bind(route))


func _bind_page(view: Control, route: String) -> void:
	var prefix: String = PAGES[route]
	var controller := MediaController.new()
	controller.initialize(prefix, view, _operations, _read_context, _accept_read, _accept_draft)
	controller.refresh_affected = _refresh_affected
	controller.projection_applied.connect(func(projection): projection_applied.emit(projection))
	controller.status_changed.connect(func(message): status_changed.emit(message))
	# A page realized during a session joins it, as if it had been attached at open.
	if _bridge != null: controller.attach_session(_bridge)
	_controllers[route] = controller
	_bind_commands(view, prefix, controller)
	_bind_navigation(view, prefix)
	_documents.register_controller(route, preload("res://src/workbench_controller.gd").new(
		route, view, controller.refresh_workbench, controller.teardown))


func _controller(route: String) -> MediaController:
	_documents.view(route)
	return _controllers[route]


func open_media(kind: String, identity: String) -> Dictionary:
	return await _controller(MEDIA_ROUTES[kind]).open_media(identity)


# Nothing plays from a Sounds page that was never realized.
func stop_sound_preview() -> void:
	if _controllers.has("assets.sounds"): _controllers["assets.sounds"].stop_preview()


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


# Gallery pages link to each other, never to themselves (Icons inherits the Pictures signals).
func _bind_navigation(view: Control, prefix: String) -> void:
	for kind in ["picture", "sound", "icon"]:
		if kind != prefix and view.has_signal(kind + "_route_requested"):
			view.connect(kind + "_route_requested", func(): route_requested.emit(MEDIA_ROUTES[kind]))
	if view.has_signal("special_land_route_requested"):
		view.special_land_route_requested.connect(func(): special_land_requested.emit())


func attach_session(bridge: RefCounted) -> void:
	_bridge = bridge
	for controller in _controllers.values(): controller.attach_session(bridge)


func teardown() -> void:
	_bridge = null


func dispose() -> void:
	for controller in _controllers.values(): controller.dispose()
