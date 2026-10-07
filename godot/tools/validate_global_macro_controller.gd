extends SceneTree

const Owner = preload("res://src/global_macro_controller.gd")
const Drafts = preload("res://src/editor_draft_apply.gd")

class Bridge extends "res://src/native_bridge.gd":
	var revision := 0
	var targets := {"start": null, "death": null, "quit": null, "shop": null, "temple": null}
	var fail_method := ""
	var unknown := false
	var calls: Array = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		OS.delay_msec(25)
		calls.append(method)
		if method == fail_method: return {"ok": false, "outcomeUnknown": unknown, "error": "Controlled rejection"}
		if method == "global-macro.open":
			var hooks: Array = []
			for hook in targets: hooks.append({"hook": hook, "targetNativeId": targets[hook]})
			var scripts: Array = []
			for id in range(1, 10): scripts.append({"nativeId":id, "identity":"extra-action-point:%d" % id, "descriptor":"Test XAP", "steps":[]})
			return {"ok": true, "result": {"hooks": hooks, "revision": revision, "assignedScripts":scripts}}
		if method == "global-macro.update-all":
			assert(params.expectedRevision == revision)
			for hook in params.hooks: targets[hook] = null if params.hooks[hook] == null else str(params.hooks[hook]).get_slice(":", 1).to_int()
			revision += 1
			return {"ok": true, "result": {"revision": revision, "changedEntities": ["project"]}}
		return {"ok": false, "error": "Unexpected request"}

var _bridge := Bridge.new()
var _view: Control
var _controller := Owner.new()
var _operations := ProvidenceEditorOperation.new()
var _drafts := Drafts.new()
var _pending: Dictionary = {}
var _frames := 0
var _projections := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.add_child(_operations)
	var tabs := TabContainer.new()
	_view = load("res://src/global_macro_editor.tscn").instantiate()
	tabs.add_child(_view)
	root.add_child(tabs)
	_drafts.initialize(tabs, _accept, func(): return null)
	_controller.initialize(_view, _operations, func(): return {"revision": _bridge.revision}, _drafts.accept)
	_controller.projection_applied.connect(func(_result): _projections += 1)
	_controller.attach_session(_bridge)
	process_frame.connect(func(): _frames += 1)
	assert((await _controller.reload()).ok and _frames > 2)
	assert(_operations.begin(_bridge, "Undo"))
	var refreshed: Dictionary = await _controller.reload(_operations)
	assert(refreshed.ok and _operations.busy)
	_operations.finish(refreshed)
	await _check_atomic_hooks()
	await _check_late_typing()
	await _check_failures()
	await _check_lifetimes()
	_controller.dispose()
	_bridge.stop()
	tabs.free()
	_operations.free()
	print("PROVIDENCE_GLOBAL_MACRO_CONTROLLER_OK five-hooks atomic-apply late-typing acknowledged-baseline read-failure borrowed-history unknown teardown")
	quit()


func _set_target(hook: String, target: int) -> void:
	_view.set_draft_target(hook, target)


func _check_atomic_hooks() -> void:
	_set_target("start", 2)
	_set_target("death", 3)
	assert((await _controller.reload()).get("draftKept", false))
	assert((await _drafts.commit()).ok)
	assert(_bridge.revision == 1 and _bridge.targets.start == 2 and _bridge.targets.death == 3)
	assert(not _view.has_unapplied_changes())


func _check_late_typing() -> void:
	_set_target("start", 4)
	call("_start_apply")
	assert(_operations.busy)
	_set_target("start", 5)
	_set_target("shop", 6)
	await _operations.completed
	await process_frame
	assert(_pending.get("partlyApplied", false) and _bridge.targets.start == 4)
	assert(_view.read_state().start == 5 and _view.read_state().shop == 6)
	_view.discard_draft()
	assert(_view.read_state().start == 4 and _view.read_state().shop == null)


func _check_failures() -> void:
	_set_target("quit", 7)
	_bridge.fail_method = "global-macro.update-all"
	var revision := _bridge.revision
	assert(not (await _drafts.commit()).ok and _bridge.revision == revision)
	assert(_view.read_state().quit == 7 and _view.has_unapplied_changes())
	_bridge.fail_method = "global-macro.open"
	assert((await _drafts.commit()).ok and not _view.has_unapplied_changes())
	assert(_bridge.targets.quit == 7 and _bridge.revision == revision + 1)
	_bridge.fail_method = "global-macro.update-all"
	_bridge.unknown = true
	_set_target("temple", 8)
	assert(not (await _drafts.commit()).ok and _operations.requires_reopen)
	var count := _bridge.calls.size()
	assert(not (await _drafts.commit()).ok and _bridge.calls.size() == count)
	_bridge.stop()
	_operations.reset_session()
	_bridge.fail_method = ""
	_bridge.unknown = false
	_controller.attach_session(_bridge)
	assert((await _controller.reload()).ok)


func _check_lifetimes() -> void:
	call("_start_reload")
	assert(_operations.busy)
	assert((await _controller.reload()).get("busy", false))
	_set_target("temple", 9)
	await _operations.completed
	await process_frame
	assert(_pending.get("draftKept", false) and _view.read_state().temple == 9)
	_view.discard_draft()
	call("_start_reload")
	_controller.teardown()
	await _operations.completed
	await process_frame
	assert(_pending.get("connectionChanged", false) and _view.read_state().start == null)
	assert(_projections == 3)


func _accept(response: Dictionary) -> bool:
	return response.get("ok", false)


func _start_reload() -> void:
	_pending = await _controller.reload()


func _start_apply() -> void:
	_pending = await _drafts.commit()
