extends RefCounted

signal _woken

var _bridge: ProvidenceNativeBridge
var _source: ProvidenceNativeBridge
var _source_epoch := -1
var _support: Dictionary = {}
var _generation := 0
var _waiting := false


func close() -> void:
	_generation += 1
	if _waiting: _woken.emit()
	if _bridge != null: _bridge.stop()
	_bridge = null
	_source = null


func read_status(source: ProvidenceNativeBridge, tree: SceneTree) -> Dictionary:
	return await _request(source, "session.collaboration", {}, tree)


func report_draft(source: ProvidenceNativeBridge, report: Dictionary, tree: SceneTree) -> Dictionary:
	return await _request(source, "session.draft", report, tree)


func _request(source: ProvidenceNativeBridge, method: String, params: Dictionary, tree: SceneTree) -> Dictionary:
	if _source != source or _source_epoch != source.connection_epoch() or _support != source.mcp_setup_context():
		close()
		_source = source
		_source_epoch = source.connection_epoch()
		_support = source.mcp_setup_context().duplicate(true)
		_bridge = source.fork_connection()
		var opened := _bridge.begin_status_observer(source)
		if opened.get("ok", false): opened = await _wait(tree)
		if not opened.get("ok", false): return opened
	var started := _bridge.begin_request(method, params)
	if not started.get("ok", false): return started
	return await _wait(tree)


func _wait(tree: SceneTree) -> Dictionary:
	var generation := _generation
	assert(not _waiting, "Collaboration control requests are sequential")
	_waiting = true
	var wake_on_frame := func(): _woken.emit()
	tree.process_frame.connect(wake_on_frame)
	var response := {"ok":false,"cancelled":true}
	while generation == _generation:
		var polled := _bridge.poll_request()
		if not polled.get("pending", false): response = polled.response; break
		await _woken
	tree.process_frame.disconnect(wake_on_frame)
	_waiting = false
	return response
