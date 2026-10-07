extends Window

signal tile_selected(tile: int)

var _origin: WeakRef
var _tile := -1
var _purpose := "shared erase tile"


func _ready() -> void:
	%EraseAtlas.brush_selected.connect(_stage)
	%UseEraseTile.pressed.connect(func():
		if not %UseEraseTile.disabled: tile_selected.emit(_tile); cancel())
	%CancelEraseTile.pressed.connect(cancel)
	%NoTile.pressed.connect(func(): _tile = 0; %UseEraseTile.disabled = false; %EraseSelection.text = "Tile 0 · empty")
	close_requested.connect(cancel)


func open_picker(projection: Dictionary, current: int, destination: String, origin: Control, purpose := "shared erase tile", allow_zero := false, expected_cells := 200) -> bool:
	if not %EraseAtlas.set_atlas(projection, expected_cells): return false
	_origin = weakref(origin)
	_purpose = purpose; title = "Choose " + purpose
	%NoTile.visible = allow_zero
	%EraseDestination.text = destination + " · " + purpose
	_tile = current
	%UseEraseTile.disabled = not %EraseAtlas.select_tile(current, false) and not (allow_zero and current == 0)
	%EraseSelection.text = "Current tile %d · choose one tile, then Use tile." % current
	popup_centered(Vector2i(740, 470))
	%EraseAtlas.grab_focus()
	return true


func _stage(brush: Dictionary) -> void:
	%UseEraseTile.disabled = int(brush.width) != 1 or int(brush.height) != 1
	if %UseEraseTile.disabled: %EraseSelection.text = "Choose one tile for the shared erase tile."; return
	_tile = int(brush.cells[0])
	%EraseSelection.text = "Tile %d · %s · accepted into the local draft" % [_tile, _purpose]


func cancel() -> void:
	hide()
	if _origin != null:
		var origin: Control = _origin.get_ref()
		if origin != null and origin.is_visible_in_tree(): origin.grab_focus()


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): cancel(); get_viewport().set_input_as_handled()
