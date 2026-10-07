extends RefCounted

static func create(executable: String, project_id: String, project_path: String, support: String) -> Dictionary:
	var arguments := PackedStringArray(["project-new", project_id, project_path])
	if not support.is_empty():
		arguments.append("--application-data-directory")
		arguments.append(support)
	var output: Array = []
	if OS.execute(executable, arguments, output, true) != 0:
		var detail := "Project creation failed."
		if not output.is_empty() and not str(output[0]).strip_edges().is_empty(): detail = str(output[0]).strip_edges()
		return {"ok": false, "error": detail}
	return {"ok": true}
