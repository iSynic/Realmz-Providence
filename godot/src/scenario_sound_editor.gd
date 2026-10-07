class_name ProvidenceScenarioSoundEditor
extends VBoxContainer

signal sound_import_requested(payload: Dictionary)
signal sound_open_requested(identity: String)
signal sound_update_requested(identity: String, label: String, resource_id: int)
signal sound_remove_requested(identity: String)
signal compile_requested
signal selection_changed(sound: Dictionary)
signal picture_route_requested
signal icon_route_requested
signal library_scope_requested(scope: String)

const MIN_SOUND_ID := 200
const MAX_SOUND_ID := 500

var _sounds: Array = []
var _revision := 0
var _selected_identity := ""
var _selected_sound: Dictionary = {}
var _surface: Control
var _search: LineEdit
var _list: ItemList
var _count: Label
var _name_field: LineEdit
var _resource_id: SpinBox
var _format: Label
var _duration: Label
var _source: Label
var _payload: Label
var _scope: Label
var _status: Label
var _waveform: TextureRect
var _empty_waveform: Label
var _play: Button
var _apply: Button
var _remove: Button
var _compile: Button
var _player: AudioStreamPlayer
var _file_dialog: FileDialog
var _import_dialog: ConfirmationDialog
var _import_name: LineEdit
var _import_id: SpinBox
var _pending_path := ""
var commit_handler: Callable
var import_handler: Callable


func selected_identity() -> String:
	return _selected_identity


func present_selection() -> void:
	selection_changed.emit(_selected_sound.duplicate(true))


func draft_metadata() -> Dictionary:
	return {"identity": _selected_identity, "label": _name_field.text, "resourceId": int(_resource_id.value)}


func accept_saved_metadata(metadata: Dictionary) -> void:
	if str(metadata.get("identity", "")) != _selected_identity: return
	# Keep later typing while making Discard return to the acknowledged metadata.
	for key in ["label", "resourceId"]:
		if metadata.has(key): _selected_sound[key] = metadata[key]


func read_state() -> Dictionary:
	return {"draft": draft_metadata(), "query": _search.text}


func read_navigation_state() -> Dictionary:
	var state := read_state()
	state["identity"] = _selected_identity
	state["listScroll"] = _list.get_v_scroll_bar().value
	return state


func restore_navigation_state(state: Dictionary) -> void:
	_search.set_block_signals(true)
	_search.text = str(state.get("query", ""))
	_search.set_block_signals(false)
	_render_list(str(state.get("identity", _selected_identity)))
	_list.get_v_scroll_bar().value = float(state.get("listScroll", 0.0))


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
	_list.deselect_all()
	for index in _list.item_count:
		if str(_list.get_item_metadata(index).get("identity", "")) == _selected_identity:
			_list.select(index)
			return


func _ready() -> void:
	name = "Scenario Sounds"
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 10)
	_bind_surface()
	_build_import_dialogs()
	_player = AudioStreamPlayer.new()
	_player.name = "ScenarioSoundPlayer"
	_player.finished.connect(_on_playback_finished)
	add_child(_player)
	_clear_selection()


func set_sounds(result: Dictionary, revision: int, preferred_identity: String = "") -> void:
	var previous := preferred_identity if not preferred_identity.is_empty() else _selected_identity
	_sounds = (result.get("items", []) as Array).duplicate(true)
	_revision = revision
	_count.text = "%d SOUND RESOURCE%s" % [_sounds.size(), "" if _sounds.size() == 1 else "S"]
	_render_list(previous)


func set_document(result: Dictionary) -> void:
	_revision = int(result.get("revision", _revision))
	_selected_sound = (result.get("sound", {}) as Dictionary).duplicate(true)
	_selected_identity = str(_selected_sound.get("identity", ""))
	_name_field.text = str(_selected_sound.get("label", ""))
	var imported_id := int(_selected_sound.get("resourceId", MIN_SOUND_ID))
	_resource_id.min_value = minf(_resource_id.min_value, imported_id)
	_resource_id.max_value = maxf(_resource_id.max_value, imported_id)
	_resource_id.value = imported_id
	_format.text = "%s Hz  ·  %d source channel%s  →  Classic mono 8-bit" % [
		_format_number(int(_selected_sound.get("sampleRate", 0))),
		int(_selected_sound.get("channels", 0)),
		"" if int(_selected_sound.get("channels", 0)) == 1 else "s",
	]
	_duration.text = _format_duration(int(_selected_sound.get("durationMs", 0)))
	_source.text = "Source blob  %s" % _short_hash(str(result.get("sourceBlob", "")))
	_payload.text = "%s bytes  ·  %s" % [
		_format_number(int(result.get("classicPayloadBytes", 0))),
		_short_hash(str(result.get("classicPayloadBlob", ""))),
	]
	_scope.text = "Scenario.rsrc  ·  snd %d" % int(_selected_sound.get("resourceId", 0))
	_status.text = "Ready for Classic compile"
	_status.add_theme_color_override("font_color", Color("77d6a1"))
	_apply.disabled = false
	_remove.disabled = false
	selection_changed.emit(_selected_sound.duplicate(true))


func set_preview_pcm8_base64(base64: String, sample_rate: int) -> void:
	var decoded := preload("res://src/asset_preview_decoder.gd").decode(
		{"ok": true, "result": {"pcm8Base64": base64, "sampleRate": sample_rate}}, {})
	set_preview_stream(decoded.get("audio"))


func set_preview_stream(stream: AudioStreamWAV) -> void:
	if stream == null or stream.data.is_empty():
		_clear_preview("Preview unavailable")
		return
	_player.stream = stream
	_waveform.texture = _waveform_texture(stream)
	_empty_waveform.visible = false
	_play.disabled = false


func set_compile_available(available: bool, reason: String = "") -> void:
	_compile.disabled = not available
	_compile.tooltip_text = reason if not available else "Validate and compile Scenario.rsrc deterministically."


func play_preview() -> bool:
	if _play.disabled or _player.stream == null: return false
	if not _player.playing: _toggle_playback()
	return true


func stop_preview() -> void:
	if _player.playing: _player.stop()
	_play.text = "▶  Play"


func has_unapplied_changes() -> bool:
	if _selected_sound.is_empty():
		return false
	return _name_field.text != str(_selected_sound.get("label", "")) or int(_resource_id.value) != int(_selected_sound.get("resourceId", 0))


func discard_draft() -> void:
	if not _selected_sound.is_empty():
		_name_field.text = str(_selected_sound.get("label", ""))
		_resource_id.value = int(_selected_sound.get("resourceId", MIN_SOUND_ID))


func commit_selected() -> void:
	if _selected_identity.is_empty() or not has_unapplied_changes():
		return
	if commit_handler.is_valid():
		var payload := draft_metadata()
		payload.label = str(payload.label).strip_edges()
		await commit_handler.call(payload)
	else:
		sound_update_requested.emit(_selected_identity, _name_field.text.strip_edges(), int(_resource_id.value))


func import_for_smoke(path: String, label: String, resource_id: int) -> void:
	var payload := {"path": path, "label": label, "resourceId": resource_id}
	if import_handler.is_valid(): await import_handler.call(payload)
	else: sound_import_requested.emit(payload)


func _content_scene() -> PackedScene:
	return preload("res://src/scenario_sound_content.tscn")


func _bind_surface() -> void:
	_surface = _content_scene().instantiate()
	add_child(_surface)
	_search = _surface.get_node("%SoundSearch")
	_list = _surface.get_node("%ScenarioSoundList")
	_count = _surface.get_node("%ResourceCount")
	_name_field = _surface.get_node("%SoundLabel")
	_resource_id = _surface.get_node("%SoundResourceId")
	_format = _surface.get_node("%AudioFormat")
	_duration = _surface.get_node("%Duration")
	_source = _surface.get_node("%Source")
	_payload = _surface.get_node("%Payload")
	_scope = _surface.get_node("%Scope")
	_status = _surface.get_node("%Status")
	_waveform = _surface.get_node("%SoundWaveform")
	_empty_waveform = _surface.get_node("%EmptyPreview")
	_play = _surface.get_node("%PlayScenarioSound")
	_apply = _surface.get_node("%ApplySoundMetadata")
	_remove = _surface.get_node("%RemoveSound")
	_compile = _surface.get_node("%CompileScenarioSounds")
	_search.text_changed.connect(func(_value: String): _render_list(_selected_identity))
	_list.item_selected.connect(_select_list_item)
	_list.item_activated.connect(_activate_list_item)
	_apply.pressed.connect(commit_selected)
	_remove.pressed.connect(_confirm_remove)
	_compile.pressed.connect(func(): compile_requested.emit())
	_surface.get_node("%ImportSound").pressed.connect(_show_import_file_dialog)
	_play.pressed.connect(_toggle_playback)
	_connect_route_actions()


func _connect_route_actions() -> void:
	_surface.get_node("%ScenarioAssets").pressed.connect(func(): library_scope_requested.emit("scenario"))
	_surface.get_node("%CustomLibrary").pressed.connect(func(): library_scope_requested.emit("personal"))
	_surface.get_node("%ReferenceAssets").pressed.connect(func(): library_scope_requested.emit("stock"))
	_surface.get_node("%PicturesRoute").pressed.connect(func(): picture_route_requested.emit())
	_surface.get_node("%IconsRoute").pressed.connect(func(): icon_route_requested.emit())


func _build_import_dialogs() -> void:
	_file_dialog = FileDialog.new()
	_file_dialog.name = "ScenarioSoundFileDialog"
	_file_dialog.title = "Import Scenario Sound"
	_file_dialog.file_mode = FileDialog.FILE_MODE_OPEN_FILE
	_file_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_file_dialog.use_native_dialog = true
	_file_dialog.add_filter("*.wav", "Wave audio")
	_file_dialog.file_selected.connect(_prepare_import)
	add_child(_file_dialog)
	_import_dialog = ConfirmationDialog.new()
	_import_dialog.name = "ScenarioSoundImportDialog"
	_import_dialog.title = "Import Scenario Sound"
	_import_dialog.ok_button_text = "Import Sound"
	_import_dialog.confirmed.connect(_confirm_import)
	var fields := preload("res://src/scenario_sound_import_content.tscn").instantiate()
	_import_name = fields.get_node("%ImportLabel")
	_import_id = fields.get_node("%ImportResourceId")
	_import_dialog.add_child(fields)
	add_child(_import_dialog)


func _render_list(preferred_identity: String) -> void:
	if has_unapplied_changes(): return
	var query := _search.text.strip_edges().to_lower()
	_list.clear()
	var selection := -1
	for value in _sounds:
		var sound := value as Dictionary
		var haystack := "%s %s" % [str(sound.get("label", "")), str(sound.get("resourceId", ""))]
		if not query.is_empty() and not haystack.to_lower().contains(query):
			continue
		var text := "snd %03d    %-52s    %8s    %s Hz  ·  %d ch" % [
			int(sound.get("resourceId", 0)),
			str(sound.get("label", "Untitled sound")),
			_format_duration(int(sound.get("durationMs", 0))),
			_format_number(int(sound.get("sampleRate", 0))),
			int(sound.get("channels", 0)),
		]
		var index := _list.add_item(text)
		_list.set_item_metadata(index, sound.duplicate(true))
		_list.set_item_tooltip(index, "%s\nClassic output: mono 8-bit format-1 snd" % str(sound.get("label", "")))
		if str(sound.get("identity", "")) == preferred_identity:
			selection = index
	if _list.item_count == 0:
		_clear_selection()
		return
	if selection < 0:
		selection = 0
	_list.select(selection)
	_select_list_item(selection)


func _select_list_item(index: int) -> void:
	if index < 0 or index >= _list.item_count:
		return
	var sound := _list.get_item_metadata(index) as Dictionary
	sound_open_requested.emit(str(sound.get("identity", "")))


func _activate_list_item(index: int) -> void:
	_select_list_item(index)
	_name_field.grab_focus()


func _show_import_file_dialog() -> void:
	_file_dialog.popup_centered_ratio(0.72)


func request_import() -> void:
	_show_import_file_dialog()


func _prepare_import(path: String) -> void:
	_pending_path = path
	_import_name.text = path.get_file().get_basename().replace("_", " ").replace("-", " ").capitalize()
	_import_id.value = _next_sound_id()
	_import_dialog.dialog_text = path.get_file()
	_import_dialog.popup_centered(Vector2i(640, 330))


func _confirm_import() -> void:
	if _pending_path.is_empty():
		return
	await import_for_smoke(_pending_path, _import_name.text.strip_edges(), int(_import_id.value))


func _confirm_remove() -> void:
	if _selected_identity.is_empty():
		return
	var confirmation := ConfirmationDialog.new()
	confirmation.title = "Remove Scenario Sound?"
	confirmation.dialog_text = "Remove %s from authored project truth? Existing references will become diagnostics." % str(_selected_sound.get("label", _selected_identity))
	confirmation.ok_button_text = "Remove Sound"
	confirmation.confirmed.connect(func() -> void:
		sound_remove_requested.emit(_selected_identity)
		confirmation.queue_free()
	)
	confirmation.canceled.connect(confirmation.queue_free)
	add_child(confirmation)
	confirmation.popup_centered(Vector2i(560, 240))


func _toggle_playback() -> void:
	if _player.playing:
		_player.stop()
		_play.text = "▶  Play"
	else:
		_player.play()
		_play.text = "■  Stop"


func _on_playback_finished() -> void:
	_play.text = "▶  Play"


func _clear_selection() -> void:
	_selected_identity = ""
	_selected_sound = {}
	_name_field.text = ""
	_resource_id.value = MIN_SOUND_ID
	_format.text = "—"
	_duration.text = "—"
	_payload.text = "—"
	_source.text = "—"
	_scope.text = "Scenario.rsrc"
	_status.text = "No sound selected"
	_status.add_theme_color_override("font_color", Color("9eb1c2"))
	_clear_preview("No sound selected")
	_apply.disabled = true
	_remove.disabled = true
	present_selection()


func _clear_preview(message: String) -> void:
	_player.stop()
	_player.stream = null
	_waveform.texture = null
	_empty_waveform.text = message
	_empty_waveform.visible = true
	_play.disabled = true
	_play.text = "▶  Play"


func _next_sound_id() -> int:
	var used := {}
	for value in _sounds:
		used[int((value as Dictionary).get("resourceId", 0))] = true
	for resource_id in range(MIN_SOUND_ID, MAX_SOUND_ID + 1):
		if not used.has(resource_id):
			return resource_id
	return MAX_SOUND_ID


func _waveform_texture(stream: AudioStreamWAV) -> Texture2D:
	var samples := stream.data
	var sample_bytes := 1 if stream.format == AudioStreamWAV.FORMAT_8_BITS else 2
	var frames := samples.size() / sample_bytes
	var width := 760
	var height := 128
	var image := Image.create(width, height, false, Image.FORMAT_RGBA8)
	image.fill(Color("101923"))
	var center := height / 2
	for x in range(width):
		var begin := int(float(x) * frames / width)
		var finish := maxi(begin + 1, int(float(x + 1) * frames / width))
		var peak := 0
		for index in range(begin, mini(finish, frames)):
			var value := samples[index] if sample_bytes == 1 else samples.decode_s16(index * 2)
			if sample_bytes == 1 and value > 127: value -= 256
			peak = maxi(peak, abs(value) if sample_bytes == 1 else abs(value) / 256)
		var extent := maxi(1, int(float(peak) / 128.0 * (center - 7)))
		for y in range(center - extent, center + extent + 1):
			image.set_pixel(x, y, Color("79bde8") if x % 4 else Color("d6b875"))
	return ImageTexture.create_from_image(image)


func _short_hash(value: String) -> String:
	return value.left(12) if value.length() > 12 else value


func _format_duration(milliseconds: int) -> String:
	var seconds := float(milliseconds) / 1000.0
	return "%0.2f s" % seconds if seconds < 60.0 else "%d:%04.1f" % [int(seconds / 60.0), fmod(seconds, 60.0)]


func _format_number(value: int) -> String:
	var source := str(value)
	var result := ""
	while source.length() > 3:
		result = ",%s%s" % [source.right(3), result]
		source = source.left(source.length() - 3)
	return source + result
