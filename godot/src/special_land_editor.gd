class_name ProvidenceSpecialLandEditor
extends "res://src/scenario_picture_editor.gd"

signal tile_import_requested(payload: Dictionary)
signal tile_open_requested(identity: String)
signal tile_update_requested(identity: String, label: String, resource_id: int, landlook: Variant, base_tile: Variant)
signal tile_remove_requested(identity: String)
signal paint_tile_requested(resource_id: int)

const DEFAULT_TILE_ID := -100

var _landlook: SpinBox
var _base_tile: SpinBox
var _landlook_enabled: CheckBox
var _base_tile_enabled: CheckBox
var _uses: RichTextLabel
var _missing_notice: Label
var _used_by: Array = []
var _world_context := false


func _ready() -> void:
	super()
	name = "Special Land Tiles"
	picture_open_requested.connect(func(identity: String) -> void: tile_open_requested.emit(identity))
	picture_remove_requested.connect(func(identity: String) -> void: tile_remove_requested.emit(identity))
	_configure_surface()


func set_world_context(enabled: bool) -> void:
	_world_context = enabled
	_surface.visible = not enabled
	%WorldSpecialCatalog.visible = enabled


func read_navigation_state() -> Dictionary:
	if _world_context:
		var state: Dictionary = %WorldSpecialCatalog.read_navigation_state()
		state.worldContext = true
		return state
	return {"worldContext":false,"identity":selected_identity()}


func restore_navigation_state(state: Dictionary) -> bool:
	set_world_context(bool(state.get("worldContext",false)))
	if _world_context: return %WorldSpecialCatalog.restore_navigation_state(state)
	if not str(state.get("identity","")).is_empty(): tile_open_requested.emit(str(state.identity))
	return true


func set_tiles(result: Dictionary, revision: int, preferred_identity: String = "") -> void:
	set_pictures(result, revision, preferred_identity)
	_count.text = "%d SPECIAL LAND TILE%s" % [_pictures.size(), "" if _pictures.size() == 1 else "S"]
	var missing := result.get("missingTargets", []) as Array
	_missing_notice.visible = not missing.is_empty()
	_missing_notice.text = "%d MAP CELL%s NEED%s A MISSING CICN TARGET — IMPORT OR RETARGET" % [
		missing.size(),
		"" if missing.size() == 1 else "S",
		"S" if missing.size() == 1 else "",
	]


func set_document(result: Dictionary) -> void:
	var translated := result.duplicate(true)
	translated["picture"] = (result.get("tile", {}) as Dictionary).duplicate(true)
	super(translated)
	var landlook: Variant = _selected_picture.get("landlook")
	var base_tile: Variant = _selected_picture.get("baseTile")
	_landlook_enabled.button_pressed = landlook != null
	_base_tile_enabled.button_pressed = base_tile != null
	_landlook.value = 0 if landlook == null else int(landlook)
	_base_tile.value = 0 if base_tile == null else int(base_tile)
	_landlook.editable = _landlook_enabled.button_pressed
	_base_tile.editable = _base_tile_enabled.button_pressed
	_dimensions.text = "32 × 32 transparent overlay"
	_scope.text = "Scenario.rsrc  ·  cicn %d" % int(_selected_picture.get("resourceId", 0))
	_used_by = (result.get("usedBy", []) as Array).duplicate(true)
	_render_uses()


func has_unapplied_changes() -> bool:
	if _selected_picture.is_empty():
		return false
	return (
		_name.text != str(_selected_picture.get("label", ""))
		or int(_resource_id.value) != int(_selected_picture.get("resourceId", 0))
		or _optional_spin_value(_landlook_enabled, _landlook) != _selected_picture.get("landlook")
		or _optional_spin_value(_base_tile_enabled, _base_tile) != _selected_picture.get("baseTile")
	)


func discard_draft() -> void:
	if _selected_picture.is_empty():
		return
	_name.text = str(_selected_picture.get("label", ""))
	_resource_id.value = int(_selected_picture.get("resourceId", DEFAULT_TILE_ID))
	var landlook: Variant = _selected_picture.get("landlook")
	var base_tile: Variant = _selected_picture.get("baseTile")
	_landlook_enabled.button_pressed = landlook != null
	_base_tile_enabled.button_pressed = base_tile != null
	_landlook.value = 0 if landlook == null else int(landlook)
	_base_tile.value = 0 if base_tile == null else int(base_tile)
	_landlook.editable = _landlook_enabled.button_pressed
	_base_tile.editable = _base_tile_enabled.button_pressed


func commit_selected() -> void:
	if _selected_identity.is_empty() or not has_unapplied_changes():
		return
	if commit_handler.is_valid():
		var payload := draft_metadata()
		payload.label = str(payload.label).strip_edges()
		await commit_handler.call(payload)
		return
	tile_update_requested.emit(
		_selected_identity,
		_name.text.strip_edges(),
		int(_resource_id.value),
		_optional_spin_value(_landlook_enabled, _landlook),
		_optional_spin_value(_base_tile_enabled, _base_tile)
	)


func draft_metadata() -> Dictionary:
	var metadata := super()
	metadata["landlook"] = _optional_spin_value(_landlook_enabled, _landlook)
	metadata["baseTile"] = _optional_spin_value(_base_tile_enabled, _base_tile)
	return metadata


func import_for_smoke(path: String, label: String, resource_id: int, image: Image, _dither := false) -> void:
	await _emit_picture_import(path, label, resource_id, image, false)


func _emit_picture_import(path: String, label: String, resource_id: int, image: Image, _dither: bool) -> void:
	var rgba := image.duplicate()
	rgba.convert(Image.FORMAT_RGBA8)
	var payload := {
		"path": path,
		"label": label,
		"resourceId": resource_id,
		"width": rgba.get_width(),
		"height": rgba.get_height(),
		"rgbaBase64": Marshalls.raw_to_base64(rgba.get_data()),
		"landlook": _optional_spin_value(_landlook_enabled, _landlook),
		"baseTile": _optional_spin_value(_base_tile_enabled, _base_tile),
	}
	if import_handler.is_valid(): await import_handler.call(payload)
	else: tile_import_requested.emit(payload)


func _content_scene() -> PackedScene:
	return preload("res://src/special_land_content.tscn")


func _connect_route_actions() -> void:
	pass


func _configure_surface() -> void:
	_resource_id.value = DEFAULT_TILE_ID
	_empty_preview.text = "No special artwork selected"
	_configure_import()
	_landlook = _surface.get_node("%SpecialLandLandlook")
	_base_tile = _surface.get_node("%SpecialLandBaseTile")
	_landlook_enabled = _surface.get_node("%UseSpecialLandLandlook")
	_base_tile_enabled = _surface.get_node("%UseSpecialLandBaseTile")
	_uses = _surface.get_node("%SpecialLandUsedBy")
	_missing_notice = _surface.get_node("%MissingSpecialLandTargets")
	_landlook_enabled.toggled.connect(func(enabled: bool): _landlook.editable = enabled)
	_base_tile_enabled.toggled.connect(func(enabled: bool): _base_tile.editable = enabled)
	_surface.get_node("%SelectSpecialLandForPainting").pressed.connect(_select_for_painting)


func _select_for_painting() -> void:
	if not _selected_identity.is_empty():
		paint_tile_requested.emit(int(_resource_id.value))


func _configure_import() -> void:
	_file_dialog.name = "SpecialLandFileDialog"
	_file_dialog.title = "Import Special Land Tile"
	_import_dialog.name = "SpecialLandImportDialog"
	_import_dialog.title = _file_dialog.title
	_import_dialog.ok_button_text = "Import Tile"
	_import_name.placeholder_text = "Special Land Tile label"
	_import_id.min_value = -32768
	_import_id.max_value = -1
	_import_id.value = DEFAULT_TILE_ID
	_import_dither.visible = false
	var note := _import_dialog.find_child("ImportNote", true, false) as Label
	note.text = ""
	_import_dialog.get_ok_button().tooltip_text = "Transparent pixels show the underlying terrain."


func _optional_spin_value(enabled: CheckBox, field: SpinBox) -> Variant:
	return int(field.value) if enabled.button_pressed else null


func _render_gallery(preferred_identity: String) -> void:
	var query := _search.text.strip_edges().to_lower()
	_gallery.clear()
	var selection := -1
	for value in _pictures:
		var tile := value as Dictionary
		var haystack := "%s %s" % [str(tile.get("label", "")), str(tile.get("resourceId", ""))]
		if not query.is_empty() and not haystack.to_lower().contains(query):
			continue
		var text := "cicn %d  ·  %s" % [
			int(tile.get("resourceId", 0)),
			str(tile.get("label", "Untitled Special Land Tile")),
		]
		var index := _gallery.add_item(text, _placeholder_texture(tile))
		_gallery.set_item_tooltip(index, "%s\ncicn %d · %d map use%s\nScenario.rsrc" % [
			str(tile.get("label", "Untitled Special Land Tile")),
			int(tile.get("resourceId", 0)),
			int(tile.get("uses", 0)),
			"" if int(tile.get("uses", 0)) == 1 else "s",
		])
		_gallery.set_item_metadata(index, tile.duplicate(true))
		if str(tile.get("identity", "")) == preferred_identity:
			selection = index
	if _gallery.item_count == 0:
		_clear_selection()
		return
	if selection < 0:
		selection = 0
	_gallery.select(selection)
	_select_gallery_item(selection)


func _next_picture_id() -> int:
	var used := {}
	for value in _pictures:
		used[int((value as Dictionary).get("resourceId", 0))] = true
	for resource_id in range(DEFAULT_TILE_ID, -32769, -1):
		if not used.has(resource_id):
			return resource_id
	for resource_id in range(-1, DEFAULT_TILE_ID, -1):
		if not used.has(resource_id):
			return resource_id
	return -32768


func _render_uses() -> void:
	if _used_by.is_empty():
		_uses.text = "No map cells currently use this tile."
		return
	var lines: Array[String] = []
	for value in _used_by.slice(0, 8):
		var reference := value as Dictionary
		lines.append("[color=#9dcfff]%s[/color]  %s" % [
			str(reference.get("source", "map")),
			str(reference.get("field", "tile")),
		])
	if _used_by.size() > 8:
		lines.append("+ %d more uses" % (_used_by.size() - 8))
	_uses.text = "\n".join(lines)


func _clear_selection() -> void:
	super()
	if _landlook != null:
		_landlook.value = 0
	if _base_tile != null:
		_base_tile.value = 0
	if _uses != null:
		_uses.text = "No artwork selected."


func _confirm_remove() -> void:
	if _selected_identity.is_empty():
		return
	var confirmation := ConfirmationDialog.new()
	confirmation.title = "Remove Special Land Tile?"
	confirmation.dialog_text = "Remove %s from authored project truth? Used map cells will become release-blocking missing references." % str(_selected_picture.get("label", _selected_identity))
	confirmation.ok_button_text = "Remove Tile"
	confirmation.confirmed.connect(func() -> void:
		tile_remove_requested.emit(_selected_identity)
		confirmation.queue_free()
	)
	confirmation.canceled.connect(confirmation.queue_free)
	add_child(confirmation)
	confirmation.popup_centered(Vector2i(620, 260))
