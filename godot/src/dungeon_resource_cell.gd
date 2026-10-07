extends Window

signal preview_requested(tile: int, changes: Array, generation: int)
signal cell_accepted(tile: int, render_cell: Dictionary)
signal closed

var _original_tile := 0
var _tile := 0
var _generation := 0
var _ready_preview := false
var _desired: Dictionary = {}
var _render_cell: Dictionary = {}


func _ready() -> void:
	close_requested.connect(close)
	%CancelFeatures.pressed.connect(close)
	%FeatureDock.feature_changed.connect(_change)
	%FeatureDock.apply_requested.connect(_accept)
	%FeatureDock.discard_requested.connect(close)
	%FeatureDock.clear_requested.connect(_clear)


func open(tile: int, destination: String, projection: Dictionary) -> void:
	_original_tile = tile; _tile = tile; _desired.clear(); _render_cell.clear()
	%FeatureDestination.text = destination
	%FeatureDock.set_atlas(projection)
	popup_centered(); _preview()


func _change(primitive: String, enabled: bool) -> void:
	_desired[primitive] = enabled; _preview()


func _clear() -> void:
	for primitive: String in _desired: _desired[primitive] = primitive == "wall"
	_preview()


func _preview() -> void:
	_generation += 1; _ready_preview = false
	%FeatureDock.present(_desired, true, true, false, 1)
	var changes: Array = []
	for primitive: String in _desired: changes.append({"primitive":primitive,"enabled":bool(_desired[primitive])})
	preview_requested.emit(_original_tile, changes, _generation)


func present(result: Dictionary, generation: int) -> void:
	if generation != _generation or not visible: return
	_tile = int(result.preview.tile); _render_cell = result.renderCell.duplicate(true)
	_desired.clear()
	for feature: Dictionary in result.preview.features: _desired[str(feature.primitive)] = bool(feature.enabled)
	_ready_preview = true; %FeatureDock.present(_desired, true, false, false, 1)
	%FeatureDock.get_node("%ApplyDungeonPrimitive").text = "Use features"
	%FeatureDock.set_status("These controls edit this saved stamp cell. Apply to the map happens in destination review.")


func show_error(message: String, generation: int) -> void:
	if generation == _generation and visible: %FeatureDock.set_status(message)


func _accept() -> void:
	if not _ready_preview: return
	cell_accepted.emit(_tile, _render_cell.duplicate(true)); close()


func close() -> void:
	_generation += 1; hide(); closed.emit()


func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE: close(); get_viewport().set_input_as_handled()
		elif event.keycode == KEY_ENTER and (event.ctrl_pressed or event.meta_pressed): _accept(); get_viewport().set_input_as_handled()
