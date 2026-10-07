extends VBoxContainer

signal pane_requested(pane: String)
signal width_changed(width: int)
signal recovery_requested

const PANES := ["Map Setup", "Paint Inspector", "Dungeon Draw", "Selection Inspector", "Land Layout", "Land Tiles", "Random Rectangles", "Action Point Placement"]
var _panels: Dictionary = {}
var _current := ""
var _collapsed := false
var _expanded_width := 352
var _label := "Paint Inspector"


func _ready() -> void:
	for pane: String in PANES: %InspectorChooser.add_item(pane)
	%InspectorChooser.item_selected.connect(func(index):
		var requested: String = PANES[index]
		%InspectorChooser.select(PANES.find(_label))
		pane_requested.emit(requested))
	if get_parent() is SplitContainer:
		get_parent().dragged.connect(func(_offset): _remember_size.call_deferred())
		get_parent().resized.connect(_apply_collapse.call_deferred)
	%CollapseMapInspector.pressed.connect(collapse)
	%ShowMapInspector.pressed.connect(restore)
	%RecoverMapOperation.pressed.connect(recovery_requested.emit)


func set_recovery_available(enabled: bool) -> void:
	%RecoverMapOperation.visible = enabled


func mount(panel: Control, key: String) -> void:
	_panels[key] = panel
	if panel.get_parent() != %InspectorContent: panel.reparent(%InspectorContent)
	panel.size_flags_horizontal = SIZE_EXPAND_FILL
	panel.size_flags_vertical = SIZE_EXPAND_FILL
	panel.visible = key == _current and not _collapsed


func set_context(dungeon: bool, has_map: bool) -> void:
	for index in PANES.size():
		var unavailable: bool = not has_map or PANES[index] == ("Paint Inspector" if dungeon else "Dungeon Draw")
		%InspectorChooser.set_item_disabled(index, unavailable)
		%InspectorChooser.get_popup().set_item_tooltip(index, "Create or open a map first." if not has_map else "This inspector belongs to the other map type." if unavailable else "")


func show_pane(key: String, label: String) -> void:
	_current = key
	_label = label
	var index := PANES.find(label)
	if index >= 0: %InspectorChooser.select(index)
	for panel: Control in _panels.values(): panel.visible = panel == _panels.get(key) and not _collapsed
	%InspectorEmpty.visible = not _panels.has(key) and not _collapsed
	_apply_collapse()


func collapse() -> void:
	if get_parent() is SplitContainer: _remember_size()
	_collapsed = true; _apply_collapse()
	%ShowMapInspector.grab_focus()


func restore() -> void:
	_collapsed = false; show_pane(_current, %InspectorChooser.get_item_text(%InspectorChooser.selected))
	%InspectorChooser.grab_focus()


func preferred_width() -> int:
	return 136 if _collapsed else _expanded_width


func remember_width(width: int) -> void:
	if not _collapsed: _expanded_width = clampi(width, 352, 640)


func _remember_size() -> void:
	remember_width(int(size.x))


func _apply_collapse() -> void:
	%InspectorHeader.visible = not _collapsed
	%InspectorScroll.visible = not _collapsed
	%ShowMapInspector.visible = _collapsed
	custom_minimum_size.x = 136 if _collapsed else 352
	if get_parent() is SplitContainer:
		get_parent().split_offset = int((get_parent().size.x - get_parent().get_theme_constant("separation")) / 2) - preferred_width()
	width_changed.emit(preferred_width())
