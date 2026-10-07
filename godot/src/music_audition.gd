extends PanelContainer

const EXE_HASH := "9d809056e40e3d004b1ab9275081ee8ddb9d1874999369189d0ba172e7c3131c"
const MAX_WAV_BYTES := 115201024
var _player: AudioStreamPlayer
var _button: Button
var _status: Label
var _read: Callable
var _context: Callable
var _generation := 0
var _pid := -1
var _loading := false
var _deadline := 0
var _job := ""
var _stop_button: Button
var _progress: ProgressBar


func _ready() -> void:
	_player = %MusicAudio; _button = %PlayMusic; _status = %PlaybackStatus
	_stop_button = %StopMusic; _progress = %PlaybackProgress
	_button.pressed.connect(toggle)
	_stop_button.pressed.connect(stop)
	_player.finished.connect(stop)
	tree_exiting.connect(stop)


func initialize(read: Callable, context: Callable) -> void:
	_read = read; _context = context


func toggle() -> void:
	if _loading or _player.playing: stop(); return
	var context: Dictionary = _context.call().duplicate(true)
	if context.is_empty(): return
	if context.row.get("kind") != "music" or context.row.get("emptySlot", false): return
	var executable := decoder_path()
	if not decoder_valid(executable): _failure("The pinned Music decoder is unavailable. Restore the editor's music-preview support files."); return
	_generation += 1
	var generation := _generation
	_loading = true
	_button.text = "Loading…"; _button.disabled = true
	_stop_button.text = "Cancel loading"; _stop_button.disabled = false
	_status.text = "Preparing music playback…"
	var parent := ProjectSettings.globalize_path("user://music-audition")
	if DirAccess.make_dir_recursive_absolute(parent) != OK: _failure("Could not create the music playback cache."); return
	var job := parent.path_join(Crypto.new().generate_random_bytes(16).hex_encode())
	var params := {"scope": context.scope, "identity": context.row.identity, "jobRoot": job}
	params["expectedLibraryRevision" if context.scope == "personal" else "expectedRevision"] = context.revision
	var response: Dictionary = await _read.call(params)
	if generation != _generation: _cleanup(job); return
	if not _matches(context): _cleanup(job); stop(); return
	if not response.get("ok", false): _cleanup(job); _failure(str(response.get("error", "Could not prepare music playback."))); return
	_job = job
	var args := PackedStringArray(["--batch", "--quiet", "--samplerate", "48000", "--channels", "2", "--no-float", "--repeat", "0", "--end-time", "600", "--output", job.path_join(render_filename()), "--", str(response.result.sourcePath)])
	_pid = OS.create_process(executable, args, false)
	_deadline = Time.get_ticks_msec() + 60000
	if _pid <= 0: _failure("Could not start music playback. Your source is unchanged.")


func present_selection() -> void:
	var context: Dictionary = _context.call() if _context.is_valid() else {}
	visible = context.get("row", {}).get("kind") == "music" and not context.get("row", {}).get("emptySlot", false)
	%ModuleDetails.text = "Standard 31-sample MOD\n%d KB · Exact source retained" % ceili(float(context.get("row", {}).get("byteLength", 0)) / 1024.0)
	_button.text = "Loading…" if _loading else "Playing…" if _player.playing else "Play Music"
	_button.disabled = _loading or _player.playing
	_stop_button.text = "Cancel loading" if _loading else "Stop Music"
	_stop_button.disabled = not _loading and not _player.playing


func _process(_delta: float) -> void:
	if _pid > 0:
		if Time.get_ticks_msec() > _deadline: _failure("Music playback preparation timed out. Press Play to try again."); return
		if not OS.is_process_running(_pid): _finish_render()
	elif _player != null and _player.playing and _context.call().get("row", {}).get("kind") == "music":
		_status.text = "Playing · %s / %s" % [_time(_player.get_playback_position()), _time(_player.stream.get_length())]
		_progress.max_value = _player.stream.get_length(); _progress.value = _player.get_playback_position()


func _finish_render() -> void:
	var exit_code := OS.get_process_exit_code(_pid)
	_pid = -1
	if exit_code != 0: _failure("Music could not be decoded. The original module is unchanged."); return
	var path := _job.path_join(render_filename())
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() > MAX_WAV_BYTES: _failure("The Music preview is unavailable or exceeds its playback limit."); return
	file.close()
	var stream := rendered_stream(path)
	if stream == null: _failure("The decoder did not produce playable audio."); return
	_loading = false
	_player.stream = stream
	_player.play()
	_button.text = "Playing…"; _button.disabled = true
	_stop_button.text = "Stop Music"; _stop_button.disabled = false
	_status.tooltip_text = "Playback is bounded to the first ten minutes. Stored and exported MOD bytes remain exact."
	_cleanup(_job); _job = ""


func stop() -> void:
	_generation += 1
	if _pid > 0 and OS.is_process_running(_pid): OS.kill(_pid)
	_pid = -1; _loading = false
	if _player != null: _player.stop()
	if is_instance_valid(_button): _button.text = "Play Music"; _button.disabled = false
	if is_instance_valid(_stop_button): _stop_button.text = "Stop Music"; _stop_button.disabled = true
	if is_instance_valid(_status): _status.text = "Ready"
	if is_instance_valid(_progress): _progress.value = 0
	_cleanup(_job); _job = ""


func _failure(message: String) -> void:
	stop()
	_status.text = message


func _matches(original: Dictionary) -> bool:
	var current: Dictionary = _context.call()
	return not current.is_empty() and current.scope == original.scope and current.revision == original.revision and current.row.identity == original.row.identity and current.get("epoch") == original.get("epoch") and current.get("generation") == original.get("generation")


static func decoder_path() -> String:
	var override := OS.get_environment("PROVIDENCE_MUSIC_DECODER")
	if not override.is_empty(): return override
	var filename := "openmpt123.exe" if OS.get_name() == "Windows" else "openmpt123"
	return ProjectSettings.globalize_path("res://bin/music-preview/" + filename) if OS.has_feature("editor") else OS.get_executable_path().get_base_dir().path_join("music-preview/" + filename)


static func decoder_valid(path: String) -> bool:
	if OS.get_name() == "Windows":
		return FileAccess.get_sha256(path) == EXE_HASH and FileAccess.file_exists(path.get_base_dir().path_join("openmpt-mpg123.dll"))
	var manifest_path := path.get_base_dir().path_join("runtime-manifest.json")
	if not FileAccess.file_exists(manifest_path): return false
	var manifest = JSON.parse_string(FileAccess.get_file_as_string(manifest_path))
	if not manifest is Dictionary or manifest.get("version") != "0.8.9": return false
	var expected: String = manifest.get("files", {}).get(path.get_file(), "")
	return expected.length() == 64 and FileAccess.get_sha256(path) == expected


static func render_filename() -> String:
	return "preview.wav" if OS.get_name() == "Windows" else "preview.raw"


static func rendered_stream(path: String) -> AudioStreamWAV:
	if path.get_extension() == "wav": return AudioStreamWAV.load_from_file(path)
	# openmpt123 raw output is signed little-endian PCM on our supported Unix targets.
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty() or bytes.size() % 4 != 0 or bytes.size() > MAX_WAV_BYTES: return null
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.stereo = true
	stream.mix_rate = 48000
	stream.data = bytes
	return stream


static func _time(seconds: float) -> String:
	return "%d:%02d" % [int(seconds) / 60, int(seconds) % 60]


static func _cleanup(job: String) -> void:
	var parent := ProjectSettings.globalize_path("user://music-audition").simplify_path()
	if job.is_empty() or job.get_base_dir().simplify_path() != parent: return
	for name in ["source.mod", "preview.wav", "preview.raw"]:
		var path := job.path_join(name)
		if FileAccess.file_exists(path): DirAccess.remove_absolute(path)
	DirAccess.remove_absolute(job)
