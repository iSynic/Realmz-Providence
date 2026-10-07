extends RefCounted

signal artwork_applied(projection: Dictionary, record_index: int)
signal projection_applied(projection: Dictionary)
signal save_requested
signal save_as_requested
signal status_changed(message: String)
signal failed(message: String)

const Routes = preload("res://src/route_catalog.gd")
const Workspace = preload("res://src/unified_assets_editor.tscn")

var library_workbench: Control
var chooser: Control
var return_workspace: Control
var _parent: Control
var _tabs: TabContainer
var _items: ProvidenceItemEditor
var _guard: Callable
var _select_tab: Callable
var _read_context: Callable
var _bridge: RefCounted
var _resource_editors: Dictionary = {}
var _resource_openers: Dictionary = {}
var _special_land_route: Callable
var _source_opener: Callable
var _text_preview: Callable
var _import_menu: PopupMenu
var _operations: ProvidenceEditorOperation
var _generation := 0


func initialize(parent: Control, tabs: TabContainer, items: ProvidenceItemEditor, guard: Callable, select_tab: Callable, operations: ProvidenceEditorOperation) -> void:
	_parent = parent
	_tabs = tabs
	_items = items
	_guard = guard
	_select_tab = select_tab
	_operations = operations


func configure_resources(editors: Dictionary, openers: Dictionary, special_land_route: Callable, source_opener: Callable, text_preview: Callable = Callable()) -> void:
	_resource_editors = editors
	_resource_openers = openers
	_special_land_route = special_land_route
	_source_opener = source_opener
	_text_preview = text_preview


func attach_session(bridge: RefCounted, read_context: Callable) -> void:
	_generation += 1
	_bridge = bridge
	_read_context = read_context
	for view in [library_workbench, chooser]:
		if is_instance_valid(view): view.attach_session(bridge)


func project_changed() -> void:
	for view in [library_workbench, chooser]:
		if is_instance_valid(view): view.mark_stale()


func refresh_visible(operation: ProvidenceEditorOperation) -> Dictionary:
	var view := _tabs.get_current_tab_control()
	if view not in [library_workbench, chooser]: return {"ok": true}
	return await view.refresh_after_history(_bridge, operation)


func teardown() -> void:
	_generation += 1
	return_workspace = null
	if is_instance_valid(chooser):
		chooser.end_item_selection()
		chooser.reload(null)
	if is_instance_valid(library_workbench): library_workbench.reload(null)
	_items.set_return_to_assets_visible(false)
	_bridge = null


func configure_workbench(workbench: Control) -> void:
	workbench.configure_operations(_operations)
	workbench.configure_text_links(_source_opener,_text_preview)
	workbench.set_meta("owns_asset_workspace", true)
	workbench.set_resource_opener(func(row: Dictionary): _guard.call(open_resource.bind(row), "editing the resource"))
	workbench.scenario_importer = func(): _guard.call(open_import.bind(workbench.selected_asset_kind()), "importing a scenario resource")
	workbench.set_scenario_remover(func(identity: String): _guard.call(confirm_removal.bind(identity), "removing scenario artwork"))
	workbench.set_item_opener(func(identity: String): _guard.call(open_item_use.bind(identity), "opening the item"))
	workbench.set_source_opener(func(reference: Dictionary): _guard.call(_source_opener.bind(reference), "opening the artwork use"))
	workbench.artwork_applied.connect(func(projection, record_index): artwork_applied.emit(projection, record_index))
	workbench.scenario_changed.connect(func(projection): projection_applied.emit(projection))
	workbench.save_requested.connect(func(): save_requested.emit())
	workbench.save_as_requested.connect(func(): save_as_requested.emit())


func open_import(kind: String = "all") -> void:
	if kind == "all":
		if _import_menu == null:
			_import_menu = preload("res://src/asset_import_menu.tscn").instantiate()
			_import_menu.id_pressed.connect(func(index: int): open_import(["icon", "picture", "sound", "special-land-tile"][index]))
			_parent.add_child(_import_menu)
		_import_menu.position = Vector2i(_parent.get_global_mouse_position())
		_import_menu.popup()
		return
	var editor: Control = import_editor(kind)
	if editor == null:
		failed.emit("Import is not yet available for this resource type.")
		return
	await _select_tab.call(editor.get_index())
	editor.request_import()


func import_editor(kind: String) -> Control:
	return _resource_editors.get(kind)


func open_resource(row: Dictionary) -> void:
	var kind := str(row.get("kind", ""))
	if not _resource_openers.has(kind): return
	var response: Dictionary = await _resource_openers[kind].call(str(row.get("identity", "")))
	if not response.get("ok", false): return
	if kind == "special-land-tile":
		_special_land_route.call()
	else:
		var route: String = {"picture": "assets.pictures", "sound": "assets.sounds", "icon": "assets.icons"}[kind]
		await _select_tab.call(Routes.tab_for_route(route))


func restore_location(route: String, state: Dictionary) -> bool:
	var kind := str({"assets.pictures": "picture", "assets.sounds": "sound", "assets.icons": "icon"}.get(route, ""))
	if kind.is_empty() or not _resource_openers.has(kind): return false
	var draft := state.get("draft", {}) as Dictionary
	var identity := str(state.get("identity", draft.get("identity", "")))
	if identity.is_empty(): return false
	var response: Dictionary = await _resource_openers[kind].call(identity)
	if response.get("ok", false) and _resource_editors.has(kind):
		var view: Control = _resource_editors[kind]
		if view.has_method("restore_navigation_state"): view.restore_navigation_state(state)
	return bool(response.get("ok", false))


func confirm_removal(identity: String) -> void:
	var generation := _generation
	var revision := int(_read_context.call().revision)
	var opened := await _operations.run_workflow(_bridge, "Check artwork removal", _check_removal.bind(identity, revision))
	if generation != _generation: return
	if not _accept(opened): return
	var icons: Control = _resource_editors.icon
	icons.set_document(opened.result)
	icons.request_checked_removal()


func _check_removal(operation: ProvidenceEditorOperation, identity: String, revision: int) -> Dictionary:
	var assessment := await operation.request("project-asset.open", {
		"identity": identity, "expectedRevision": revision, "offset": 0, "limit": 1})
	if not assessment.get("ok", false): return assessment
	if not bool(assessment.result.get("removable", false)):
		return {"ok": false, "error": str(assessment.result.get("removalReason", "Artwork could not be checked. Return to Assets and retry."))}
	return await operation.request("icon.open", {"identity": identity})


func open_item_use(identity: String) -> void:
	var origin := _tabs.get_current_tab_control()
	if origin.get_meta("owns_asset_workspace", false):
		return_workspace = origin
		_items.set_return_to_assets_visible(true)
	await _select_tab.call(Routes.tab_for_route("economy.items"))
	await _items.open_item(identity)
	if str(_items.selected_definition().get("id", "")) == identity: _items.focus_artwork_id()


func return_to_artwork() -> void:
	if is_instance_valid(return_workspace) and return_workspace.get_parent() == _tabs:
		await _select_tab.call(return_workspace.get_index())
	else:
		return_workspace = null
		_items.set_return_to_assets_visible(false)
		failed.emit("The original Assets workspace is no longer open.")


func open_library(scope: String) -> void:
	if not is_instance_valid(library_workbench):
		library_workbench = Workspace.instantiate()
		_tabs.add_child(library_workbench)
		configure_workbench(library_workbench)
	library_workbench.attach_session(_bridge)
	await library_workbench.show_scope(scope)
	await _select_tab.call(library_workbench.get_index())
	status_changed.emit({"personal": "My Library · personal and supplied artwork collections",
		"scenario": "Scenario Assets · all resource types", "stock": "Stock Assets · all resource types"}[scope])


func open_stock_asset(identity: String) -> Dictionary:
	await open_library("stock")
	if not is_instance_valid(library_workbench):
		return {"ok": false, "error": "The Stock Assets workbench is unavailable."}
	return await library_workbench.open_stock_asset(identity)


func open_catalog_asset(identity: String, scope: String) -> Dictionary:
	await open_library(scope)
	if not is_instance_valid(library_workbench): return {"ok": false, "error": "The Assets workbench is unavailable."}
	return await library_workbench.open_catalog_asset(identity, scope)


func open_scenario_asset(identity: String) -> Dictionary:
	await open_library("scenario")
	if not is_instance_valid(library_workbench):
		return {"ok": false, "error": "The Scenario Assets workbench is unavailable."}
	return await library_workbench.open_scenario_asset(identity)


func return_to_scenario() -> void:
	if not is_instance_valid(library_workbench) or library_workbench.current_scope() != "scenario":
		await open_library("scenario")
	else:
		await _select_tab.call(library_workbench.get_index())


func choose_item_artwork() -> void:
	var item := _items.selected_definition()
	if item.is_empty() or not _items.can_choose_library_artwork(): return
	if not is_instance_valid(chooser):
		chooser = Workspace.instantiate()
		_tabs.add_child(chooser)
		configure_workbench(chooser)
		chooser.item_selection_cancelled.connect(cancel_item_artwork)
		chooser.artwork_applied.connect(func(_projection, _record_index):
			chooser.end_item_selection()
			_items.focus_artwork_choice())
	await chooser.begin_item_selection(_bridge, item, int(_read_context.call().revision))
	await _select_tab.call(chooser.get_index())


func cancel_item_artwork() -> void:
	if _operations.busy: return
	chooser.end_item_selection()
	await _select_tab.call(Routes.tab_for_route("economy.items"))
	_items.focus_artwork_choice()


func _accept(response: Dictionary) -> bool:
	if response.get("ok", false): return true
	failed.emit(str(response.get("error", "Native command failed.")))
	return false
