extends Node

signal finished(error: String)

var pending := false
var _generation := 0
var _on_failure: Callable
var _operations: ProvidenceEditorOperation
var _activity_at := 0


func _ready() -> void:
	finished.connect(func(error: String):
		if not error.is_empty() and _on_failure.is_valid(): _on_failure.call(error))


func _exit_tree() -> void:
	stop()


func _input(_event: InputEvent) -> void:
	_activity_at = Time.get_ticks_msec()


func _busy_changed(_busy: bool, _label: String) -> void:
	_activity_at = Time.get_ticks_msec()


func start(bridge: RefCounted, operations: ProvidenceEditorOperation, on_failure: Callable) -> void:
	if _operations != operations:
		if _operations != null: _operations.busy_changed.disconnect(_busy_changed)
		_operations = operations
		_operations.busy_changed.connect(_busy_changed)
	_on_failure = on_failure
	_generation += 1
	pending = true
	var generation := _generation
	var epoch: int = bridge.connection_epoch()
	await _poll(bridge, operations, generation, epoch)
	if pending and generation == _generation: _schedule(bridge, operations, generation, epoch)


func _schedule(bridge: RefCounted, operations: ProvidenceEditorOperation, generation: int, epoch: int) -> void:
	# A signal connection to this node expires on teardown; no suspended timer
	# coroutine may resume against a freed shell.
	var idle_remaining := 2.0 - float(Time.get_ticks_msec() - _activity_at) / 1000.0
	var delay := 2.0 if operations.busy else maxf(0.05, idle_remaining)
	get_tree().create_timer(delay).timeout.connect(_check.bind(bridge, operations, generation, epoch), CONNECT_ONE_SHOT)


func _check(bridge: RefCounted, operations: ProvidenceEditorOperation, generation: int, epoch: int) -> void:
	if generation != _generation or not is_inside_tree(): return
	if bridge.connection_epoch() != epoch:
		pending = false
		return
	if not operations.busy and Time.get_ticks_msec() - _activity_at >= 2000:
		await _poll(bridge, operations, generation, epoch)
	if pending and generation == _generation and is_inside_tree(): _schedule(bridge, operations, generation, epoch)


func _poll(bridge: RefCounted, operations: ProvidenceEditorOperation, generation: int, epoch: int) -> void:
	var response: Dictionary = await operations.run_workflow(bridge, "", func(operation): return await operation.request("application-media.integrity-status"))
	if generation != _generation or bridge.connection_epoch() != epoch: return
	if not response.get("ok", false) or response.result.get("status", "") == "failed":
		pending = false
		finished.emit(str(response.get("error", response.get("result", {}).get("error", "Stock verification failed. Reopen or repair the Stock library."))))
	elif response.result.get("status", "") == "complete":
		pending = false
		finished.emit("")


func stop() -> void:
	_generation += 1
	pending = false
