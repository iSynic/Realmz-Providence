extends SceneTree

const NativeBridge = preload("res://src/native_bridge.gd")


func _init() -> void:
	var arguments := OS.get_cmdline_user_args()
	if arguments.size() < 2 or arguments.size() > 4:
		_fail("expected <settings-path> <catalog-root> [--validate] [project-path]")
		return
	var settings_path := arguments[0]
	var catalog_root := arguments[1].simplify_path()
	OS.set_environment("PROVIDENCE_REFERENCE_CATALOG_ROOT", "")
	var bridge = NativeBridge.new(settings_path)
	var project_root := catalog_root.path_join("project-setting")
	ProjectSettings.set_setting("providence/reference_catalog_root", project_root)
	var saved: Dictionary
	if arguments.size() >= 3 and arguments[2] == "--validate":
		saved = bridge.configure_reference_catalog_root(catalog_root)
	else:
		saved = preload("res://src/native_library_settings.gd").new(settings_path).save("reference", catalog_root)
	if not bool(saved.get("ok", false)):
		_fail(str(saved.get("error", "could not save local setting")))
		return
	if bridge.configured_reference_catalog_root() != catalog_root:
		_fail("saved catalog root was not discovered")
		return
	if arguments.size() == 4:
		var created: Dictionary = bridge.create_project("reference-catalog-settings-smoke", arguments[3])
		if not bool(created.get("ok", false)):
			_fail(str(created.get("error", "configured project session did not open")))
			return
		if bridge.current_reference_catalog_root() != catalog_root:
			_fail("project session did not attach the saved reference catalog")
			return
		var description: Dictionary = bridge.request("reference-catalog.describe")
		if not bool(description.get("ok", false)):
			_fail(str(description.get("error", "configured catalog was not described")))
			return
		var result := description.get("result", {}) as Dictionary
		if not bool(result.get("configured", false)) or int(result.get("assets", 0)) <= 0:
			_fail("configured project session did not reuse the reference catalog")
			return
		bridge.stop()
	var explicit_root := catalog_root.path_join("explicit")
	if bridge.configured_reference_catalog_root(explicit_root) != explicit_root:
		_fail("explicit catalog root did not take precedence")
		return
	var environment_root := catalog_root.path_join("environment")
	OS.set_environment("PROVIDENCE_REFERENCE_CATALOG_ROOT", environment_root)
	if bridge.configured_reference_catalog_root() != environment_root:
		_fail("environment catalog root did not take precedence")
		return
	OS.set_environment("PROVIDENCE_REFERENCE_CATALOG_ROOT", "")
	var cleared: Dictionary = bridge.clear_reference_catalog_root()
	if not bool(cleared.get("ok", false)):
		_fail(str(cleared.get("error", "could not clear local setting")))
		return
	var settings := ConfigFile.new()
	if settings.load(settings_path) != OK:
		_fail("cleared settings file could not be reopened")
		return
	if settings.has_section_key("reference_libraries", "divinity_reference_catalog"):
		_fail("cleared catalog root remained in local settings")
		return
	if bridge.configured_reference_catalog_root() != project_root:
		_fail("project setting was not discovered after clearing the saved override")
		return
	if arguments.size() == 4:
		ProjectSettings.set_setting("providence/reference_catalog_root", catalog_root)
		var opened: Dictionary = bridge.start_project(arguments[3])
		if not bool(opened.get("ok", false)):
			_fail("project-configured catalog session did not open")
			return
		var listed: Dictionary = bridge.request("reference-catalog.list", {"kind": "vault-icon", "query": "", "offset": 0, "limit": 1})
		if not bool(listed.get("ok", false)) or int(listed.get("result", {}).get("total", 0)) <= 0:
			bridge.stop()
			_fail("project-configured Vault catalog returned no entries")
			return
		print("PROVIDENCE_VAULT_CONFIGURED_ENTRIES %s" % listed["result"]["total"])
		bridge.stop()
	print("PROVIDENCE_REFERENCE_CATALOG_SETTINGS_OK")
	quit(0)


func _fail(message: String) -> void:
	push_error("PROVIDENCE_REFERENCE_CATALOG_SETTINGS_FAILED: %s" % message)
	quit(1)
