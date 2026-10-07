extends RefCounted

const SECTION := "reference_libraries"
const KEYS := {"application": "realmz_classic_application", "reference": "divinity_reference_catalog"}

var settings_path: String


static func monster_root(explicit_root := "") -> String:
	for candidate in [explicit_root, OS.get_environment("PROVIDENCE_MONSTER_LIBRARY_ROOT"), ProjectSettings.get_setting("providence/monster_library_root", "")]:
		var path := str(candidate).strip_edges()
		if not path.is_empty(): return ProjectSettings.globalize_path(path).simplify_path()
	return ""


static func append_monster(arguments: PackedStringArray, path: String, explicit_root: String) -> String:
	var directory := monster_root(explicit_root)
	var option := "--monster-library-root"
	if directory.is_empty():
		directory = ProjectSettings.globalize_path(path.get_base_dir().path_join("monster-library")).simplify_path()
		option = "--personal-monster-library-root"
	arguments.append(option)
	arguments.append(directory)
	if option == "--personal-monster-library-root":
		var manifest := preload("res://src/packaged_paths.gd").resource_root().path_join("monster-library/manifest.json")
		if not FileAccess.file_exists(manifest): manifest = ProjectSettings.globalize_path("res://bundled/monster-library/manifest.json")
		if FileAccess.file_exists(manifest):
			arguments.append("--monster-scrapbook-manifest")
			arguments.append(manifest)
	return directory


static func append_stock_items(arguments: PackedStringArray, directory: String) -> void:
	if directory.is_empty(): return
	arguments.append("--application-rules-root")
	arguments.append(directory)


func _init(path: String) -> void:
	settings_path = path


func configure(kind: String, directory: String, executable: String) -> Dictionary:
	var normalized := directory.strip_edges().simplify_path()
	if not KEYS.has(kind): return {"ok": false, "error": "Unknown reference-library kind."}
	if normalized.is_empty():
		return {"ok": false, "error": "Choose a Classic application-media library directory." if kind == "application" else "Choose a Divinity reference-catalog directory."}
	if executable.is_empty():
		return {"ok": false, "error": "Providence CLI was not found. Build the Rust workspace first."}
	var command := "inspect-application-library" if kind == "application" else "inspect-reference-catalog"
	var output: Array = []
	var exit_code := OS.execute(executable, PackedStringArray([command, normalized]), output, true)
	if exit_code != 0:
		var detail := "The selected application-media library is invalid." if kind == "application" else "The selected Divinity reference catalog is invalid."
		if not output.is_empty() and not str(output[0]).strip_edges().is_empty(): detail = str(output[0]).strip_edges()
		return {"ok": false, "error": detail}
	var parsed: Variant = JSON.parse_string(str(output[0])) if not output.is_empty() else null
	if not parsed is Dictionary:
		return {"ok": false, "error": "Providence CLI returned a malformed library report." if kind == "application" else "Providence CLI returned a malformed reference-catalog report."}
	var report := parsed as Dictionary
	if not bool(report.get("ready", false)):
		return {"ok": false, "result": report, "error":
			"The selected library is not complete and unambiguous for all 240 stock appearance resources." if kind == "application" else
			"The selected catalog does not contain both Bag of Holding and Vault of Arcana entries."}
	var saved := save(kind, normalized)
	if not saved.get("ok", false): return saved
	return {"ok": true, "result": report}


func save(kind: String, directory: String) -> Dictionary:
	return _update(kind, directory, false)


func clear(kind: String) -> Dictionary:
	return _update(kind, "", true)


func _update(kind: String, directory: String, remove: bool) -> Dictionary:
	if not KEYS.has(kind): return {"ok": false, "error": "Unknown reference-library kind."}
	var settings := ConfigFile.new()
	var load_error := settings.load(settings_path)
	if load_error != OK and load_error != ERR_FILE_NOT_FOUND:
		return {"ok": false, "error": "Could not read Providence's local settings."}
	if remove: settings.erase_section_key(SECTION, KEYS[kind])
	else: settings.set_value(SECTION, KEYS[kind], directory)
	if settings.save(settings_path) != OK:
		return {"ok": false, "error": "Could not save Providence's local settings."}
	return {"ok": true}
