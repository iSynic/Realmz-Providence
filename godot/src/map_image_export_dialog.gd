extends ConfirmationDialog

const Export = preload("res://src/map_image_export.gd")
var _canvas: ProvidenceMapCanvas
var _busy := false
var _write_thread: Thread
@onready var _scale: OptionButton = %ExportScale
@onready var _quality: SpinBox = %ExportQuality
@onready var _overlays: CheckBox = %ExportOverlays
@onready var _status: Label = %ExportStatus
@onready var _file: FileDialog = %ExportFile


func _ready() -> void:
	get_ok_button().text = "Save JPEG…"
	confirmed.connect(_choose_file)
	_file.file_selected.connect(_save)
	_file.canceled.connect(func(): popup_centered())
	_scale.item_selected.connect(func(_index): _dimensions())


func open(canvas: ProvidenceMapCanvas, title: String) -> void:
	if _busy: return
	_canvas = canvas
	_file.current_file = title.validate_filename() + ".jpg"
	_quality.value = Export.DEFAULT_QUALITY
	_status.text = ""
	_dimensions()
	popup_centered()


func _dimensions() -> void:
	if not is_instance_valid(_canvas): return
	var native := _canvas.image_export_size(false)
	var current := _canvas.image_export_size(true)
	_scale.set_item_text(0, "Native size · %d × %d" % [native.x, native.y])
	_scale.set_item_text(1, "Current zoom · %d × %d" % [current.x, current.y])
	var extent := current if _scale.selected == 1 else native
	get_ok_button().disabled = extent.x <= 0 or extent.x * extent.y > Export.MAX_PIXELS
	if extent.x <= 0: _status.text = "Map artwork is unavailable."
	elif extent.x * extent.y > Export.MAX_PIXELS: _status.text = "Choose native size; this zoom exceeds the image size limit."


func _choose_file() -> void:
	_file.popup_centered_ratio(0.65)


func _save(path: String) -> void:
	if _busy or not is_instance_valid(_canvas): return
	if path.get_extension().is_empty(): path += ".jpg"
	_busy = true
	get_ok_button().disabled = true
	get_cancel_button().disabled = true
	_status.text = "Exporting…"
	popup_centered()
	var quality := int(_quality.value)
	var image: Image = await Export.render(self, _canvas, _scale.selected == 1, _overlays.button_pressed)
	var result: Error = ERR_INVALID_DATA
	if image != null:
		_write_thread = Thread.new()
		result = _write_thread.start(Export.save.bind(image, path, quality))
		if result == OK:
			while _write_thread.is_alive(): await get_tree().process_frame
			result = _write_thread.wait_to_finish()
		_write_thread = null
	_busy = false
	get_cancel_button().disabled = false
	_dimensions()
	_status.text = "Saved %s" % path.get_file() if result == OK else "Could not save JPEG: %s" % error_string(result)


func _exit_tree() -> void:
	if _write_thread != null and _write_thread.is_started(): _write_thread.wait_to_finish()
