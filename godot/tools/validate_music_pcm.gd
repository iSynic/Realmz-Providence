extends SceneTree


func _initialize() -> void:
	var preview = preload("res://src/music_audition.gd")
	var path := "user://music-pcm-fixture.raw"
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_buffer(PackedByteArray([0, 0, 255, 127, 0, 128, 0, 0]))
	file.close()
	var stream: AudioStreamWAV = preview.rendered_stream(path)
	assert(stream != null and stream.stereo and stream.mix_rate == 48000)
	assert(stream.data.size() == 8 and stream.format == AudioStreamWAV.FORMAT_16_BITS)
	file = FileAccess.open(path, FileAccess.WRITE)
	file.store_buffer(PackedByteArray([0, 0, 0]))
	file.close()
	assert(preview.rendered_stream(path) == null)
	assert(DirAccess.remove_absolute(ProjectSettings.globalize_path(path)) == OK)
	print("MUSIC_PCM_OK stereo signed-16 48000Hz; partial-frame rejection")
	quit()
