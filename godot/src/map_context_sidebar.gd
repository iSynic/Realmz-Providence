class_name ProvidenceMapContextSidebar
extends VBoxContainer

signal map_selected(identity: String)
signal create_map_requested(level_type: String)
signal duplicate_map_requested(identity: String)
signal action_points_requested
signal special_tiles_requested
signal tool_selected(mode: String)
signal authoring_tool_requested(tool: String)

@onready var map_count: Label = %MapCount
@onready var search: LineEdit = %MapSearch
@onready var collection: ItemList = %MapCollection
@onready var empty_state: Label = %MapEmptyState
@onready var current_map: Label = %CurrentMap
@onready var current_map_meta: Label = %CurrentMapMeta
@onready var new_land: Button = %NewLand
@onready var new_dungeon: Button = %NewDungeon
@onready var duplicate: Button = %DuplicateMap
@onready var all_filter: Button = %AllMaps
@onready var land_filter: Button = %LandMaps
@onready var dungeon_filter: Button = %DungeonMaps
@onready var select_tool: Button = %SelectTool
@onready var paint_tool: Button = %PaintTool

var _maps: Array = []
var _selected_identity := ""
var _level_filter := "all"
var _editable := false
var _tool_mode := "select"
var _canvas_active := false
var _paint_available := false
var _brush_controls := false
const AUTHORING_TOOLS := {"ActionPointsTool":"action-point", "BucketTool":"fill", "WandTool":"wand", "StampTool":"stamp", "PanTool":"pan", "SampleTool":"sample", "EraseTool":"erase", "PaintOptions":"shapes", "SmartTool":"smart", "MagicTool":"magic"}


func _ready() -> void:
	%ChooseMap.pressed.connect(open_map_picker)
	for node: String in AUTHORING_TOOLS:
		get_node("%" + node).set_meta("available_help", get_node("%" + node).tooltip_text)
		get_node("%" + node).pressed.connect(func(): authoring_tool_requested.emit(AUTHORING_TOOLS[node]))
	_set_level_filter("all")
	_refresh_controls()


func set_maps(maps: Array, selected_identity: String) -> void:
	_maps = maps.duplicate(true)
	_selected_identity = selected_identity
	_apply_filter()
	_refresh_controls()


func set_selected_map(identity: String) -> void:
	_selected_identity = identity
	_apply_filter()
	_refresh_controls()


func set_editable(editable: bool) -> void:
	_editable = editable
	_refresh_controls()


func present_land_paint(active: bool, available: bool) -> void:
	_paint_available = available
	%TerrainMapping.visible = active and _canvas_active
	_refresh_controls()


func present_world_context(canvas_active: bool) -> void:
	_canvas_active = canvas_active
	%TerrainMapping.visible = canvas_active and str(_selected_map().get("levelType", "land")) == "land"
	$MapToolset.visible = canvas_active
	$MapToolsetHeading.visible = canvas_active
	$CurrentMapPanel.visible = canvas_active and not _brush_controls
	%LevelSetup.visible = canvas_active and not _brush_controls
	_refresh_controls()


func mount_brush_controls(view: Control) -> void:
	view.reparent(%BrushControlsHost)


func show_brush_controls(enabled: bool) -> void:
	_brush_controls=enabled
	%BrushControlsHost.visible=enabled
	$MapBrowserHeader.visible=not enabled
	$MapRecordActions.visible=not enabled
	$CurrentMapPanel.visible=_canvas_active and not enabled
	%LevelSetup.visible=_canvas_active and not enabled


func open_map_picker() -> void:
	%MapPicker.popup_centered(Vector2i(420, 510))
	search.grab_focus()


func visible_map_count() -> int:
	return collection.item_count


func set_tool_mode(mode: String) -> void:
	_tool_mode = mode
	select_tool.set_pressed_no_signal(_tool_mode == "select")
	paint_tool.set_pressed_no_signal(_tool_mode == "paint")
	for node: String in AUTHORING_TOOLS:
		get_node("%" + node).set_pressed_no_signal(AUTHORING_TOOLS[node] == mode)


func _apply_filter() -> void:
	collection.clear()
	var query := search.text.strip_edges().to_lower()
	var selected_index := -1
	for value in _maps:
		var map := value as Dictionary
		var level_type := str(map.get("levelType", "land"))
		if _level_filter != "all" and level_type != _level_filter:
			continue
		var searchable := "%s %s %s" % [
			str(map.get("identity", "")),
			str(map.get("name", "")),
			str(map.get("nativeIndex", 0)),
		]
		if not query.is_empty() and not searchable.to_lower().contains(query):
			continue
		var index := collection.add_item("%s %02d  ·  %s" % [
			"LD" if level_type == "land" else "DG",
			int(map.get("nativeIndex", 0)),
			str(map.get("name", "Unnamed Map")),
		])
		collection.set_item_metadata(index, str(map.get("identity", "")))
		var uses := " · %d uses" % int(map.get("usedBy",0)) if map.get("referencesChecked",true) else ""
		collection.set_item_tooltip(index, "%d Action Points" % int(map.get("actionPoints",0)) + uses + _problem_count(map))
		if str(map.get("identity", "")) == _selected_identity:
			selected_index = index
	if selected_index >= 0:
		collection.select(selected_index)
		collection.ensure_current_is_visible()
	map_count.text = "%d / %d" % [collection.item_count, _maps.size()]
	empty_state.visible = collection.item_count == 0


func _refresh_controls() -> void:
	new_land.disabled = not _editable
	new_dungeon.disabled = not _editable
	duplicate.disabled = not _editable or _selected_identity.is_empty()
	%LevelSetup.disabled = not _editable or _selected_identity.is_empty()
	%RandomAreaTool.disabled = not _editable or _selected_identity.is_empty()
	var selected := _selected_map()
	var dungeon := str(selected.get("levelType", "land")) == "dungeon"
	var ready := _editable and _canvas_active and not selected.is_empty()
	%TerrainMapping.disabled = not ready or dungeon
	paint_tool.text = "Draw" if dungeon else "Paint"
	paint_tool.disabled = not ready or not dungeon and not _paint_available
	select_tool.disabled = not ready
	for node: String in AUTHORING_TOOLS:
		var tool: String = AUTHORING_TOOLS[node]
		var button: Button = get_node("%" + node)
		button.disabled = not ready or dungeon and tool in ["fill", "erase", "shapes", "smart", "magic"] or not dungeon and not _paint_available and tool in ["fill", "erase", "sample", "stamp", "shapes", "magic"]
		button.tooltip_text = "This tool requires an open editable map." if not ready else "Use Dungeon Draw to edit cell flags." if dungeon and button.disabled else "Tile artwork is unavailable. Open Assets to inspect it." if button.disabled else str(button.get_meta("available_help", ""))
	%ActionPointsTool.disabled = not ready
	if selected.is_empty():
		current_map.text = "No map selected"
		%ChooseMap.text = "Choose a map…"
		current_map_meta.text = "No map selected."
		return
	current_map.text = str(selected.get("name", "Unnamed Map"))
	%ChooseMap.text = "%s %02d · %s ▾" % ["DG" if dungeon else "LD", int(selected.get("nativeIndex", 0)), current_map.text]
	current_map_meta.text = "%s %d · 90 × 90 · %d AP" % [
		str(selected.get("levelType", "land")).capitalize(),
		int(selected.get("nativeIndex", 0)),
		int(selected.get("actionPoints", 0)),
	] + _problem_count(selected)


func _problem_count(map: Dictionary) -> String:
	return " · %d problems" % int(map.get("problems",0)) if map.get("diagnosticsChecked",true) else ""


func _selected_map() -> Dictionary:
	for value in _maps:
		var map := value as Dictionary
		if str(map.get("identity", "")) == _selected_identity:
			return map
	return {}


func _on_search_changed(_query: String) -> void:
	_apply_filter()


func _on_collection_selected(index: int) -> void:
	var identity := str(collection.get_item_metadata(index))
	if identity.is_empty():
		return
	if identity == _selected_identity:
		%MapPicker.hide(); %ChooseMap.grab_focus(); return
	_selected_identity = identity
	_refresh_controls()
	%MapPicker.hide()
	%ChooseMap.grab_focus()
	map_selected.emit(identity)


func _set_level_filter(level_filter: String) -> void:
	_level_filter = level_filter
	all_filter.button_pressed = level_filter == "all"
	land_filter.button_pressed = level_filter == "land"
	dungeon_filter.button_pressed = level_filter == "dungeon"
	_apply_filter()


func _on_new_land_pressed() -> void:
	create_map_requested.emit("land")


func _on_new_dungeon_pressed() -> void:
	create_map_requested.emit("dungeon")


func _on_duplicate_pressed() -> void:
	if not _selected_identity.is_empty():
		duplicate_map_requested.emit(_selected_identity)


func _on_action_points_pressed() -> void:
	action_points_requested.emit()


func _on_special_tiles_pressed() -> void:
	special_tiles_requested.emit()


func _on_select_tool_pressed() -> void:
	set_tool_mode("select")
	authoring_tool_requested.emit("select")


func _on_paint_tool_pressed() -> void:
	if paint_tool.disabled:
		return
	set_tool_mode("paint")
	authoring_tool_requested.emit("paint")
