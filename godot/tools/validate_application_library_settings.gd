extends SceneTree

const NativeBridge = preload("res://src/native_bridge.gd")


func _init() -> void:
	var arguments := OS.get_cmdline_user_args()
	if arguments.size() < 2 or arguments.size() > 4:
		_fail("expected <settings-path> <library-root> [--validate] [project-path]")
		return
	var settings_path := arguments[0]
	var library_root := arguments[1].simplify_path()
	OS.set_environment("PROVIDENCE_APPLICATION_LIBRARY_ROOT", "")
	var bridge = NativeBridge.new(settings_path)
	var saved: Dictionary
	if arguments.size() == 3 and arguments[2] == "--validate":
		saved = bridge.configure_application_library_root(library_root)
	else:
		saved = preload("res://src/native_library_settings.gd").new(settings_path).save("application", library_root)
	if not bool(saved.get("ok", false)):
		_fail(str(saved.get("error", "could not save local setting")))
		return
	if bridge.configured_application_library_root() != library_root:
		_fail("saved library root was not discovered")
		return
	if arguments.size() == 4:
		var created: Dictionary = bridge.create_project("application-library-settings-smoke", arguments[3])
		if not bool(created.get("ok", false)):
			_fail(str(created.get("error", "configured project session did not open")))
			return
		if bridge.current_application_library_root() != library_root:
			_fail("project session did not attach the saved library root")
			return
		var description: Dictionary = bridge.request("application-media.describe")
		if not bool(description.get("ok", false)):
			_fail(str(description.get("error", "configured library was not described")))
			return
		var result := description.get("result", {}) as Dictionary
		if not bool(result.get("configured", false)) or int(result.get("assets", 0)) <= 0:
			_fail("configured project session did not reuse the application catalog")
			return
		bridge.stop()
	var explicit_root := library_root.path_join("explicit")
	if bridge.configured_application_library_root(explicit_root) != explicit_root:
		_fail("explicit library root did not take precedence")
		return
	var environment_root := library_root.path_join("environment")
	OS.set_environment("PROVIDENCE_APPLICATION_LIBRARY_ROOT", environment_root)
	if bridge.configured_application_library_root() != environment_root:
		_fail("environment library root did not take precedence")
		return
	OS.set_environment("PROVIDENCE_APPLICATION_LIBRARY_ROOT", "")
	var cleared: Dictionary = bridge.clear_application_library_root()
	if not bool(cleared.get("ok", false)):
		_fail(str(cleared.get("error", "could not clear local setting")))
		return
	var settings := ConfigFile.new()
	if settings.load(settings_path) != OK:
		_fail("cleared settings file could not be reopened")
		return
	if settings.has_section_key("reference_libraries", "realmz_classic_application"):
		_fail("cleared library root remained in local settings")
		return
	print("PROVIDENCE_APPLICATION_LIBRARY_SETTINGS_OK")
	quit(0)


func _fail(message: String) -> void:
	push_error("PROVIDENCE_APPLICATION_LIBRARY_SETTINGS_FAILED: %s" % message)
	quit(1)
