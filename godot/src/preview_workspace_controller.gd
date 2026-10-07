extends RefCounted

signal status_changed(message: String)
signal selection_changed
signal failed(message: String)

const SELECT_TARGET := "Select an applied map cell, Action Point, standalone Extra AP program, Simple/Complex/Rogue Encounter, scrolling TEXT resource, Battle, Treasure, or Shop."

var selection := preload("res://src/rebuilt_preview_selection.gd").new()
var _registry
var _tabs: TabContainer
var _map: ProvidenceMapDocumentController
var _preview: ProvidenceRebuiltPreviewController
var _operations: ProvidenceEditorOperation
var _drafts
var _read_context: Callable
var _read_bridge: Callable


func initialize(registry, tabs: TabContainer, map: ProvidenceMapDocumentController, preview: ProvidenceRebuiltPreviewController, operations: ProvidenceEditorOperation, drafts, read_context: Callable, read_bridge: Callable, battle_view: Control = null) -> void:
	if battle_view != null: battle_view.preview_requested.connect(start)
	_registry = registry
	_tabs = tabs
	_map = map
	_preview = preview
	_operations = operations
	_drafts = drafts
	_read_context = read_context
	_read_bridge = read_bridge
	preview.configure_operations(operations)
	preview.status_changed.connect(_status)
	preview.preview_failed.connect(func(error: Dictionary): _status(str(error.get("message", "Rebuilt preview failed."))))
	preview.preview_finished.connect(selection_changed.emit)


func current_target() -> Dictionary:
	if _registry == null: return {}
	var encounter: Dictionary = _registry.view("encounters.simple").current_encounter()
	var action_point = _registry.view("scripts.action-points")
	var draft: bool = _drafts.has_draft()
	return selection.current_target(
		_registry.identity_for_tab(_tabs.current_tab), _map.identity, _map.selected_cell,
		encounter, action_point.current_action_point(), action_point.current_map_identity(),
		_registry.view("combat.battles").current_applied_native_id(),
		_trusted("economy.treasure", draft), _trusted("economy.shops", draft),
		_trusted("encounters.complex", draft), _trusted("encounters.rogue", draft),
		_registry.view("encounters.rogue").trusted_applied_owner_native_id(draft),
		_trusted("scripts.macros", draft))


func _trusted(route: String, draft: bool) -> int:
	return _registry.view(route).trusted_applied_native_id(draft)


func availability() -> Dictionary:
	var target := current_target()
	var state := {"available": false, "reason": "Rebuilt preview is still starting."}
	if _preview != null: state = _preview.availability_for_target(target)
	state["targetAvailable"] = not target.is_empty()
	if _drafts.has_draft(): state["reason"] = "Apply or discard the current field edits before previewing."
	elif _registry.identity_for_tab(_tabs.current_tab) == "encounters.timed": state["reason"] = "Timed preview is unavailable: use its Extra AP or playtest the scenario."
	elif target.is_empty(): state["reason"] = SELECT_TARGET
	return state


func start() -> void:
	if _operations.busy: return
	if _drafts.has_draft():
		_status("Apply or discard the current field edits before previewing.")
		return
	var target := current_target()
	if target.is_empty():
		_status(SELECT_TARGET)
		return
	var context: Dictionary = _read_context.call()
	var started := await _preview.start_preview(_read_bridge.call(), target, int(context.revision))
	if not started.get("ok", false): _status(str(started.get("error", "Rebuilt preview could not start.")))
	selection_changed.emit()


func select_scrolling_text(resource_id: int) -> void:
	var resolved := await selection.select_scrolling_text(_read_bridge.call(), _operations, resource_id)
	if not resolved.get("ok", false): failed.emit(str(resolved.get("error", "Native command failed.")))
	else: status_changed.emit("Selected exact scenario TEXT %d for Rebuilt preview." % resource_id)
	selection_changed.emit()


func _status(message: String) -> void:
	status_changed.emit(message)
	selection_changed.emit()

func preview_scrolling_text(resource_id: int) -> void:
	if _operations.busy or _drafts.has_draft(): return
	var bridge = _read_bridge.call()
	var epoch: int = bridge.connection_epoch()
	var resolved := await selection.select_scrolling_text(bridge,_operations,resource_id)
	if not resolved.get("ok",false): _status(str(resolved.get("error","Could not resolve this text."))); return
	if epoch != bridge.connection_epoch(): return
	var response := await _preview.start_preview(bridge,resolved.target,int(_read_context.call().revision))
	if not response.get("ok",false): _status(str(response.get("error","Could not start Rebuilt preview.")))
	selection_changed.emit()
