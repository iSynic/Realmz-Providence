extends RefCounted

var entries: Array = []
var error := ""
var _notices_loaded := false


func load_bundled() -> void:
	var path := "res://data/providence-help/manual.json"
	if not FileAccess.file_exists(path):
		error = "Offline Help is missing from this build. Reinstall the complete application."
		return
	var document: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not document is Dictionary or document.get("formatVersion") != 1 or not document.get("entries") is Array:
		error = "Offline Help could not be read. Reinstall the complete application."
		return
	entries = document.entries


func entry(identity: String) -> Dictionary:
	for row: Dictionary in entries:
		if row.id == identity: return row.duplicate(true)
	return {}


func matching(query: String) -> Array:
	var normalized := query.strip_edges().to_lower()
	return entries.filter(func(row): return normalized.is_empty() or str(row.searchText).contains(normalized))


func document_target(target: String) -> String:
	for row: Dictionary in entries:
		if row.article == target: return str(row.id)
	return ""


func load_distribution_notices() -> void:
	if _notices_loaded: return
	_notices_loaded = true
	for row: Dictionary in entries:
		if row.id != "licenses": continue
		row.sections.append({"title": "Godot Engine", "anchor": "godot", "body": Engine.get_license_text().replace("[", "[lb]")})
		var attribution := JSON.stringify(Engine.get_copyright_info(), "  ") + "\n\n" + JSON.stringify(Engine.get_license_info(), "  ")
		row.sections.append({"title": "Godot third-party attribution", "anchor": "godot-attribution", "body": attribution.replace("[", "[lb]")})
		var directory := preload("res://src/packaged_paths.gd").resource_root().path_join("third-party")
		if DirAccess.dir_exists_absolute(directory): _append_notices(row, directory, directory, 0)
		else: row.sections.append({"title": "Distribution notices", "anchor": "distribution-notices", "body": "Dependency notice files accompany the complete packaged application. They are not installed beside this development engine."})
		row.searchText += "\n" + "\n".join(row.sections.map(func(section): return str(section.body).to_lower()))


func _append_notices(row: Dictionary, root: String, directory: String, depth: int) -> void:
	if depth > 8:
		row.sections.append({"title": "Additional notices", "anchor": "notice-" + str(row.sections.size()), "body": "Additional dependency notices are available in the distribution's third-party directory: " + directory.trim_prefix(root + "/").replace("[", "[lb]")})
		return
	for file: String in DirAccess.get_files_at(directory):
		var lower := file.to_lower()
		if not (lower.begins_with("license") or lower.begins_with("copying") or lower.begins_with("notice") or lower.begins_with("authors") or lower.ends_with(".json")): continue
		var path := directory.path_join(file)
		var label := path.trim_prefix(root + "/")
		row.sections.append({"title": label, "anchor": "notice-" + str(row.sections.size()), "body": FileAccess.get_file_as_string(path).replace("[", "[lb]")})
	for folder: String in DirAccess.get_directories_at(directory):
		_append_notices(row, root, directory.path_join(folder), depth + 1)
