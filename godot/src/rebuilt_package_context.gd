class_name ProvidenceRebuiltPackageContext
extends RefCounted

const FILE_NAME := "rebuilt-package-context.json"
const MAX_BYTES := 65536
const REQUIRED := ["applicationPackage", "applicationCampaignId", "applicationPackageHash", "classicApplicationDataDirectory"]
const PATHS := ["applicationPackage", "applicationMediaCatalogPath", "classicApplicationDataDirectory"]


static func resolve(library_root: String) -> Dictionary:
	var path := OS.get_environment("PROVIDENCE_REBUILT_PACKAGE_CONTEXT").strip_edges()
	var explicit := not path.is_empty()
	if not explicit and not library_root.is_empty(): path = library_root.path_join(FILE_NAME)
	if path.is_empty() or (not explicit and not FileAccess.file_exists(path)):
		return {"ok": true, "parameters": {}}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() > MAX_BYTES:
		return _failure("Could not read the configured Rebuilt application support. Choose a complete paired stock library.")
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if not parsed is Dictionary: return _failure("The configured Rebuilt application support is not a valid context file.")
	var context: Dictionary = parsed.duplicate(true)
	for key: String in REQUIRED:
		if not context.get(key) is String or str(context[key]).strip_edges().is_empty():
			return _failure("The configured Rebuilt application support is missing %s." % key)
	for key: String in PATHS:
		if not context.has(key): continue
		if not context[key] is String: return _failure("The configured Rebuilt support path %s is invalid." % key)
		var value := str(context[key])
		context[key] = value.simplify_path() if value.is_absolute_path() else path.get_base_dir().path_join(value).simplify_path()
	return {"ok": true, "parameters": {"packageFinalization": context}}


static func _failure(message: String) -> Dictionary:
	return {"ok": false, "error": message}
