extends SceneTree

const Audition = preload("res://src/music_audition.gd")
var _context := {"scope": "scenario", "revision": 0, "epoch": 1, "generation": 1, "row": {"identity": "asset:scenario-music:1", "kind": "music"}}
var _reads := 0
var _delay := false
var _job := ""
var _failure := false


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var host := Control.new(); root.add_child(host)
	var audition := preload("res://src/music_audition.tscn").instantiate(); host.add_child(audition)
	var player: AudioStreamPlayer = audition.get_node("%MusicAudio")
	var button: Button = audition.get_node("%PlayMusic")
	var status: Label = audition.get_node("%PlaybackStatus")
	audition.initialize(_source, func(): return _context); audition.present_selection()
	await audition.toggle()
	var deadline := Time.get_ticks_msec() + 15000
	while not player.playing and not status.text.contains("unchanged") and Time.get_ticks_msec() < deadline: await process_frame
	_expect(player.playing, "The real decoder must produce native playback: " + status.text)
	if player.stream != null:
		_expect(player.stream is AudioStreamWAV and player.stream.get_length() > 0, "A valid native audio stream is required")
		_expect(player.stream.data.count(0) < player.stream.data.size(), "The controlled note must produce non-silent PCM")
	_expect(not DirAccess.dir_exists_absolute(_job), "Completed derived files are removed")
	audition.stop()
	_expect(not player.playing and button.text == "Play Music", "Stop restores the Play command")
	_delay = true
	audition.toggle()
	await process_frame
	audition.stop()
	await create_timer(0.15).timeout
	_expect(not player.playing and not DirAccess.dir_exists_absolute(_job), "Cancel during source preparation removes late output without playback")
	audition.toggle()
	await process_frame
	_context.generation = 2
	await create_timer(0.15).timeout
	_expect(not player.playing and button.text == "Play Music" and not DirAccess.dir_exists_absolute(_job), "A stale destination rejects late playback")
	var decoder := OS.get_environment("PROVIDENCE_MUSIC_DECODER")
	OS.set_environment("PROVIDENCE_MUSIC_DECODER", "missing-music-decoder.exe")
	var before := _reads
	await audition.toggle()
	_expect(_reads == before and status.text.contains("unavailable"), "Missing decoder is an explicit failure without reading the source")
	OS.set_environment("PROVIDENCE_MUSIC_DECODER", decoder)
	await _failed_source_cleanup(audition)
	host.queue_free(); await process_frame
	if not _failure: print("PROVIDENCE_MUSIC_AUDITION_OK real-decoder non-silent-native-stream stop cancel stale cleanup missing-support")
	quit(1 if _failure else 0)


func _source(params: Dictionary) -> Dictionary:
	_reads += 1
	_job = params.jobRoot
	if _delay: await create_timer(0.1).timeout
	DirAccess.make_dir_absolute(_job)
	var path := _job.path_join("source.mod")
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_buffer(preload("res://tools/music_fixture.gd").module_bytes()); file.close()
	return {"ok": true, "result": {"sourcePath": path}}


func _failed_source_cleanup(audition: Control) -> void:
	audition.initialize(func(params):
		await _source(params)
		return {"ok":false,"outcomeUnknown":true,"error":"Controlled lost source-preparation reply"}, func(): return _context)
	await audition.toggle()
	_expect(not DirAccess.dir_exists_absolute(_job), "An unconfirmed preparation left source audio in the cache")


func _expect(condition: bool, message: String) -> void:
	if condition: return
	_failure = true; push_error(message)
