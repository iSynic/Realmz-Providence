class_name ProvidenceScenarioIconEditor
extends "res://src/scenario_picture_editor.gd"

signal icon_import_requested(payload: Dictionary)
signal icon_open_requested(identity: String)
signal icon_update_requested(identity: String, label: String, resource_id: int)
signal icon_remove_requested(identity: String)
signal picture_route_requested

const DEFAULT_ICON_ID := 30126


func request_checked_removal() -> void:
	_confirm_remove(true)


func _ready() -> void:
	super()
	name = "Scenario Icons"
	picture_import_requested.connect(func(payload: Dictionary) -> void: icon_import_requested.emit(payload))
	picture_open_requested.connect(func(identity: String) -> void: icon_open_requested.emit(identity))
	picture_update_requested.connect(func(identity: String, label: String, resource_id: int) -> void: icon_update_requested.emit(identity, label, resource_id))
	picture_remove_requested.connect(func(identity: String) -> void: icon_remove_requested.emit(identity))
	_configure_icon_surface()


func set_icons(result: Dictionary, revision: int, preferred_identity: String = "") -> void:
	set_pictures(result, revision, preferred_identity)
	_count.text = "%d CICN RESOURCE%s" % [_pictures.size(), "" if _pictures.size() == 1 else "S"]


func set_document(result: Dictionary) -> void:
	var translated := result.duplicate(true)
	translated["picture"] = (result.get("icon", {}) as Dictionary).duplicate(true)
	super(translated)
	_dimensions.text = "32 × 32 Classic output"
	_scope.text = "Scenario.rsrc  ·  cicn %d" % int(_selected_picture.get("resourceId", 0))


func _content_scene() -> PackedScene:
	return preload("res://src/scenario_icon_content.tscn")


func _connect_route_actions() -> void:
	super()
	_surface.get_node("%PicturesRoute").pressed.connect(func(): picture_route_requested.emit())


func _configure_icon_surface() -> void:
	_resource_id.value = DEFAULT_ICON_ID
	_empty_preview.text = "No icon selected"
	_configure_import()


func _configure_import() -> void:
	_file_dialog.name = "ScenarioIconFileDialog"
	_file_dialog.title = "Import Scenario Icon"
	_import_dialog.name = "ScenarioIconImportDialog"
	_import_dialog.title = _file_dialog.title
	_import_dialog.ok_button_text = "Import Icon"
	_import_name.placeholder_text = "Icon label"
	_import_id.min_value = 1
	_import_id.max_value = 32767
	_import_id.value = DEFAULT_ICON_ID
	_import_dither.visible = false
	var note := _import_dialog.find_child("ImportNote", true, false) as Label
	note.text = ""
	_import_dialog.get_ok_button().tooltip_text = "Classic icons use opaque or transparent pixels. Partial transparency becomes a 1-bit mask."


func _render_gallery(preferred_identity: String) -> void:
	var query := _search.text.strip_edges().to_lower()
	_gallery.clear()
	var selection := -1
	for value in _pictures:
		var icon := value as Dictionary
		var haystack := "%s %s" % [str(icon.get("label", "")), str(icon.get("resourceId", ""))]
		if not query.is_empty() and not haystack.to_lower().contains(query):
			continue
		var index := _gallery.add_item("cicn %d\n%s" % [int(icon.get("resourceId", 0)), str(icon.get("label", "Untitled icon"))], _placeholder_texture(icon))
		_gallery.set_item_metadata(index, icon.duplicate(true))
		if str(icon.get("identity", "")) == preferred_identity:
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
	for resource_id in range(DEFAULT_ICON_ID, 32768):
		if not used.has(resource_id):
			return resource_id
	for resource_id in range(1, DEFAULT_ICON_ID):
		if not used.has(resource_id):
			return resource_id
	return 32767


func _confirm_remove(removal_checked: bool = false) -> void:
	if _selected_identity.is_empty():
		return
	var confirmation := ConfirmationDialog.new()
	var identity := _selected_identity
	confirmation.title = "Remove Scenario Icon?"
	var assessment := "No current uses found. Checked again when removing." if removal_checked else "Artwork still in use cannot be removed."
	confirmation.dialog_text = "Remove \"%s\" from this scenario?\nCurrent picture number: %d\n%s\nUndo can restore removed artwork." % [str(_selected_picture.get("label", identity)), int(_selected_picture.get("resourceId", 0)), assessment]
	confirmation.ok_button_text = "Remove Icon"
	confirmation.confirmed.connect(func() -> void:
		icon_remove_requested.emit(identity)
		confirmation.queue_free()
	)
	confirmation.canceled.connect(confirmation.queue_free)
	add_child(confirmation)
	confirmation.popup_centered(Vector2i(560, 240))
	confirmation.get_cancel_button().grab_focus()
