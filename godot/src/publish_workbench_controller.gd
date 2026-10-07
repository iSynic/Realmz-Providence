class_name ProvidencePublishWorkbenchController
extends RefCounted

signal status_changed(message: String)
signal failed(message: String)

const MINIMUM_ENGINE_VERSION := "0.1.0"

var _view: ProvidencePublishWorkbench
var _operations: ProvidenceEditorOperation
var _context: Callable
var _read_bridge: Callable
var _generation := 0
var _request_generation := 0
var _compiler: Dictionary = {}
var _readiness := ProvidenceReadinessJob.new()


func initialize(view: ProvidencePublishWorkbench, operations: ProvidenceEditorOperation, context: Callable, read_bridge: Callable) -> void:
	_view = view
	_operations = operations
	_context = context
	_read_bridge = read_bridge
	_readiness.operations = operations
	_view.target_changed.connect(_target_changed)
	_view.recheck_requested.connect(recheck)
	_view.cancel_check_requested.connect(_cancel_check)
	_view.page_requested.connect(load_page)
	_view.publish_requested.connect(_choose_destination)
	_view.destination_selected.connect(publish_to)
	_view.benchmark_requested.connect(run_benchmark)


func attach_session() -> void:
	_generation += 1
	_request_generation += 1
	_update_context()


func teardown() -> void:
	_readiness.cancel()
	_generation += 1
	_request_generation += 1
	_compiler.clear()
	_view.show_unavailable("Open a persistent project to inspect publishing readiness.")


func reload(operation: ProvidenceEditorOperation = null) -> Dictionary:
	_update_context()
	if not _available(): return {"ok": false, "error": "Open a persistent project before publishing."}
	return await recheck(operation)


func recheck(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if not _available():
		_view.show_unavailable("Open a persistent project before publishing.")
		return {"ok": false, "error": "Open a persistent project before publishing."}
	_request_generation += 1
	var guard := _guard(0)
	_view.begin_check()
	_readiness.bridge = _read_bridge.call()
	var readiness_params := {"target": "rebuilt" if _view.target() == "rebuilt" else "classic", "offset": 0, "limit": 8}
	if _view.target() == "rebuilt":
		var support := ProvidenceRebuiltPackageContext.resolve(_readiness.bridge.current_application_library_root())
		if not support.get("ok", false):
			_view.present_failure(str(support.get("error", "Application support unavailable.")))
			return support
		readiness_params.merge(support.parameters)
	var checked := await _readiness.run(readiness_params, _guard_current.bind(guard), borrowed)
	var response := checked
	if checked.get("ok", false):
		response = await _operations.run_workflow(_read_bridge.call(), "Check %s publishing" % _view.target().capitalize(), _inspect.bind(guard, checked), borrowed)
	if not _guard_current(guard):
		if int(guard.request) == _request_generation: _view.invalidate("Project changed · Recheck before publishing.")
		return _stale()
	if not response.get("ok", false):
		_view.present_failure(str(response.get("error", "Publishing readiness could not be inspected.")))
		return response
	var result := response.result as Dictionary
	var revision := int(_context.call().get("revision", -1))
	if int(result.readiness.get("revision", -1)) != revision or (not result.plan.is_empty() and int(result.plan.get("revision", -1)) != revision):
		_view.invalidate("Project changed · Recheck before publishing.")
		return _stale()
	_compiler = result.compiler
	_view.present_check(result.readiness, result.plan, result.compiler)
	if result.has("benchmark"): _view.present_benchmark(result.benchmark)
	_view.focus_route(_view.route_identity())
	status_changed.emit("%s publishing checked · revision %d" % [_view.target().capitalize(), int(result.readiness.revision)])
	return response


func load_page(offset: int) -> Dictionary:
	if _view.checked_revision() != int(_context.call().get("revision", -1)):
		_view.invalidate("Project changed · Recheck before browsing files.")
		return {"ok": false, "stale": true, "error": "Project changed before the next file page loaded."}
	_request_generation += 1
	var guard := _guard(offset)
	_view.begin_page_load()
	var response := await _operations.run_workflow(_read_bridge.call(), "Load publish file page", _inspect_page.bind(guard))
	if not _guard_current(guard): return _stale()
	if not response.get("ok", false):
		_view.present_page_failure(str(response.get("error", "The file page could not be loaded.")))
		return response
	if int(response.result.get("revision", -1)) != _view.checked_revision():
		_view.invalidate("Project changed · Recheck before browsing files.")
		return _stale()
	_view.present_page(response.result)
	return response


func run_benchmark() -> Dictionary:
	if not _available(): return {"ok": false, "error": "Open a project before measuring it."}
	_request_generation += 1
	var guard := _guard(0)
	var expected := int(_context.call().get("revision", -1))
	_view.begin_benchmark()
	var response := await _operations.run_workflow(_read_bridge.call(), "Measure project", func(operation):
		return await operation.request("project.benchmark"))
	if not _guard_current(guard): return _stale()
	if response.get("ok", false):
		if int(response.result.get("revision", -1)) != expected or expected != int(_context.call().get("revision", -1)):
			_view.invalidate("Project changed · Recheck before publishing.")
			return _stale()
		_view.present_benchmark(response.result)
		status_changed.emit("Project benchmark refreshed · revision %d" % int(response.result.revision))
	else:
		_view.present_benchmark_failure(str(response.get("error", "Benchmark failed.")))
	return response


func publish_to(target: String, path: String) -> Dictionary:
	if target != _view.target(): return _stale()
	var expected := _view.checked_revision()
	if expected < 0 or expected != int(_context.call().get("revision", -1)):
		_view.invalidate("Project changed · Recheck before publishing.")
		return {"ok": false, "stale": true, "error": "Project changed before publishing."}
	_view.begin_publish()
	var guard := _guard(0)
	var response := await _operations.run_workflow(_read_bridge.call(), "Publish %s" % target.capitalize(), _publish.bind(target, path, expected, guard))
	if not _guard_current(guard): return _stale()
	if response.get("ok", false):
		_view.present_published(response.result)
		status_changed.emit("Published %s · revision %d" % [target.capitalize(), expected])
	else:
		_view.present_publish_failure(str(response.get("error", "Publication failed.")), bool(response.get("outcomeUnknown", false)),
			str(response.get("repairRoute", "")), str(response.get("repairLabel", "")))
		if response.get("outcomeUnknown", false):
			failed.emit("Publication could not be confirmed. Reopen the project before trying again.")
		else:
			status_changed.emit("Publish %s failed · no output written" % target.capitalize())
	return response


func _inspect(operation: ProvidenceEditorOperation, guard: Dictionary, readiness: Dictionary) -> Dictionary:
	var compiler := await operation.request("compiler.describe")
	if not compiler.get("ok", false): return compiler
	if not _guard_current(guard): return _stale()
	var plan: Dictionary = {}
	if ProvidencePublishReadiness.is_ready(readiness.result):
		var planned := await _request_plan(operation, _plan_params(compiler.result, 0))
		if not planned.get("ok", false): return planned
		plan = planned.result
	var benchmark := await operation.request("project.benchmark")
	var result := {"compiler": compiler.result, "readiness": readiness.result, "plan": plan}
	if benchmark.get("ok", false): result["benchmark"] = benchmark.result
	return {"ok": true, "result": result}


func _inspect_page(operation: ProvidenceEditorOperation, guard: Dictionary) -> Dictionary:
	return await _request_plan(operation, _plan_params(_compiler, int(guard.offset)))


func _request_plan(operation: ProvidenceEditorOperation, params: Dictionary) -> Dictionary:
	if _view.target() != "rebuilt": return await operation.request(_plan_method(), params)
	return await _package_request(operation, _plan_method(), params)


func _package_request(operation: ProvidenceEditorOperation, method: String, params: Dictionary) -> Dictionary:
	var support := ProvidenceRebuiltPackageContext.resolve(_read_bridge.call().current_application_library_root())
	if not support.get("ok", false): return support
	params.merge(support.parameters)
	return await operation.request(method, params)


func _publish(operation: ProvidenceEditorOperation, target: String, path: String, expected: int, guard: Dictionary) -> Dictionary:
	if not _guard_current(guard) or expected != int(_context.call().get("revision", -1)): return _stale()
	if target == "classic":
		return await operation.request("project.compile-classic-slice", {"directory": path, "expectedRevision": expected})
	if target == "stuffit":
		return await operation.request("project.compile-classic-stuffit", {"path": path, "expectedRevision": expected, "manifestSha256": _view.manifest_sha256()})
	var params := _package_options(_compiler)
	params["path"] = path
	params["expectedRevision"] = expected
	return await _package_request(operation, "project.compile-rebuilt-package", params)


func _target_changed(_target: String) -> void:
	_request_generation += 1
	recheck.call_deferred()


func _choose_destination(_target: String) -> void:
	_view.choose_destination()


func _update_context() -> void:
	var context := _context.call() as Dictionary
	var bridge = _read_bridge.call()
	var backed: bool = bridge != null and bridge.is_project_backed()
	_view.set_project_context(bool(context.get("connected", false)) and backed,
		str(context.get("projectId", "")), int(context.get("revision", -1)),
		bridge.current_application_library_root() if backed else "")


func _available() -> bool:
	var bridge = _read_bridge.call()
	return bridge != null and bridge.is_project_backed() and bool(_context.call().get("connected", false))


func _plan_method() -> String:
	if _view.target() == "stuffit": return "project.inspect-classic-stuffit"
	return "project.inspect-classic-plan" if _view.target() == "classic" else "project.inspect-rebuilt-package"


func _plan_params(compiler: Dictionary, offset: int) -> Dictionary:
	var params := {"offset": offset, "limit": ProvidencePublishWorkbench.PAGE_SIZE}
	if _view.target() == "rebuilt": params.merge(_package_options(compiler))
	return params


func _package_options(compiler: Dictionary) -> Dictionary:
	return {"compilerCommit": str(compiler.get("commit", "unavailable")), "minimumEngineVersion": MINIMUM_ENGINE_VERSION}


func _guard(offset: int) -> Dictionary:
	var context := _context.call() as Dictionary
	return {"generation": _generation, "request": _request_generation, "target": _view.target(), "offset": offset, "projectId":context.get("projectId", ""), "revision":context.get("revision", -1)}


func _guard_current(guard: Dictionary) -> bool:
	var context := _context.call() as Dictionary
	return int(guard.generation) == _generation and int(guard.request) == _request_generation and str(guard.target) == _view.target() and guard.projectId == context.get("projectId", "") and guard.revision == context.get("revision", -1)


func _cancel_check() -> void:
	_request_generation += 1
	_readiness.cancel()
	_view.invalidate("Check cancelled.")


func _stale() -> Dictionary:
	return {"ok": false, "stale": true, "error": "The publishing target or project changed while loading."}
