class_name ProvidenceScenarioPictureEditor
extends VBoxContainer

signal picture_import_requested(payload: Dictionary)
signal picture_open_requested(identity: String)
signal picture_update_requested(identity: String, label: String, resource_id: int)
signal picture_remove_requested(identity: String)
signal compile_requested
signal selection_changed(picture: Dictionary)
signal sound_route_requested
signal icon_route_requested
signal library_scope_requested(scope: String)
signal special_land_route_requested

const MIN_PICTURE_ID := 30000
const MAX_PICTURE_ID := 30128

var _pictures: Array = []
var _revision := 0
var _selected_identity := ""
var _selected_picture: Dictionary = {}
var _surface: Control
var _search: LineEdit
var _gallery: ItemList
var _count: Label
var _name: LineEdit
var _resource_id: SpinBox
var _dimensions: Label
var _source: Label
var _payload: Label
var _scope: Label
var _status: Label
var _preview: TextureRect
var _empty_preview: Label
var _apply: Button
var _remove: Button
var _compile: Button
var _file_dialog: FileDialog
var _import_dialog: ConfirmationDialog
var _import_name: LineEdit
var _import_id: SpinBox
var _import_dither: CheckBox
var _pending_path := ""
var _pending_image: Image
var commit_handler: Callable
var import_handler: Callable


func selected_identity() -> String:
	return _selected_identity


func present_selection() -> void:
	selection_changed.emit(_selected_picture.duplicate(true))


func draft_metadata() -> Dictionary:
	return {"identity": _selected_identity, "label": _name.text, "resourceId": int(_resource_id.value)}


func accept_saved_metadata(metadata: Dictionary) -> void:
	if str(metadata.get("identity", "")) != _selected_identity: return
	# Advance the applied baseline without overwriting typing made after submission.
	for key in ["label", "resourceId", "landlook", "baseTile"]:
		if metadata.has(key): _selected_picture[key] = metadata[key]


func read_state() -> Dictionary:
	return {"draft": draft_metadata(), "query": _search.text}


func catalog_identity(items: Array, preferred: String = "") -> String:
	var target := preferred if not preferred.is_empty() else _selected_identity
	var first := ""
	var query := _search.text.strip_edges().to_lower()
	for row: Dictionary in items:
		var text := "%s %s" % [row.get("label", ""), row.get("resourceId", "")]
		if not query.is_empty() and not text.to_lower().contains(query): continue
		var identity := str(row.get("identity", ""))
		if identity == target: return identity
		if first.is_empty(): first = identity
	return first


func restore_catalog_selection() -> void:
	_gallery.deselect_all()
	for index in _gallery.item_count:
		if str(_gallery.get_item_metadata(index).get("identity", "")) == _selected_identity:
			_gallery.select(index)
			return


func _ready() -> void:
	name = "Scenario Pictures"
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 10)
	_bind_surface()
	_build_import_dialogs()
	_clear_selection()


func set_pictures(result: Dictionary, revision: int, preferred_identity: String = "") -> void:
	var previous := preferred_identity if not preferred_identity.is_empty() else _selected_identity
	_pictures = (result.get("items", []) as Array).duplicate(true)
	_revision = revision
	_count.text = "%d PICT RESOURCE%s" % [_pictures.size(), "" if _pictures.size() == 1 else "S"]
	_render_gallery(previous)


func set_document(result: Dictionary) -> void:
	_revision = int(result.get("revision", _revision))
	_selected_picture = (result.get("picture", {}) as Dictionary).duplicate(true)
	_selected_identity = str(_selected_picture.get("identity", ""))
	_name.text = str(_selected_picture.get("label", ""))
	var imported_id := int(_selected_picture.get("resourceId", MIN_PICTURE_ID))
	_resource_id.min_value = minf(_resource_id.min_value, imported_id)
	_resource_id.max_value = maxf(_resource_id.max_value, imported_id)
	_resource_id.value = imported_id
	_dimensions.text = "%d × %d source image" % [
		int(_selected_picture.get("width", 0)),
		int(_selected_picture.get("height", 0)),
	]
	_source.text = "Source blob  %s" % _short_hash(str(result.get("sourceBlob", "")))
	_payload.text = "%s bytes  ·  %s" % [
		_format_number(int(result.get("classicPayloadBytes", 0))),
		_short_hash(str(result.get("classicPayloadBlob", ""))),
	]
	_scope.text = "Scenario.rsrc  ·  PICT %d" % int(_selected_picture.get("resourceId", 0))
	_status.text = "Ready for Classic compile"
	_status.add_theme_color_override("font_color", Color("77d6a1"))
	_apply.disabled = false
	_remove.disabled = false
	selection_changed.emit(_selected_picture.duplicate(true))


func set_preview_base64(base64: String, mime_type: String) -> void:
	var texture := _decode_preview_texture(base64, mime_type)
	if texture == null:
		_preview.texture = null
		_empty_preview.text = "Preview unavailable"
		_empty_preview.visible = true
		return
	_preview.texture = texture
	_empty_preview.visible = false


func set_thumbnail_base64(identity: String, base64: String, mime_type: String) -> void:
	var texture := _decode_preview_texture(base64, mime_type)
	if texture == null:
		return
	for index in range(_gallery.item_count):
		var picture := _gallery.get_item_metadata(index) as Dictionary
		if str(picture.get("identity", "")) == identity:
			_gallery.set_item_icon(index, texture)
			return


func set_compile_available(available: bool, reason: String = "") -> void:
	_compile.disabled = not available
	_compile.tooltip_text = reason if not available else "Validate and compile Scenario.rsrc deterministically."


func has_unapplied_changes() -> bool:
	if _selected_picture.is_empty():
		return false
	return _name.text != str(_selected_picture.get("label", "")) or int(_resource_id.value) != int(_selected_picture.get("resourceId", 0))


func discard_draft() -> void:
	if not _selected_picture.is_empty():
		_name.text = str(_selected_picture.get("label", ""))
		_resource_id.value = int(_selected_picture.get("resourceId", MIN_PICTURE_ID))


func commit_selected() -> void:
	if _selected_identity.is_empty() or not has_unapplied_changes():
		return
	if commit_handler.is_valid():
		var payload := draft_metadata()
		payload.label = str(payload.label).strip_edges()
		await commit_handler.call(payload)
	else:
		picture_update_requested.emit(_selected_identity, _name.text.strip_edges(), int(_resource_id.value))


func import_for_smoke(path: String, label: String, resource_id: int, image: Image, dither := true) -> void:
	await _emit_picture_import(path, label, resource_id, image, dither)


func _content_scene() -> PackedScene:
	return preload("res://src/scenario_picture_content.tscn")


func _bind_surface() -> void:
	_surface = _content_scene().instantiate()
	add_child(_surface)
	_search = _surface.get_node("%PictureSearch")
	_gallery = _surface.get_node("%ScenarioPictureGallery")
	_count = _surface.get_node("%ResourceCount")
	_name = _surface.get_node("%PictureLabel")
	_resource_id = _surface.get_node("%PictureResourceId")
	_dimensions = _surface.get_node("%Dimensions")
	_source = _surface.get_node("%Source")
	_payload = _surface.get_node("%Payload")
	_scope = _surface.get_node("%Scope")
	_status = _surface.get_node("%Status")
	_preview = _surface.get_node("%PicturePreview")
	_empty_preview = _surface.get_node("%EmptyPreview")
	_apply = _surface.get_node("%ApplyPictureMetadata")
	_remove = _surface.get_node("%RemovePicture")
	_compile = _surface.get_node("%CompileScenarioPictures")
	_search.text_changed.connect(func(_value: String): _render_gallery(_selected_identity))
	_gallery.item_selected.connect(_select_gallery_item)
	_gallery.item_activated.connect(_activate_gallery_item)
	_apply.pressed.connect(commit_selected)
	_remove.pressed.connect(_confirm_remove)
	_compile.pressed.connect(func(): compile_requested.emit())
	_surface.get_node("%ImportPicture").pressed.connect(_show_import_file_dialog)
	_connect_route_actions()


func _connect_route_actions() -> void:
	_surface.get_node("%ScenarioAssets").pressed.connect(func(): library_scope_requested.emit("scenario"))
	_surface.get_node("%CustomLibrary").pressed.connect(func(): library_scope_requested.emit("personal"))
	_surface.get_node("%ReferenceAssets").pressed.connect(func(): library_scope_requested.emit("stock"))
	_surface.get_node("%SoundsRoute").pressed.connect(func(): sound_route_requested.emit())
	_surface.get_node("%IconsRoute").pressed.connect(func(): icon_route_requested.emit())
	_surface.get_node("%SpecialLandRoute").pressed.connect(func(): special_land_route_requested.emit())


func _build_import_dialogs() -> void:
	_file_dialog = FileDialog.new()
	_file_dialog.name = "ScenarioPictureFileDialog"
	_file_dialog.title = "Import Scenario Picture"
	_file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_file_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_file_dialog.use_native_dialog = true
	_file_dialog.add_filter("*.png, *.jpg, *.jpeg, *.webp, *.bmp", "Image files")
	_file_dialog.file_selected.connect(_prepare_import)
	add_child(_file_dialog)
	_import_dialog = ConfirmationDialog.new()
	_import_dialog.name = "ScenarioPictureImportDialog"
	_import_dialog.title = "Import Scenario Picture"
	_import_dialog.ok_button_text = "Import Picture"
	_import_dialog.confirmed.connect(_confirm_import)
	var fields := preload("res://src/scenario_picture_import_content.tscn").instantiate()
	_import_name = fields.get_node("%ImportLabel")
	_import_id = fields.get_node("%ImportResourceId")
	_import_dither = fields.get_node("%ImportDither")
	_import_dialog.add_child(fields)
	add_child(_import_dialog)


func _render_gallery(preferred_identity: String) -> void:
	if has_unapplied_changes(): return
	var query := _search.text.strip_edges().to_lower()
	_gallery.clear()
	var selection := -1
	for value in _pictures:
		var picture := value as Dictionary
		var haystack := "%s %s" % [str(picture.get("label", "")), str(picture.get("resourceId", ""))]
		if not query.is_empty() and not haystack.to_lower().contains(query):
			continue
		var index := _gallery.add_item("PICT %d · %s" % [int(picture.get("resourceId", 0)), str(picture.get("label", "Untitled picture"))], _placeholder_texture(picture))
		_gallery.set_item_metadata(index, picture.duplicate(true))
		if str(picture.get("identity", "")) == preferred_identity:
			selection = index
	if _gallery.item_count == 0:
		_clear_selection()
		return
	if selection < 0:
		selection = 0
	_gallery.select(selection)
	_select_gallery_item(selection)


func _select_gallery_item(index: int) -> void:
	if index < 0 or index >= _gallery.item_count:
		return
	var picture := _gallery.get_item_metadata(index) as Dictionary
	# Selection is applied only after its record and preview have been read.
	picture_open_requested.emit(str(picture.get("identity", "")))


func _activate_gallery_item(index: int) -> void:
	_select_gallery_item(index)
	_name.grab_focus()


func _show_import_file_dialog() -> void:
	_file_dialog.popup_centered_ratio(0.72)


func request_import() -> void:
	_show_import_file_dialog()


func _prepare_import(path: String) -> void:
	var image := Image.load_from_file(path)
	if image == null or image.is_empty():
		_status.text = "Could not decode the selected image"
		_status.add_theme_color_override("font_color", Color("f09a82"))
		return
	_pending_path = path
	_pending_image = image
	_import_name.text = path.get_file().get_basename().replace("_", " ").replace("-", " ").capitalize()
	_import_id.value = _next_picture_id()
	_import_dialog.dialog_text = "%s  ·  %d × %d" % [path.get_file(), image.get_width(), image.get_height()]
	_import_dialog.popup_centered(Vector2i(640, 360))


func _confirm_import() -> void:
	if _pending_image == null or _pending_image.is_empty():
		return
	await _emit_picture_import(_pending_path, _import_name.text.strip_edges(), int(_import_id.value), _pending_image, _import_dither.button_pressed)


func _emit_picture_import(path: String, label: String, resource_id: int, image: Image, dither: bool) -> void:
	var rgba := image.duplicate()
	rgba.convert(Image.FORMAT_RGBA8)
	var payload := {
		"path": path,
		"label": label,
		"resourceId": resource_id,
		"width": rgba.get_width(),
		"height": rgba.get_height(),
		"rgbaBase64": Marshalls.raw_to_base64(rgba.get_data()),
		"dither": dither,
	}
	if import_handler.is_valid(): await import_handler.call(payload)
	else: picture_import_requested.emit(payload)


func _confirm_remove() -> void:
	if _selected_identity.is_empty():
		return
	var confirmation := ConfirmationDialog.new()
	confirmation.title = "Remove Scenario Picture?"
	confirmation.dialog_text = "Remove %s from authored project truth? Existing references will become diagnostics." % str(_selected_picture.get("label", _selected_identity))
	confirmation.ok_button_text = "Remove Picture"
	confirmation.confirmed.connect(func() -> void:
		picture_remove_requested.emit(_selected_identity)
		confirmation.queue_free()
	)
	confirmation.canceled.connect(confirmation.queue_free)
	add_child(confirmation)
	confirmation.popup_centered(Vector2i(560, 240))


func _clear_selection() -> void:
	_selected_identity = ""
	_selected_picture = {}
	_name.text = ""
	_resource_id.value = MIN_PICTURE_ID
	_dimensions.text = "—"
	_payload.text = "—"
	_source.text = "—"
	_scope.text = "Scenario.rsrc"
	_status.text = "No picture selected"
	_status.add_theme_color_override("font_color", Color("9eb1c2"))
	_preview.texture = null
	_empty_preview.text = "No picture selected"
	_empty_preview.visible = true
	_apply.disabled = true
	_remove.disabled = true
	present_selection()


func _next_picture_id() -> int:
	var used := {}
	for value in _pictures:
		used[int((value as Dictionary).get("resourceId", 0))] = true
	for resource_id in range(MIN_PICTURE_ID, MAX_PICTURE_ID + 1):
		if not used.has(resource_id):
			return resource_id
	return MAX_PICTURE_ID


func _placeholder_texture(picture: Dictionary) -> Texture2D:
	var width := 150
	var height := 104
	var image := Image.create(width, height, false, Image.FORMAT_RGBA8)
	var seed := int(picture.get("resourceId", MIN_PICTURE_ID))
	var base := Color.from_hsv(float(abs(seed * 37) % 360) / 360.0, 0.44, 0.46)
	var light := base.lightened(0.34)
	image.fill(base)
	for y in range(height / 2, height):
		for x in range(width):
			if ((x / 12) + (y / 9)) % 3 == 0:
				image.set_pixel(x, y, light)
	return ImageTexture.create_from_image(image)


func _decode_preview_texture(base64: String, mime_type: String) -> Texture2D:
	var bytes := Marshalls.base64_to_raw(base64)
	if bytes.is_empty(): return null
	var image := Image.new()
	var error := ERR_FILE_UNRECOGNIZED
	match mime_type:
		"image/jpeg":
			error = image.load_jpg_from_buffer(bytes)
		"image/webp":
			error = image.load_webp_from_buffer(bytes)
		"image/bmp":
			error = image.load_bmp_from_buffer(bytes)
		_:
			error = image.load_png_from_buffer(bytes)
	return ImageTexture.create_from_image(image) if error == OK else null


func _short_hash(value: String) -> String:
	return value.left(12) if value.length() > 12 else value


func _format_number(value: int) -> String:
	var source := str(value)
	var result := ""
	while source.length() > 3:
		result = ",%s%s" % [source.right(3), result]
		source = source.left(source.length() - 3)
	return source + result
