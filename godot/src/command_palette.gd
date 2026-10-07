class_name ProvidenceCommandPalette
extends PopupPanel

signal command_requested(command: String)

@onready var _search: LineEdit = %CommandSearch
@onready var _rows: Array[Control] = [
	%OpenCurrentMapRow,
	%FitMapRow,
	%ToggleActionPointsRow,
	%PaintSelectedTileRow,
	%StampSelectionRow,
	%RevealMapRow,
]
@onready var _buttons: Dictionary = {
	"map.open-current": %OpenCurrentMap,
	"map.fit": %FitMap,
	"map.toggle-action-points": %ToggleActionPoints,
	"map.paint-selected-tile": %PaintSelectedTile,
	"map.stamp-selection": %StampSelection,
	"map.reveal-explorer": %RevealMap,
}


func _ready() -> void:
	visibility_changed.connect(_on_visibility_changed)


func popup_palette(context: Dictionary) -> void:
	_set_command_state("map.open-current", bool(context.get("hasMap", false)), "Open or import a map first.")
	_set_command_state("map.fit", bool(context.get("hasMap", false)), "Open or import a map first.")
	_set_command_state("map.toggle-action-points", bool(context.get("hasMap", false)), "Open or import a map first.")
	_set_command_state("map.paint-selected-tile", bool(context.get("landEditable", false)), "Painting requires an editable land map.")
	_set_command_state("map.stamp-selection", false, "Reusable stamp commands are not implemented.")
	_set_command_state("map.reveal-explorer", false, "Reveal in Explorer is not implemented.")
	_search.text = ""
	_filter_rows("")
	popup_centered(Vector2i(620, 430))
	_search.call_deferred("grab_focus")


func command_enabled(command: String) -> bool:
	var button := _buttons.get(command) as Button
	return button != null and not button.disabled


func _set_command_state(command: String, enabled: bool, reason: String) -> void:
	var button := _buttons.get(command) as Button
	button.disabled = not enabled
	button.tooltip_text = "" if enabled else reason


func _filter_rows(query: String) -> void:
	var normalized := query.strip_edges().to_lower()
	var visible_count := 0
	for row in _rows:
		var button := row.get_child(0) as Button
		row.visible = normalized.is_empty() or button.text.to_lower().contains(normalized)
		if row.visible:
			visible_count += 1
	%CommandPaletteStatus.text = "%d result%s · disabled commands explain why" % [visible_count, "" if visible_count == 1 else "s"]


func _request_command(command: String) -> void:
	var button := _buttons.get(command) as Button
	if button.disabled:
		return
	hide()
	command_requested.emit(command)


func _on_visibility_changed() -> void:
	if not visible:
		_search.text = ""


func _on_search_changed(query: String) -> void:
	_filter_rows(query)
