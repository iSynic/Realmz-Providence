class_name ProvidenceDungeonEditor
extends VBoxContainer

signal cell_open_requested(x: int, y: int)
signal cell_selected(x: int, y: int, tile: int, action_point: Dictionary)
signal primitive_update_requested(x: int, y: int, primitive: String, enabled: bool)
signal action_point_placement_requested(cell: Vector2i, action_point: Dictionary)
signal placement_canceled
signal action_point_activated(identity: String)
signal random_rectangles_requested(map_identity: String)
signal paint_stroke_started
signal paint_stroke_changed(count: int)
signal paint_stroke_requested(cells: Array)
signal paint_stroke_cancelled
signal selection_stroke_started
signal selection_stroke_changed
signal selection_stroke_requested(cells: Array)
signal selection_stroke_cancelled
signal tool_changed(mode: String)
signal script_authoring_requested

@onready var _title: Label = %DungeonMapTitle
@onready var _canvas: ProvidenceMapCanvas = %DungeonMapCanvas
@onready var _dock: Control = %DungeonFeatureDock
@onready var _preview: Control = %DungeonFeaturePreview

var draft := preload("res://src/dungeon_feature_draft.gd").new()
var commit_handler: Callable
var _region_active := false
var atlas_projection: Dictionary = {}


var _map_identity := ""
var _selected := Vector2i(-1, -1)
var _locked := false
var _recovery := false
var _guard_action := Callable()
var _mode := "select"
var _draw_preset: Dictionary = {}
var _paint_draft: Dictionary = {}
var _selection_shape := "cell"
const SELECTION_SHAPES := ["cell", "rectangle", "line", "ellipse", "connected-exact", "connected-features"]


func set_region_editor_active(active: bool) -> void:
	_region_active = active
	cancel_paint_stroke()
	$DungeonWorkbench/DungeonCellInspector.visible = not active
	if active: tool_changed.emit("regions")


func request_tool(tool: String) -> void:
	if _locked or _map_identity.is_empty(): return
	if tool == "wand": guard_navigation(_set_selection_shape.bind(4))
	elif tool in ["paint", "select", "pan", "sample", "action-point"]: guard_navigation(_set_mode.bind(tool))


func _ready() -> void:
	%ExportMapImage.pressed.connect(func(): %MapImageExport.open(_canvas, _map_identity.replace(":", "-")))
	_canvas.action_point_placement_requested.connect(action_point_placement_requested.emit)
	_canvas.placement_canceled.connect(placement_canceled.emit)
	%CellScript.pressed.connect(script_authoring_requested.emit)
	%ActionPointTool.pressed.connect(request_tool.bind("action-point"))
	draft.changed.connect(_render_draft)
	_dock.feature_changed.connect(func(primitive, enabled):
		if _locked: return
		if _mode == "paint" and _paint_draft.is_empty():
			_draw_preset[primitive] = enabled
			_render_draft()
		else: draft.edit(primitive, enabled))
	_dock.apply_requested.connect(commit_selected)
	_dock.discard_requested.connect(discard_draft)
	_dock.clear_requested.connect(func():
		if not _locked: draft.clear_to_wall())
	%DungeonDraftGuard.confirmed.connect(_apply_guard)
	%DungeonDraftGuard.add_button("Discard", false, &"discard")
	%DungeonDraftGuard.custom_action.connect(func(action):
		if action == &"discard": discard_draft(); _finish_guard())
	%DungeonDraftGuard.canceled.connect(func():
		_guard_action = Callable()
		show_selection_preview(draft.cells)
		_render_draft())
	for mode: String in ["paint", "select", "pan", "sample"]:
		get_node("%" + {"paint": "DrawTool", "select": "SelectTool", "pan": "PanTool", "sample": "SampleTool"}[mode]).pressed.connect(func(): guard_navigation(_set_mode.bind(mode)))
	_canvas.paint_stroke_started.connect(func():
		if _mode == "select": selection_stroke_started.emit()
		else: paint_stroke_started.emit())
	_canvas.paint_stroke_changed.connect(func(count):
		if _mode == "select": selection_stroke_changed.emit()
		else: paint_stroke_changed.emit(count))
	_canvas.paint_stroke_requested.connect(func(cells):
		if _mode == "select": selection_stroke_requested.emit(cells)
		else: paint_stroke_requested.emit(cells))
	_canvas.paint_stroke_cancelled.connect(func():
		selection_stroke_cancelled.emit()
		paint_stroke_cancelled.emit())
	_canvas.tile_sample_requested.connect(func(cell): guard_navigation(_select_cell.bind(cell.x, cell.y, 0, {})))
	for primitive: String in _dock.FIELDS: _draw_preset[primitive] = primitive == "wall"
	%SelectionShape.item_selected.connect(func(index): guard_navigation(_set_selection_shape.bind(index)))
	%WandTool.pressed.connect(func(): guard_navigation(_set_selection_shape.bind(4)))
	_set_mode("select")
	_render_draft()


func set_document(result: Dictionary) -> void:
	var map: Dictionary = result.get("map", {})
	_map_identity = str(map.get("identity", ""))
	_set_map_title(map)
	_canvas.set_document(map.get("tiles", []), result.get("actionPoints", []))
	_selected = Vector2i(-1, -1)
	_locked = false
	_recovery = false
	_guard_action = Callable()
	_paint_draft.clear()
	_preview.clear()
	_preview.select_cells([])
	%DungeonDraftGuard.hide()
	draft.clear()


func refresh_document(result: Dictionary) -> void:
	var map: Dictionary = result.get("map", {})
	if str(map.get("identity", "")) != _map_identity:
		set_document(result)
		return
	_set_map_title(map)
	_canvas.refresh_document(map.get("tiles", []), result.get("actionPoints", []))


func _set_map_title(map: Dictionary) -> void:
	_title.text = "DUNGEON %02d · %s · 90 × 90" % [int(map.get("nativeIndex", 0)), str(map.get("name", "No map open"))]
	%ExportMapImage.disabled = str(map.get("identity", "")).is_empty()


func set_render_atlas(projection: Dictionary) -> bool:
	atlas_projection = projection.duplicate(true)
	_dock.set_atlas(projection)
	_preview.set_atlas(projection)
	return _canvas.set_render_atlas(projection)


func clear_render_atlas() -> void:
	atlas_projection.clear()
	_canvas.clear_render_atlas()
	_dock.set_atlas({})
	_preview.set_atlas({})


func set_cell_projection(result: Dictionary) -> void:
	_selected = Vector2i(int(result.get("x", -1)), int(result.get("y", -1)))
	_canvas.select_cell(_selected.x, _selected.y, false, false)
	draft.bind_cell(result)
	_paint_draft.clear()
	_preview.clear()
	_preview.select_cells(draft.cells)
	if _mode == "sample":
		_draw_preset = draft.features.duplicate(true)
		_set_mode("paint")
	_dock.set_status("Cell %d,%d · feature changes stay local until Apply." % [_selected.x, _selected.y])


func set_selection_projection(result: Dictionary) -> void:
	draft.bind_selection(result)
	_paint_draft.clear()
	_preview.clear()
	_preview.select_cells(draft.cells)


func selected_coordinate() -> Vector2i:
	return _selected

func focus_source(_identity: String, _slot: int, field: String) -> bool:
	return preload("res://src/map_source_navigation.gd").focus(_canvas, field)


func set_script_destination(enabled: bool, existing: bool) -> void:
	%CellScript.disabled = not enabled
	%ActionPointTool.disabled = not enabled
	%CellScript.text = "Open Action Point…" if existing else "Create Action Point here…"


func update_cell_value(x: int, y: int, tile: int) -> void:
	_canvas.update_cell(x, y, tile)


func has_unapplied_changes() -> bool:
	return draft.has_changes() or not _paint_draft.is_empty() or _recovery


func discard_draft() -> void:
	if _locked or _recovery: return
	draft.discard()
	if not _paint_draft.is_empty() and draft.baseline.is_empty(): draft.clear()
	_paint_draft.clear()
	_preview.clear()
	_preview.select_cells(draft.cells)
	_dock.set_status("Feature changes discarded.")


func commit_selected() -> Dictionary:
	if _mode == "paint" and _paint_draft.is_empty():
		for primitive: String in _draw_preset: draft.edit(primitive, bool(_draw_preset[primitive]))
	return await commit_handler.call() if commit_handler.is_valid() else {"ok": false, "error": "Open a project first."}


func set_loading(value: bool) -> void:
	_locked = value or _recovery
	_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE if _locked else Control.MOUSE_FILTER_STOP
	_render_draft()


func show_submission_failure(response: Dictionary) -> void:
	_recovery = bool(response.get("outcomeUnknown", false)) or bool(response.get("viewRefreshPending", false))
	_locked = _recovery
	_dock.set_status(str(response.get("error", "Your feature draft is kept.")), _recovery)
	set_loading(_locked)


func finish_recovery() -> void:
	_recovery = false
	_locked = false
	set_loading(false)


func recovery_button() -> Button:
	return get_node("%DungeonFeatureDock").get_node("%ReconcileFeatures")


func _render_draft() -> void:
	if not is_node_ready(): return
	var drawing := _mode == "paint" and _paint_draft.is_empty()
	var features: Dictionary = _draw_preset if drawing else draft.features
	_dock.present(features, has_unapplied_changes(), _locked, _recovery, draft.cells.size(), drawing)
	for candidate: String in ["paint", "select", "pan", "sample"]:
		var button: Button = get_node("%" + {"paint": "DrawTool", "select": "SelectTool", "pan": "PanTool", "sample": "SampleTool"}[candidate])
		button.set_pressed_no_signal(candidate == _mode)
		button.disabled = _locked
	%SelectionShape.disabled = _locked
	%SelectionShape.select(SELECTION_SHAPES.find(_selection_shape))
	%SelectionOperation.disabled = _locked
	%SelectionOutline.disabled = _locked or _selection_shape not in ["rectangle", "ellipse"]
	%WandTool.disabled = _locked


func _on_canvas_cell_selected(x: int, y: int, tile: int, action_point: Dictionary) -> void:
	if _locked or _mode != "select" or _selection_shape != "cell": return
	if _selected.x >= 0: _canvas.select_cell(_selected.x, _selected.y, false, false)
	guard_navigation(_select_cell.bind(x, y, tile, action_point))


func _select_cell(x: int, y: int, tile: int, action_point: Dictionary) -> void:
	_selected = Vector2i(x, y)
	_canvas.select_cell(x, y, false, false)
	cell_selected.emit(x, y, tile, action_point)
	cell_open_requested.emit(x, y)


func guard_navigation(action: Callable) -> void:
	if _locked: return
	if not has_unapplied_changes(): action.call(); return
	_guard_action = action
	%DungeonDraftGuard.dialog_text = "This selection has unapplied feature changes. Apply, discard them, or keep editing before continuing."
	%DungeonDraftGuard.popup_centered()


func _apply_guard() -> void:
	var response := await commit_selected()
	if response.get("ok", false): _finish_guard()


func _finish_guard() -> void:
	if has_unapplied_changes(): return
	%DungeonDraftGuard.hide()
	var action := _guard_action
	_guard_action = Callable()
	if action.is_valid(): action.call()


func _on_canvas_action_point_activated(identity: String) -> void:
	guard_navigation(action_point_activated.emit.bind(identity))


func _on_zoom_out_pressed() -> void: _canvas.zoom_out()
func _on_zoom_in_pressed() -> void: _canvas.zoom_in()
func _on_zoom_fit_pressed() -> void: _canvas.zoom_fit()


func _on_random_rectangles_pressed() -> void:
	if not _map_identity.is_empty(): guard_navigation(random_rectangles_requested.emit.bind(_map_identity))


func _set_mode(mode: String) -> void:
	_mode = mode
	tool_changed.emit(mode)
	_canvas.set_interaction_mode("paint" if mode == "select" and _selection_shape != "cell" else mode)
	for candidate: String in ["paint", "select", "pan", "sample"]:
		get_node("%" + {"paint": "DrawTool", "select": "SelectTool", "pan": "PanTool", "sample": "SampleTool"}[candidate]).set_pressed_no_signal(candidate == mode)
	_render_draft()
	if mode == "paint": show_feature_status("Draw preset · release to apply one stroke · Esc cancels. Apply uses the current selection.")
	elif mode == "sample": show_feature_status("Click a cell to sample its writable features into the draw preset.")
	elif mode == "action-point": show_feature_status("Action Point placement · click an empty cell to review · click an existing AP to open · Esc selects")


func can_draw() -> bool:
	return _mode == "paint" and not _locked and not has_unapplied_changes() and not _map_identity.is_empty()


func selected_cells() -> Array:
	return draft.cells.duplicate(true)


func read_navigation_state() -> Dictionary:
	var focus := get_viewport().gui_get_focus_owner()
	return {"identity":_map_identity,"canvas":_canvas.read_navigation_state(),"cells":selected_cells(),"mode":_mode,"shape":_selection_shape,
		"drawPreset":_draw_preset.duplicate(true),"focus":str(get_path_to(focus)) if is_instance_valid(focus) and is_ancestor_of(focus) else ""}


func restore_navigation_state(state: Dictionary) -> bool:
	if str(state.get("identity",""))!=_map_identity: return false
	var shape := str(state.get("shape","cell")); _selection_shape = shape if shape in SELECTION_SHAPES else "cell"
	_draw_preset = state.get("drawPreset",{}).duplicate(true); _set_mode(str(state.get("mode","select")))
	_canvas.restore_navigation_state(state.get("canvas",{}))
	var cell: Array = state.get("canvas",{}).get("cell",[-1,-1])
	_selected = Vector2i(int(cell[0]),int(cell[1])) if cell.size()==2 else Vector2i(-1,-1)
	var selected: Dictionary = _canvas.selected_cell()
	if not selected.is_empty(): cell_selected.emit(int(selected.x),int(selected.y),int(selected.tile),selected.actionPoint)
	await get_tree().process_frame
	var focus := get_node_or_null(str(state.get("focus",""))) as Control
	if is_instance_valid(focus) and focus.is_visible_in_tree(): focus.grab_focus()
	else: _canvas.grab_focus()
	return true


func set_stamp_active(active: bool) -> void:
	cancel_paint_stroke()
	_mode = "stamp" if active else "select"
	_canvas.set_interaction_mode("select")
	%StampTool.set_pressed_no_signal(active)
	_render_draft()


func clear_stamp_indicator() -> void:
	%StampTool.set_pressed_no_signal(false)


func paint_positions() -> Array: return _canvas.paint_positions()
func cancel_paint_stroke() -> void:
	if is_node_ready(): _canvas.cancel_paint_stroke()
func clear_paint_preview() -> void:
	if is_node_ready(): _preview.clear()
func show_feature_status(message: String) -> void: _dock.set_status(message)


func draw_changes() -> Array:
	var changes: Array = []
	for primitive: String in _draw_preset: changes.append({"primitive": primitive, "enabled": bool(_draw_preset[primitive])})
	return changes


func show_paint_preview(result: Dictionary) -> void:
	_preview.present(result.get("renderCells", []))
	show_feature_status("Preview · %d changed · %d unchanged · %d managed cells preserved · release to apply" % [result.get("paintedCells", []).size(), int(result.get("unchangedCells", 0)), int(result.get("managedCells", 0))])


func stage_paint(submitted: Dictionary, preview: Dictionary = {}) -> void:
	draft.bind_selection({"mapIdentity": submitted.identity, "revision": submitted.expectedRevision,
		"cells": submitted.edit.cells, "features": preview.get("originalFeatures", [])})
	for change: Dictionary in submitted.edit.changes: draft.features[str(change.primitive)] = bool(change.enabled)
	_paint_draft = submitted.duplicate(true)
	var last: Dictionary = submitted.edit.cells.back()
	_selected = Vector2i(int(last.x), int(last.y))
	_canvas.select_cell(_selected.x, _selected.y, false, false)
	_preview.select_cells(draft.cells)
	_render_draft()


func submitted_features() -> Dictionary:
	if _paint_draft.is_empty(): return draft.submitted()
	var submitted := _paint_draft.duplicate(true)
	submitted.edit.changes = []
	for primitive: String in draft.features:
		submitted.edit.changes.append({"primitive": primitive, "enabled": bool(draft.features[primitive])})
	return submitted


func complete_submission(revision: int) -> void:
	_paint_draft.clear()
	draft.revision = revision
	draft.baseline = draft.features.duplicate(true)
	_preview.clear()
	_render_draft()


func _set_selection_shape(index: int) -> void:
	_selection_shape = SELECTION_SHAPES[index]
	_set_mode("select")
	show_feature_status("Select %s · drag to preview · release to inspect. Choose Replace, Add or Subtract selection." % _selection_shape.replace("-", " "))


func selection_request() -> Dictionary:
	return {"shape": _selection_shape, "start": {}, "end": {}, "filled": not %SelectionOutline.button_pressed,
		"operation": ["replace", "add", "subtract"][%SelectionOperation.selected], "current": draft.cells.duplicate(true)}


func show_selection_preview(cells: Array) -> void:
	_preview.select_cells(cells)


func accept_selection(result: Dictionary) -> void:
	var anchor: Dictionary = result.get("anchor", {})
	_selected = Vector2i(int(anchor.get("x", -1)), int(anchor.get("y", -1)))
	if result.get("cells", []).is_empty():
		_selected = Vector2i(-1, -1)
		_canvas.clear_selection()
	else: _canvas.select_cell(_selected.x, _selected.y, false, false)
	set_selection_projection(result)
	show_feature_status("%d selected cells · only touched feature controls will change. Apply commits the selection together." % draft.cells.size())


func rebase_kept_features(result: Dictionary) -> void:
	var changes: Array = submitted_features().edit.changes
	draft.bind_selection(result)
	for change: Dictionary in changes: draft.edit(str(change.primitive), bool(change.enabled))
	if not _paint_draft.is_empty(): _paint_draft.expectedRevision = int(result.revision)
	_render_draft()


func placement_focus_control() -> Control:
	return _canvas
