class_name ProvidenceMapInspector
extends PanelContainer

signal collapse_requested
signal commit_tile_requested(tile: int)
signal open_action_point_requested(identity: String)
signal repair_reference_requested(target_native_id: int)
signal open_reference_requested(reference: Dictionary)
signal mode_selected(mode: String)
signal raw_brush_changed
signal tool_requested(tool: String)

@onready var _level_type: Label = %InspectorMode
@onready var _selection_mode: Button = %SelectionInspectorMode
@onready var _paint_mode: Button = %PaintInspectorMode
@onready var _selected_cell_panel: PanelContainer = %SelectedCellPanel
@onready var _paint_panel: PanelContainer = %PaintInspectorPanel
@onready var _paint_brush: SpinBox = %PaintBrushTile
@onready var _paint_brush_summary: Label = %PaintBrushSummary
@onready var _coordinate: Label = %SelectedCoordinate
@onready var _tile_summary: Label = %SelectedTileSummary
@onready var _tile: SpinBox = %SelectedTile
@onready var _commit: Button = %CommitSelectedTile
@onready var _action_point_panel: PanelContainer = %SelectedActionPointPanel
@onready var _action_point_identity: Label = %SelectedActionPointIdentity
@onready var _action_point_kind: Label = %SelectedActionPointKind
@onready var _open_action_point: Button = %OpenSelectedActionPoint
@onready var _current_target: Label = %CurrentMapReferenceTarget
@onready var _reference_source: Label = %MapReferenceSource
@onready var _reference_field: Label = %MapReferenceField
@onready var _repair_target: SpinBox = %MapReferenceRepairTarget
@onready var _repair: Button = %RepairMapReference
@onready var _peek: Button = %PeekMapReference
@onready var _evidence_toggle: Button = %MapEvidenceToggle
@onready var _evidence_details: VBoxContainer = %MapEvidenceDetails
@onready var _evidence_identity: Label = %MapEvidenceIdentity
@onready var _evidence_family: Label = %MapEvidenceFamily
@onready var _evidence_bytes: Label = %MapEvidenceBytes

var _action_point_id := ""
var _reference: Dictionary = {}
var _cell_selected := false
var _tile_editable := false
var _inspector_mode := "select"


func _ready() -> void:
	for name: String in ["CellSelectionOptions", "CellPaintOptions", "CellSmartTerrain", "CellSavedStamps"]:
		var tool: String = "smart" if name == "CellSmartTerrain" else "stamp" if name == "CellSavedStamps" else "shapes"
		get_node("%" + name).pressed.connect(func(): tool_requested.emit(tool))
	_set_evidence_expanded(false)
	set_mode("select")
	set_overview("", "land", false, "No cell selected.")


func set_overview(map_identity: String, level_type: String, editable: bool, reason: String) -> void:
	%CellBehavior.disabled = true
	_level_type.text = "DUNGEON" if level_type == "dungeon" else "LAND"
	_coordinate.text = "No cell selected"
	_tile_summary.text = "No cell selected."
	_tile.value = 0
	_cell_selected = false
	_tile_editable = editable
	_paint_mode.disabled = not editable
	_paint_mode.tooltip_text = "Paint requires an editable land map." if not editable else "Drag to paint; release to apply one stroke. Esc cancels."
	_commit.disabled = true
	_commit.tooltip_text = reason
	_action_point_id = ""
	_action_point_panel.visible = false
	_clear_reference("No Action Point selected")
	_evidence_identity.text = map_identity if not map_identity.is_empty() else "map:—"
	_evidence_family.text = "Data DDD / dungeon bitfields" if level_type == "dungeon" else "Data LD / signed-short terrain"
	_evidence_bytes.text = "Select a cell for exact byte ownership"
	if not editable and _inspector_mode == "paint":
		set_mode("select")


func set_cell(
	map_identity: String,
	x: int,
	y: int,
	tile: int,
	action_point: Dictionary,
	reference: Dictionary,
	editable: bool,
	reason: String
) -> void:
	_cell_selected = true
	%CellBehavior.disabled = not editable
	_tile_editable = editable
	_coordinate.text = "CELL %d, %d" % [x, y]
	_tile_summary.text = (
		"Special Land resource %d" % tile
		if tile < 0
		else "Realmz terrain tile %d" % tile
	)
	_tile.value = tile
	_tile.editable = editable
	_commit.disabled = not editable
	_commit.tooltip_text = reason
	_action_point_id = str(action_point.get("identity", ""))
	_action_point_panel.visible = _inspector_mode == "select" and not _action_point_id.is_empty()
	_open_action_point.disabled = _action_point_id.is_empty()
	if not _action_point_id.is_empty():
		_action_point_identity.text = "AP %03d" % int(action_point.get("recordIndex", 0))
		_action_point_kind.text = str(action_point.get("overlayKind", "trigger")).to_upper()
	_set_reference(reference)
	var cell_index := y * 90 + x
	_evidence_identity.text = _action_point_id if not _action_point_id.is_empty() else map_identity
	_evidence_family.text = (
		"Data DD / 40-byte Action Point"
		if not _action_point_id.is_empty()
		else "Data LD / signed-short terrain"
	)
	_evidence_bytes.text = (
		"record %d · action targets 24…39" % int(action_point.get("recordIndex", 0))
		if not _action_point_id.is_empty()
		else "cell bytes %d…%d" % [cell_index * 2, cell_index * 2 + 1]
	)


func set_tile_value(value: int) -> void:
	_tile.value = value


func set_reference(reference: Dictionary) -> void:
	_set_reference(reference)


func set_paint_tile_value(value: int) -> void:
	_paint_brush.value = value
	_update_paint_summary(value)


func tile_value() -> int:
	return int(_tile.value)


func paint_tile_value() -> int:
	return int(_paint_brush.value)


func set_mode(mode: String) -> void:
	_inspector_mode = mode if mode in ["select", "paint"] else "select"
	_selection_mode.set_pressed_no_signal(_inspector_mode == "select")
	_paint_mode.set_pressed_no_signal(_inspector_mode == "paint")
	_selected_cell_panel.visible = _inspector_mode == "select"
	%SelectionToolOptionsPanel.visible = _inspector_mode == "select"
	_paint_panel.visible = _inspector_mode == "paint"
	_action_point_panel.visible = _inspector_mode == "select" and not _action_point_id.is_empty()
	%MapReferencePanel.visible = _inspector_mode == "select"
	%ActionPointLegend.visible = _inspector_mode == "select"


func set_commit_allowed(allowed: bool, reason: String) -> void:
	_tile_editable = allowed
	_tile.editable = allowed
	_commit.disabled = not allowed or not _cell_selected
	_commit.tooltip_text = reason
	_paint_mode.disabled = not allowed
	_paint_mode.tooltip_text = reason
	if not allowed and _inspector_mode == "paint":
		set_mode("select")


func _set_reference(reference: Dictionary) -> void:
	_reference = reference.duplicate(true)
	if reference.is_empty():
		_clear_reference("No typed target on this Action Point")
		return
	var source := str(reference.get("source", "—"))
	var field := str(reference.get("field", "—"))
	var target_id := str(reference.get("targetId", "—"))
	var target_kind := str(reference.get("targetKind", "target")).replace("-", " ").capitalize()
	var resolution := str(reference.get("resolution", "missing"))
	_reference_source.text = source
	_reference_field.text = field
	_current_target.text = "%s %s · %s" % [target_kind, target_id.get_slice(":", target_id.get_slice_count(":") - 1), resolution.to_upper()]
	var slot := -1
	if field.begins_with("actions["):
		slot = field.get_slice("[", 1).get_slice("]", 0).to_int()
	var last_target_part := target_id.get_slice_count(":") - 1
	_repair_target.value = max(target_id.get_slice(":", last_target_part).to_int(), 0)
	_repair_target.editable = slot >= 0
	_repair.disabled = slot < 0
	_repair.text = "Retarget %s" % target_kind if slot >= 0 else "No repair"
	_peek.disabled = target_id == "—" or resolution != "resolved"


func _clear_reference(message: String) -> void:
	_reference.clear()
	_current_target.text = message
	_reference_source.text = "—"
	_reference_field.text = "—"
	_repair_target.value = 0
	_repair_target.editable = false
	_repair.disabled = true
	_repair.text = "No repair"
	_peek.disabled = true


func _on_collapse_pressed() -> void:
	collapse_requested.emit()


func _on_selection_mode_pressed() -> void:
	set_mode("select")
	mode_selected.emit("select")


func _on_paint_mode_pressed() -> void:
	if not _tile_editable:
		set_mode("select")
		return
	set_mode("paint")
	mode_selected.emit("paint")


func _on_paint_brush_changed(value: float) -> void:
	if not is_node_ready():
		return
	_update_paint_summary(int(value))
	raw_brush_changed.emit()


func _update_paint_summary(value: int) -> void:
	_paint_brush_summary.text = (
		"Special Land resource %d" % value
		if value < 0
		else "Realmz terrain tile %d" % value
	)


func _on_commit_pressed() -> void:
	if _cell_selected and _tile_editable:
		commit_tile_requested.emit(tile_value())


func _on_open_action_point_pressed() -> void:
	if not _action_point_id.is_empty():
		open_action_point_requested.emit(_action_point_id)


func _on_repair_pressed() -> void:
	if not _reference.is_empty() and _repair_target.editable:
		repair_reference_requested.emit(int(_repair_target.value))


func _on_peek_pressed() -> void:
	if not _reference.is_empty():
		open_reference_requested.emit(_reference.duplicate(true))


func _on_evidence_toggled(expanded: bool) -> void:
	_set_evidence_expanded(expanded)


func _set_evidence_expanded(expanded: bool) -> void:
	_evidence_toggle.button_pressed = expanded
	_evidence_toggle.text = "Source Evidence  ▾" if expanded else "Source Evidence  ▸"
	_evidence_details.visible = expanded
