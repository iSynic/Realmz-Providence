extends RefCounted

signal status_changed(message: String)
signal failed(message: String)


const MINIMUM_ENGINE_VERSION := "0.1.0"

var _dialog: ProvidencePublishTargetsDialog
var _operations: ProvidenceEditorOperation
var _session
var _read_context: Callable
var _active := false
var _readiness := ProvidenceReadinessJob.new()


func initialize(dialog: ProvidencePublishTargetsDialog, operations: ProvidenceEditorOperation, session, read_context: Callable) -> void:
	_dialog = dialog
	_operations = operations
	_session = session
	_read_context = read_context
	_readiness.operations = operations
	_readiness.bridge = session.bridge
	_dialog.readiness_requested.connect(inspect_readiness)
	_dialog.publish_requested.connect(publish)


func show_targets() -> void:
	if _active or not _operations.begin(_session.bridge, "Open publishing"): return
	_active = true
	var contact := await _operations.request("scenario-contact.open")
	_operations.finish(contact)
	_active = false
	if contact.get("outcomeUnknown", false): return
	var title := str(contact.get("result", {}).get("contact", {}).get("title", "")).strip_edges()
	if title.is_empty(): title = str(_read_context.call().get("projectId", ""))
	_dialog.popup_publish(title, _session.bridge.current_project_path(), _session.bridge.current_application_library_root())
	status_changed.emit("Readiness unchecked.")


func inspect_readiness(application_library_root: String) -> void:
	if _active: return
	var input_generation := _dialog.input_generation()
	var response := await _run("Check publishing readiness", application_library_root, _inspect)
	if input_generation != _dialog.input_generation():
		_dialog.apply_error("Paths changed while readiness was checked. Check both targets again.")
		return
	if not _accept(response, "Publishing readiness could not be inspected."): return
	var result: Dictionary = response.result
	_dialog.apply_readiness(result.classic, result.rebuilt, result.compiler, result.preview)


func publish(classic_directory: String, rebuilt_path: String, application_library_root: String, expected_revision: int) -> void:
	if _active: return
	if expected_revision != int(_read_context.call().get("revision", -1)):
		_dialog.apply_error("The project changed after readiness was checked. Check both targets again before publishing.")
		return
	_dialog.apply_publish_started()
	var response := await _run("Publish Classic and Rebuilt", application_library_root,
		_publish.bind(classic_directory, rebuilt_path, expected_revision))
	if not _accept(response, "Publication failed."): return
	var result: Dictionary = response.result
	_dialog.apply_published(result.classic, result.rebuilt)
	status_changed.emit("Published Classic and Rebuilt targets · revision %d · compiler %s" % [
		expected_revision, str(result.compiler.get("commit", "unavailable")).left(12)])


func _run(label: String, library: String, workflow: Callable) -> Dictionary:
	_active = true
	var response: Dictionary = await _session.configure_application_library(library)
	if response.get("ok", false):
		response = await _operations.run_workflow(_session.bridge, label, workflow)
	_active = false
	return response


func _inspect(operation: ProvidenceEditorOperation) -> Dictionary:
	_readiness.bridge = _session.bridge
	var compiler := await operation.request("compiler.describe")
	if not compiler.get("ok", false): return compiler
	var classic := await _readiness.run({"target":"classic", "offset": 0, "limit": 200}, Callable(), operation)
	if not classic.get("ok", false): return classic
	var support := ProvidenceRebuiltPackageContext.resolve(_session.bridge.current_application_library_root())
	if not support.get("ok", false): return support
	var readiness_params := {"target":"rebuilt", "offset": 0, "limit": 200}
	readiness_params.merge(support.parameters)
	var rebuilt := await _readiness.run(readiness_params, Callable(), operation)
	if not rebuilt.get("ok", false): return rebuilt
	var preview: Dictionary = {}
	if ProvidencePublishReadiness.is_ready(rebuilt.result):
		var params := _package_options(compiler.result)
		params.merge(support.parameters)
		var inspected := await operation.request("project.inspect-rebuilt-package", params)
		if not inspected.get("ok", false): return inspected
		preview = inspected.result
	return {"ok": true, "result": {"classic": classic.result, "rebuilt": rebuilt.result,
		"compiler": compiler.result, "preview": preview}}


func _publish(operation: ProvidenceEditorOperation, classic_directory: String, rebuilt_path: String, revision: int) -> Dictionary:
	if revision != int(_read_context.call().get("revision", -1)):
		return {"ok": false, "error": "The project changed after readiness was checked. Check both targets again before publishing."}
	var support := ProvidenceRebuiltPackageContext.resolve(_session.bridge.current_application_library_root())
	if not support.get("ok", false): return support
	var compiler := await operation.request("compiler.describe")
	if not compiler.get("ok", false): return compiler
	var classic := await operation.request("project.compile-classic-slice", {"directory": classic_directory})
	if not classic.get("ok", false): return classic
	var params := _package_options(compiler.result)
	params.merge(support.parameters)
	params["path"] = rebuilt_path
	var rebuilt := await operation.request("project.compile-rebuilt-package", params)
	if not rebuilt.get("ok", false):
		var outcome := "Rebuilt publication could not be confirmed." if rebuilt.get("outcomeUnknown", false) else "Rebuilt was not published."
		rebuilt["error"] = "%s\nClassic was published to %s and was not removed; %s" % [
			str(rebuilt.get("error", "Rebuilt publication failed.")), classic_directory, outcome]
		return rebuilt
	return {"ok": true, "result": {"classic": classic.result, "rebuilt": rebuilt.result, "compiler": compiler.result}}


func _package_options(compiler: Dictionary) -> Dictionary:
	return {"compilerCommit": str(compiler.get("commit", "unavailable")), "minimumEngineVersion": MINIMUM_ENGINE_VERSION}


func _accept(response: Dictionary, fallback: String) -> bool:
	if response.get("ok", false): return true
	var detail := str(response.get("error", fallback))
	if response.get("outcomeUnknown", false):
		detail += "\nReopen the project and inspect both destinations before trying again. Publication was not retried."
	_dialog.apply_error(detail)
	return false


func compile_scenario_items() -> void:
	var data_path := ProjectSettings.globalize_path("user://Data NI")
	var text_path := ProjectSettings.globalize_path("user://Data NI.rsrc")
	var params := {
		"path": data_path,
		"textPath": text_path,
	}
	var response := await _operations.run_workflow(_session.bridge, "Compile scenario items", func(operation):
		return await operation.request("project.compile-data-ni", params))
	if _accept_direct(response):
		var result := response.result as Dictionary
		status_changed.emit("Compiled scenario items · %d + %d bytes" % [
			int(result.get("bytes", 0)),
			int(result.get("textBytes", 0)),
		])


func _accept_direct(response: Dictionary) -> bool:
	if response.get("ok", false): return true
	failed.emit(str(response.get("error", "Native command failed.")))
	return false
