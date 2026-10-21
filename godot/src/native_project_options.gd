extends RefCounted


static func prepare(path: String, require_snapshot: bool, options: Dictionary) -> Dictionary:
	var normalized := path.strip_edges()
	if normalized.is_empty() or (require_snapshot and not FileAccess.file_exists(normalized.path_join("project.providence.json"))):
		return {"ok": false, "error": "Selected directory does not contain project.providence.json: %s" % normalized}
	var shared: bool = options.get("shared", false)
	var arguments := PackedStringArray(["serve-native-project" if shared else "serve-project", normalized])
	if shared: arguments.append_array(["--native-client-id", options.owner])
	for entry in [["--application-library-root", options.application], ["--reference-catalog-root", options.reference]]:
		if not str(entry[1]).is_empty(): arguments.append_array(entry)
	var monster := preload("res://src/native_library_settings.gd").append_monster(arguments, options.settingsPath, options.monster)
	arguments.append_array(["--personal-library-root", options.personal])
	preload("res://src/native_library_settings.gd").append_stock_items(arguments, options.rules)
	return {"ok": true, "arguments": arguments, "projectPath": normalized,
		"applicationLibrary": options.application, "referenceCatalog": options.reference, "monsterLibrary": monster}
