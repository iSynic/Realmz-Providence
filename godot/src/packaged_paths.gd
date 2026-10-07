extends RefCounted


static func resource_root() -> String:
	var directory := OS.get_executable_path().get_base_dir()
	return directory.get_base_dir().path_join("Resources") if OS.get_name() == "macOS" else directory


static func music_decoder() -> String:
	var filename := "openmpt123.exe" if OS.get_name() == "Windows" else "openmpt123"
	if OS.has_feature("editor"):
		return ProjectSettings.globalize_path("res://bin/music-preview/" + filename)
	if OS.get_name() == "macOS":
		return OS.get_executable_path().get_base_dir().get_base_dir().path_join("Helpers/openmpt123")
	return resource_root().path_join("music-preview/" + filename)


static func music_manifest(decoder: String) -> String:
	if OS.get_name() == "macOS" and not OS.has_feature("editor") and decoder == music_decoder():
		return resource_root().path_join("music-preview/runtime-manifest.json")
	return decoder.get_base_dir().path_join("runtime-manifest.json")
