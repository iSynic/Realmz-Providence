extends Window

var _origin: Control
var _texture: Texture2D
var _music_context := {}


func _ready() -> void:
	close_requested.connect(cancel)
	$Inset/Body/Footer/Close.pressed.connect(cancel)
	$Inset/Body/Footer/Play.pressed.connect(func(): $Audio.stop() if $Audio.playing else $Audio.play())
	for entry in [["One", 1], ["Two", 2], ["Four", 4]]:
		$Inset/Body/Footer.get_node(entry[0]).pressed.connect(_zoom.bind(entry[1]))


func open_preview(context: Dictionary) -> void:
	_origin = context.get("origin")
	var row: Dictionary = context.get("row", {})
	var preview: Dictionary = context.get("preview", {})
	_music_context = context.duplicate(true)
	%MusicAudition.stop(); %MusicAudition.present_selection()
	title = str(row.get("name", row.get("label", "Media preview")))
	$Inset/Body/Title.text = title
	_texture = preview.get("texture")
	$Inset/Body/ImageScroll.visible = _texture != null
	$Inset/Body/ImageScroll/Center/Image.texture = _texture
	$Inset/Body/Text.visible = preview.has("text")
	$Inset/Body/Text.text = str(preview.get("text", ""))
	$Audio.stream = preview.get("audio")
	$Inset/Body/Footer/Play.visible = $Audio.stream != null
	for name in ["One", "Two", "Four"]: $Inset/Body/Footer.get_node(name).visible = _texture != null
	$Inset/Body/Details.text = "%d × %d pixels · preview only" % [int(preview.get("width", 0)), int(preview.get("height", 0))] if _texture != null else "Full text · read-only" if preview.has("text") else "Sound preview · source unchanged"
	if preview.has("music"): $Inset/Body/Details.text = "Music preview · exact source unchanged"
	if $Audio.stream is AudioStreamWAV:
		var stream: AudioStreamWAV = $Audio.stream
		$Inset/Body/Details.text = "%d Hz · %.2f s · %s · %d-bit PCM · source unchanged" % [stream.mix_rate, stream.get_length(), "Stereo" if stream.stereo else "Mono", 8 if stream.format == AudioStreamWAV.FORMAT_8_BITS else 16]
	_zoom(1)
	popup_centered()
	$Inset/Body/Footer/Close.grab_focus()


func _zoom(scale: int) -> void:
	if _texture == null: return
	$Inset/Body/ImageScroll/Center/Image.custom_minimum_size = _texture.get_size() * scale
	for entry in [["One", 1], ["Two", 2], ["Four", 4]]: $Inset/Body/Footer.get_node(entry[0]).set_pressed_no_signal(entry[1] == scale)


func cancel() -> void:
	$Audio.stop()
	%MusicAudition.stop()
	hide()
	if is_instance_valid(_origin) and _origin.is_visible_in_tree(): _origin.grab_focus()


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): cancel(); set_input_as_handled()


func configure_music(read_source: Callable) -> void:
	%MusicAudition.initialize(read_source, func(): return _music_context)
