class_name ProvidenceCommandBar
extends HBoxContainer

signal undo_requested
signal redo_requested
signal back_requested
signal forward_requested
signal validate_requested
signal commit_requested
signal save_requested
signal compile_requested
signal commands_requested
signal search_requested

@onready var command_title: Label = %CommandTitle
@onready var undo_button: Button = %Undo
@onready var redo_button: Button = %Redo
@onready var back_button: Button = %Back
@onready var forward_button: Button = %Forward
@onready var commit_button: Button = %CommitEdit
@onready var commands_button: Button = %Commands
@onready var search_button: Button = %Search
var route_has_commit := true
var compact_commit := false


func set_project_identity(project_id: String, project_backed: bool) -> void:
	var label: Label = $ProvidenceBrand/ProjectName
	label.text = "No project open" if project_id.is_empty() else (project_id if project_backed else "Example — " + project_id)
	label.tooltip_text = label.text


func set_route_has_commit(available: bool, keep_compact: bool = false) -> void:
	route_has_commit = available
	compact_commit = keep_compact
	_update_compact_layout()


func present_document(identity: String, view: Control, special_land_world: bool) -> void:
	var chrome := preload("res://src/document_chrome.gd").describe(identity, view, special_land_world)
	set_location(chrome.title)
	if not str(chrome.applyLabel).is_empty(): commit_button.text = chrome.applyLabel
	commit_button.disabled = not chrome.canApply
	if view.has_method("can_apply_draft"): commit_button.disabled = not view.can_apply_draft()
	set_route_has_commit(chrome.showApply, chrome.compactApply)


func set_location(title: String) -> void:
	command_title.text = title
	command_title.tooltip_text = title.strip_edges()


func _ready() -> void:
	resized.connect(_update_compact_layout)
	resized.connect(queue_redraw)
	call_deferred("_update_compact_layout")


func _update_compact_layout() -> void:
	var compact := size.x < 1760.0
	commit_button.visible = route_has_commit and (not compact or compact_commit)
	commands_button.text = "Commands"
	commands_button.tooltip_text = "Open command palette"


func set_rail_width(width: float) -> void:
	$RailCap.custom_minimum_size.x = width
	queue_redraw()


func _draw() -> void:
	var border := (get_theme_stylebox("normal", "Button") as StyleBoxFlat).border_color
	draw_line(Vector2($RailCap.size.x, size.y - 1), Vector2(size.x, size.y - 1), border)


func set_session_state(connected: bool, busy: bool, recovery: bool, project_backed: bool) -> void:
	search_button.disabled = not connected or busy or recovery
	search_button.tooltip_text = "Search Scenario · Ctrl+Shift+F" if not search_button.disabled else (
		"Reopen the project before searching." if recovery else "Wait for the current operation." if busy else "Open a project to search content and links.")
	$Validate.disabled = not connected or busy or recovery
	$Save.disabled = not connected or busy or recovery
	$Compile.disabled = not connected or not project_backed or busy or recovery
	if not connected:
		set_location("No document open")
		undo_button.disabled = true
		redo_button.disabled = true
		commit_button.disabled = true
