extends VBoxContainer

signal route_requested(tab: int)
signal document_applied(context: Dictionary)
signal projection_applied(projection: Dictionary)
@export var library_route := false
const Routes = preload("res://src/route_catalog.gd")
var _attached_bridge
var _pending_selection: Dictionary = {}
var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _project_bridge: Callable
var _library_connection := preload("res://src/monster_library_connection.gd").new()
var _generation := 0
var _authoring := preload("res://src/monster_authoring_controller.gd").new()
var _references := preload("res://src/monster_reference_controller.gd").new()
var _records := preload("res://src/monster_record_operations_controller.gd").new()
var _library_ops := preload("res://src/monster_library_operations_controller.gd").new()


func _ready() -> void:
	$CombatTabs/Battle.pressed.connect(func(): route_requested.emit(Routes.tab_for_route("combat.battles")))
	$CombatTabs/Monster.pressed.connect(func(): route_requested.emit(Routes.tab_for_route("combat.monsters")))
	$CombatTabs/Library.pressed.connect(func(): route_requested.emit(Routes.tab_for_route("combat.scrapbook")))
	$CombatTabs/Monster.set_pressed_no_signal(not library_route)
	$CombatTabs/Library.set_pressed_no_signal(library_route)
	$Workbench.context_changed.connect(func(context: Dictionary): document_applied.emit(context))


func route_identity() -> String:
	return "combat.scrapbook" if library_route else "combat.monsters"


func workbench_title() -> String:
	return "  COMBAT  /  MONSTER LIBRARY" if library_route else "  COMBAT  /  MONSTER EDITOR"


func apply_label() -> String:
	return "Apply"


func current_selection() -> Dictionary:
	if not _pending_selection.is_empty(): return _pending_selection.duplicate(true)
	return $Workbench.selection_snapshot()

func discovery_selection() -> Dictionary:
	var selection := current_selection()
	if selection.get("active", "") == "library":
		return {"kind":"monster-library-entry", "identity":selection.get("libraryIdentity", ""), "nativeId":"", "scope":selection.get("libraryScope", "personal")}
	var id := str(selection.get("nativeId", ""))
	return {"kind":"monster", "identity":"monster:%d:%s" % [int(selection.get("setId", 0)), id], "nativeId":id, "scope":"scenario"}


func configure_operations(operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	_operations = operations
	_project_bridge = read_bridge
	_read_bridge = _active_bridge
	$Workbench.configure_operations(operations)


func configure_authoring(accept_draft: Callable) -> void:
	_authoring.initialize($Workbench, _operations, _read_bridge, accept_draft)
	_authoring.projection_applied.connect(projection_applied.emit)
	$Workbench.configure_authoring()
	_references.initialize($Workbench, $Workbench/ReferencePicker, _operations, _read_bridge)
	_records.initialize($Workbench, $Workbench/OperationReview, _authoring, _operations, _read_bridge, _reload_after_operation)
	_library_ops.initialize($Workbench, $Workbench/OperationReview, _authoring, _operations, _read_bridge, _reload_after_operation)


func _reload_after_operation(selection: Dictionary, operation: ProvidenceEditorOperation) -> Dictionary:
	return await reload(_project_bridge.call(), selection, operation)


func configure_reference_navigation(open_target: Callable, open_source: Callable = Callable()) -> void:
	_references.configure_navigation(open_target)
	$Workbench/UsedBy.configure($Workbench, _operations, _read_bridge, open_source)
	$Workbench/OperationReview.use_open_requested.connect(func(reference: Dictionary):
		$Workbench/OperationReview.cancel()
		await $Workbench/UsedBy.open_reference(reference))


func open_monster_target(set_id: int, native_id: int) -> Dictionary:
	var selection := current_selection()
	selection.merge({"active": "scenario", "setId": set_id, "nativeId": native_id}, true)
	return await reload(_read_bridge.call(), selection)


func open_library_target(identity: String) -> Dictionary:
	var selection := current_selection()
	selection.merge({"active": "library", "libraryIdentity": identity}, true)
	return await reload(_read_bridge.call(), selection)


func read_navigation_state() -> Dictionary:
	var state := current_selection()
	state["connectionEpoch"] = _attached_bridge.connection_epoch() if _attached_bridge != null else -1
	return state


func focus_source(_identity: String, _slot: int, field: String) -> bool:
	return $Workbench.focus_authoring_field("iconId" if field == "icon" else field)


func restore_navigation_state(state: Dictionary) -> bool:
	var bridge = _read_bridge.call()
	if bridge == null or bridge.connection_epoch() != state.get("connectionEpoch", -1): return false
	return (await reload(bridge, state)).get("ok", false)


func has_unapplied_changes() -> bool:
	return $Workbench.has_unapplied_changes()


func discard_draft() -> void:
	$Workbench.discard_draft()


func commit_selected() -> Dictionary:
	return await _authoring.commit()


func refresh_workbench(operation: ProvidenceEditorOperation = null) -> Dictionary:
	return await reload(_project_bridge.call(), current_selection(), operation)


func reload(bridge, selection: Dictionary = {}, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if library_route and bridge is ProvidenceNativeBridge and bridge != _library_connection.bridge:
		var generation := _generation
		var connected: Dictionary = await _library_connection.resolve(bridge, get_tree())
		if not connected.get("ok", false): return connected
		if generation != _generation: return _changed()
		bridge = connected.bridge
	if _operations == null or bridge == null: return await _reload(null, bridge, selection)
	return await _operations.run_workflow(bridge, "Load Monsters", _reload.bind(bridge, selection), borrowed)


func _reload(operation: ProvidenceEditorOperation, bridge, selection: Dictionary) -> Dictionary:
	_generation += 1
	var generation := _generation
	var restore := selection
	if bridge == _attached_bridge and restore.is_empty(): restore = current_selection()
	_attached_bridge = bridge
	_pending_selection.clear()
	var loaded: Dictionary = await $Workbench.attach(bridge, operation)
	# An absent optional Library must not hide valid scenario records. Transport
	# loss, however, aborts the whole borrowed history workflow without retrying.
	if loaded.get("outcomeUnknown", false): return loaded
	if generation != _generation: return _changed()
	if loaded.get("stale", false) or $Workbench.browser.revision < 0: return loaded
	var restored: Dictionary = await $Workbench.restore_selection(restore, operation)
	if restored.get("outcomeUnknown", false): return restored
	if generation != _generation: return _changed()
	return restored if not restored.get("ok", false) else loaded


func clear_selection() -> void:
	_library_connection.close()
	_authoring.teardown()
	_generation += 1
	_attached_bridge = null
	_pending_selection.clear()
	$Workbench.attach(null)


func refresh_project_revision(bridge, revision: int) -> void:
	if has_unapplied_changes(): return
	if $Workbench.browser.revision < 0 or $Workbench.browser.revision == revision:
		return
	if is_visible_in_tree():
		await reload(bridge, current_selection())
	else:
		# Retain navigation identities, not stale project projections or pending
		# thumbnail work. Activation reloads them against the current revision.
		_pending_selection = current_selection()
		$Workbench.attach(null)


func _changed() -> Dictionary:
	return {"ok": false, "connectionChanged": true, "error": "The Monster document session changed while loading."}


func _active_bridge():
	return _library_connection.bridge if _library_connection.bridge != null else _project_bridge.call()


func _exit_tree() -> void:
	_library_connection.close()
