extends RefCounted

const SETTINGS := "user://mcp-client-setup.cfg"


static func saved_roots() -> Dictionary:
	var settings := ConfigFile.new()
	settings.load(SETTINGS)
	return {"project": str(settings.get_value("mcp", "project_root", "")), "output": str(settings.get_value("mcp", "output_root", ""))}


static func configuration(context: Dictionary, project_root: String, output_root: String) -> Dictionary:
	if not FileAccess.file_exists(context.server): return {"ok": false, "error": "Install providence-mcp beside the native adapter before copying configuration."}
	for path in [project_root, output_root]:
		if path.is_empty() or not path.is_absolute_path() or not DirAccess.dir_exists_absolute(path):
			return {"ok": false, "error": "Choose existing absolute project and export folders."}
	var arguments := ["--project-root", project_root, "--output-root", output_root]
	arguments.append_array(context.supportOptions)
	return {"ok": true, "configuration": {"mcpServers": {"providence": {"command": context.server, "args": arguments}}}}


static func save_roots(project_root: String, output_root: String) -> Error:
	var settings := ConfigFile.new()
	var result := settings.load(SETTINGS)
	if result != OK and result != ERR_FILE_NOT_FOUND: return result
	settings.set_value("mcp", "project_root", project_root)
	settings.set_value("mcp", "output_root", output_root)
	return settings.save(SETTINGS)
