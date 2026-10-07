extends Window

signal artwork_requested(landlook: int, request_id: int)
signal selected(choice: Dictionary)

var _choices: Array = []
var _current: Variant
var _origin: WeakRef
var _selected: Dictionary = {}
var _request_id := 0


func _ready() -> void:
	%LandlookSearch.text_changed.connect(func(_query): _filter())
	%ShowUnavailable.toggled.connect(func(_value): _filter())
	%LandlookChoices.item_selected.connect(_preview)
	%LandlookChoices.item_activated.connect(func(_index): _accept())
	%UseLandlook.pressed.connect(_accept)
	%CancelLandlook.pressed.connect(cancel)
	close_requested.connect(cancel)


func open_picker(choices: Array, current: Variant, destination: String, origin: Control) -> void:
	_choices = choices.duplicate(true)
	_current = current
	_origin = weakref(origin)
	%LandlookDestination.text = destination + " · Landlook"
	%LandlookSearch.text = ""
	%ShowUnavailable.set_pressed_no_signal(false)
	_filter()
	popup_centered(Vector2i(800, 520))
	%LandlookSearch.grab_focus()


func _filter() -> void:
	%LandlookChoices.clear()
	_selected.clear()
	%LandlookPreview.texture = null
	%LandlookDetails.text = "No Landlooks match this search."
	%UseLandlook.disabled = true
	_request_id += 1
	var query: String = %LandlookSearch.text.strip_edges().to_lower()
	var current_index := -1
	for choice: Dictionary in _choices:
		if not choice.available and choice.id != _current and not %ShowUnavailable.button_pressed: continue
		if not query.is_empty() and not (str(choice.id) + " " + str(choice.name) + " " + str(choice.get("ownership", ""))).to_lower().contains(query): continue
		var index: int = %LandlookChoices.item_count
		%LandlookChoices.add_item("%s · %s%s" % [str(choice.id), choice.name, " · unavailable" if not choice.available else ""])
		%LandlookChoices.set_item_metadata(index, choice)
		if choice.id == _current: current_index = index
	%LandlookCount.text = "%d Landlooks" % %LandlookChoices.item_count
	if %LandlookChoices.item_count > 0:
		var index := current_index if current_index >= 0 else 0
		%LandlookChoices.select(index)
		%LandlookChoices.ensure_current_is_visible()
		_preview(index)


func _preview(index: int) -> void:
	_selected = %LandlookChoices.get_item_metadata(index).duplicate(true)
	_request_id += 1
	%LandlookPreview.texture = null
	%UseLandlook.disabled = true
	%LandlookDetails.text = "%s · %s\n%s" % [_selected.name, str(_selected.get("ownership", "")), "Loading exact artwork…" if _selected.available else str(_selected.get("reason", "Artwork is unavailable."))]
	if _selected.available: artwork_requested.emit(int(_selected.id), _request_id)


func present_artwork(result: Dictionary, request_id: int) -> void:
	if request_id != _request_id or not visible: return
	var image := Image.new()
	var valid: bool = result.get("available", false) and image.load_png_from_buffer(Marshalls.base64_to_raw(str(result.get("base64", "")))) == OK
	%LandlookPreview.texture = ImageTexture.create_from_image(image) if valid else null
	%UseLandlook.disabled = not valid
	%LandlookDetails.text = "%s · %s\n%s" % [_selected.name, _selected.get("ownership", ""),
		"This changes the level's artwork context. Map cells and scripts remain authored as they are." if valid else str(result.get("reason", "The artwork could not be loaded."))]


func _accept() -> void:
	if %UseLandlook.disabled or _selected.is_empty(): return
	selected.emit(_selected.duplicate(true))
	cancel()


func cancel() -> void:
	_request_id += 1
	hide()
	if _origin != null:
		var origin: Control = _origin.get_ref()
		if origin != null and origin.is_visible_in_tree(): origin.grab_focus()


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): cancel(); get_viewport().set_input_as_handled()
	elif event.is_action_pressed("ui_accept") and %LandlookSearch.has_focus(): _accept(); get_viewport().set_input_as_handled()
