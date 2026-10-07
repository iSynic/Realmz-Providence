extends Window

signal search_requested(query: Dictionary, generation: int)
signal preview_requested(choice: Dictionary, generation: int)
signal accepted(choice: Dictionary, context: Dictionary)
signal open_requested(choice: Dictionary, context: Dictionary)

var context: Dictionary = {}
var selected: Dictionary = {}
var generation := 0
var _rows: Array = []
var _offset := 0
var _total := 0
var _limit := 64
var _origin_focus: Control
var _binding := false
var _retry_query: Dictionary = {}
var _pending_accept: Dictionary = {}


func _ready() -> void:
	for source in ["All sources", "Scenario", "Stock"]: %Ownership.add_item(source)
	%Search.text_changed.connect(func(_text: String): generation += 1; _retry_query.clear(); _clear_preview(); $SearchDelay.start())
	%Search.text_submitted.connect(func(_text: String): _accept())
	$SearchDelay.timeout.connect(_delayed_search)
	%Ownership.item_selected.connect(func(_index: int): _search(0, false))
	%ShowUnavailable.toggled.connect(func(_value: bool): if not _binding: _search(0, true))
	%Choices.item_selected.connect(_preview)
	%Choices.item_activated.connect(_activate)
	%Previous.pressed.connect(func(): _search(maxi(0, _offset - _limit), false))
	%Next.pressed.connect(func(): _search(_offset + _limit, false))
	%Cancel.pressed.connect(cancel)
	close_requested.connect(cancel)
	%UseSelection.pressed.connect(_accept)
	%None.pressed.connect(func():
		if not context.get("allowNone", true): return
		var destination := context.duplicate(true)
		var choice := {"identity": "none", "value": 0, "label": %None.text, "available": true}
		cancel(); accepted.emit(choice, destination))
	%OpenReference.pressed.connect(func(): open_requested.emit(selected.duplicate(true), context.duplicate(true)))
	%PlaySound.pressed.connect(func():
		if %ReferenceAudio.playing: %ReferenceAudio.stop(); %PlaySound.text = "Play sound"
		elif %ReferenceAudio.stream != null: %ReferenceAudio.play(); %PlaySound.text = "Stop sound")
	%ReferenceAudio.finished.connect(func(): %PlaySound.text = "Play sound")


func begin(destination: Dictionary, source_focus: Control = null) -> void:
	cancel(false)
	context = destination.duplicate(true)
	_origin_focus = source_focus
	_binding = true
	%Search.text = ""
	%Ownership.select(0)
	%ShowUnavailable.set_pressed_no_signal(false)
	_binding = false
	title = "Choose " + str(context.get("label", "Monster reference"))
	%Destination.text = str(context.get("destination", ""))
	%None.visible = context.get("allowNone", true)
	%None.text = "All weapons" if context.field == "requiredWeapon" else "None"
	popup_centered(Vector2i(1060, 680))
	%Search.grab_focus()
	_search(0, true)


func _search(offset: int, seek_current: bool) -> void:
	if not visible or context.is_empty(): return
	$SearchDelay.stop()
	generation += 1
	_offset = offset
	_rows.clear()
	%Choices.clear()
	_clear_preview()
	%Count.text = "Loading…"
	%Previous.disabled = true
	%Next.disabled = true
	search_requested.emit({"field": context.field, "currentValue": context.currentValue,
		"search": %Search.text, "ownership": ["all", "scenario", "stock"][%Ownership.selected],
		"showUnavailable": %ShowUnavailable.button_pressed, "offset": offset, "limit": _limit,
		"seekCurrent": seek_current}, generation)


func receive_page(response: Dictionary, request_generation: int) -> void:
	if request_generation != generation or not visible: return
	if not response.get("ok", false):
		%Count.text = str(response.get("error", "The catalog could not be loaded. Cancel to keep your draft."))
		return
	var page: Dictionary = response.get("result", {}).get("page", {})
	_rows = page.get("items", [])
	_offset = int(page.get("offset", 0))
	_total = int(page.get("total", 0))
	%Choices.clear()
	var current_index := -1
	for index in _rows.size():
		var row: Dictionary = _rows[index]
		%Choices.add_item("%d · %s · %s · %s" % [row.get("authorId", row.value), row.label, row.ownership, "Available" if row.available else "Unavailable"])
		%Choices.set_item_tooltip(index, str(row.get("reason", "")))
		if row.value == context.currentValue: current_index = index
	%Count.text = "%d matches · Current %d · Search covers the complete catalog" % [_total, context.currentValue]
	%Previous.disabled = _offset == 0
	%Next.disabled = _offset + _rows.size() >= _total
	if _rows.is_empty(): %Details.text = "No results. Change the search or source filter."
	elif current_index >= 0:
		%Choices.select(current_index)
		%Choices.ensure_current_is_visible.call_deferred()
		_preview(current_index)


func _preview(index: int) -> void:
	if context.is_empty() or not visible: return
	_clear_preview()
	if index < 0 or index >= _rows.size(): return
	selected = _rows[index].duplicate(true)
	%Name.text = "%d · %s" % [selected.get("authorId", selected.value), selected.label]
	%Availability.text = "Available in this exact field" if selected.available else str(selected.reason)
	%Details.text = str(selected.get("detail", ""))
	%UseSelection.disabled = not selected.available
	if (context.field == "iconId" or context.get("picturePreview",false)) and int(selected.value) != 0: %UseSelection.disabled = true
	if context.get("requirePreview", false) and not selected.get("resources", []).is_empty(): %UseSelection.disabled = true
	%OpenReference.disabled = selected.get("targetIdentity") == null or (int(selected.value) == 0 and context.get("allowNone", true)) or selected.get("identity") == "none" or not selected.available or open_requested.get_connections().is_empty()
	%SoundPreview.visible = context.get("soundPreview",false) and int(selected.value) != 0
	preview_requested.emit(selected.duplicate(true), generation)


func receive_appearance(response: Dictionary, request_generation: int, value: int) -> void:
	if not visible or request_generation != generation or int(selected.get("value", -32769)) != value: return
	%Pictures.show()
	if not response.get("ok", false):
		%Availability.text = str(response.get("error", "Appearance preview unavailable."))
		%UseSelection.disabled = true
		return
	var result: Dictionary = response.get("result", {})
	for pair in [[%Base, "base"], [%Facing, "facing"]]:
		var resource: Variant = result.get(pair[1])
		pair[0].texture = preload("res://src/projected_image.gd").decode(resource) if resource is Dictionary else null
	if not result.get("payloadComplete", false) or %Base.texture == null or %Facing.texture == null:
		%Availability.text = "The exact appearance pair could not be previewed. Resolve the missing or malformed resource."
		%UseSelection.disabled = true
	else: %UseSelection.disabled = not selected.available
	_accept_after_preview()


func _clear_preview() -> void:
	%ReferenceAudio.stop(); %ReferenceAudio.stream = null
	%SoundPreview.hide(); %SoundWaveform.texture = null; %PlaySound.disabled = true; %PlaySound.text = "Play sound"
	_pending_accept.clear()
	selected.clear()
	%Name.text = ""
	%Availability.text = ""
	%Details.text = ""
	%Base.texture = null
	%Facing.texture = null
	%Pictures.hide()
	%Facing.show()
	%UseSelection.disabled = true
	%OpenReference.disabled = true


func _accept() -> void:
	if selected.is_empty() or %UseSelection.disabled: return
	accepted.emit(selected.duplicate(true), context.duplicate(true))
	cancel()


func _activate(index: int) -> void:
	if index < 0 or index >= _rows.size(): return
	if selected.get("identity") == _rows[index].get("identity") and not %UseSelection.disabled:
		_accept(); return
	_preview(index)
	if (context.get("field") == "iconId" or context.get("picturePreview",false) or context.get("requirePreview",false)) and selected.get("available", false):
		# A double-click may precede the exact artwork payload check.
		_pending_accept = {"generation": generation, "identity": selected.identity}
		_accept_after_preview()
	else: _accept()


func _accept_after_preview() -> void:
	if _pending_accept.get("generation") == generation and _pending_accept.get("identity") == selected.get("identity") and not %UseSelection.disabled:
		_accept()


func cancel(restore_focus := true, defer_focus := true) -> void:
	%RecoverReference.hide()
	%ReferenceAudio.stop()
	generation += 1
	context.clear()
	_retry_query.clear()
	_pending_accept.clear()
	$SearchDelay.stop()
	hide()
	var focus := _origin_focus
	var closed_generation := generation
	if restore_focus and is_instance_valid(focus):
		if defer_focus:
			(func():
				if not visible and generation == closed_generation and is_instance_valid(focus): focus.grab_focus()).call_deferred()
		elif focus.is_visible_in_tree(): focus.grab_focus()
	_origin_focus = null


func retry_search(query: Dictionary, request_generation: int) -> void:
	if not visible or request_generation != generation: return
	_retry_query = query.duplicate(true)
	$SearchDelay.start()


func _delayed_search() -> void:
	var retry := _retry_query.duplicate(true)
	_retry_query.clear()
	_search(int(retry.get("offset", 0)), bool(retry.get("seekCurrent", false)))


func _input(event: InputEvent) -> void:
	if not visible: return
	if event.is_action_pressed("ui_cancel"):
		cancel(); set_input_as_handled()
	elif event.is_action_pressed("ui_accept") and not %Search.has_focus():
		_accept(); set_input_as_handled()


func receive_picture(response: Dictionary, request_generation: int, value: int) -> void:
	if not visible or request_generation != generation or int(selected.get("value", -32769)) != value: return
	%Pictures.show()
	%Facing.hide()
	%Base.texture = preload("res://src/item_artwork_lookup.gd").decode_texture(response)
	if %Base.texture == null:
		%Availability.text = str(response.get("error", "The exact artwork cannot be previewed. Resolve the missing or malformed resource."))
		%UseSelection.disabled = true
	else: %UseSelection.disabled = not selected.available
	_accept_after_preview()


func receive_thumbnails(thumbnails: Dictionary, request_generation: int) -> void:
	if not visible or request_generation!=generation: return
	for index in _rows.size():
		var response: Dictionary=thumbnails.get(int(_rows[index].value),{})
		if response.get("ok",false): %Choices.set_item_icon(index,preload("res://src/item_artwork_lookup.gd").decode_texture(response))


func receive_sound(response: Dictionary, request_generation: int, value: int) -> void:
	if not visible or request_generation != generation or int(selected.get("value",-32769)) != value: return
	var decoded: Dictionary = preload("res://src/asset_preview_decoder.gd").decode(response,{})
	var stream: AudioStreamWAV = decoded.get("audio")
	%ReferenceAudio.stream = stream; %PlaySound.disabled = stream == null
	%SoundWaveform.texture = preload("res://src/media_audio_presentation.gd").waveform(stream,%Name.get_theme_color("font_color","Label"))
	if stream == null: %Availability.text += "\n" + str(decoded.get("error","Sound preview unavailable."))
