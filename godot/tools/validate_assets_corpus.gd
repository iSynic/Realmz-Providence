extends SceneTree

class CorpusBridge extends "res://src/native_bridge.gd":
	func configured_monster_library_root(_explicit_root: String = "") -> String:
		return ""

var _bridge
var _failed := false
var _operations: ProvidenceEditorOperation


func _initialize() -> void:
	call_deferred("_run")


func _check(condition: bool, message: String) -> bool:
	if not condition:
		_failed = true
		push_error(message)
		if _bridge != null:
			_bridge.stop()
		quit(1)
	return condition


func _call(method: String, params: Dictionary = {}) -> Dictionary:
	if _failed:
		return {}
	var response: Dictionary = _bridge.request(method, params)
	_check(bool(response.get("ok", false)), method + ": " + str(response.get("error", "")))
	return response.get("result", {})


func _revision() -> int:
	return int(_call("session.describe").get("revision", -1))


func _settle_operations() -> void:
	var idle_frames := 0
	while idle_frames < 2:
		await process_frame
		idle_frames = 0 if _operations != null and _operations.busy else idle_frames + 1


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 3, "Expected disposable project, stock library and supplied catalog roots."):
		return
	var project := args[0]
	if not _check(FileAccess.file_exists(project.path_join("assets-corpus-disposable.marker")), "Refusing a project without the disposable-test marker."):
		return
	_bridge = CorpusBridge.new(project.path_join("test-settings.cfg"))
	if not _check(bool(_bridge.start_project(project, args[1], args[2]).get("ok", false)), "Corpus project did not open."):
		return
	var before := _call("project-asset.list", {"limit": 1})
	var items := _call("item.list", {"scope": "scenario", "limit": 1})
	if not _check(not items.get("items", []).is_empty(), "The corpus must contain scenario items."):
		return
	var target := int(items.items[0].recordIndex)
	var original_icon := int(items.items[0].iconId)
	var supplied := _call("reference-catalog.list", {"kind": "vault-icon", "limit": 1})
	if not _check(not supplied.get("items", []).is_empty(), "The real Vault catalog is empty."):
		return
	var artwork: String = supplied.items[0].identity
	var number := 32001
	_call("reference-catalog.copy-icon", {"identity": artwork, "resourceId": number, "expectedRevision": _revision()})
	if _failed:
		return
	var identity := "item-artwork:32001"
	var preview := _call("icon.preview", {"identity": identity})
	if not _check(not str(preview.get("base64", "")).is_empty(), "Copied corpus icon has no preview."):
		return
	_call("scenario-item.use-scenario-artwork", {"identity": identity, "recordIndex": target, "expectedRevision": _revision()})
	var changed := _call("item.list", {"scope": "scenario", "limit": 1})
	if not _check(int(changed.get("items", [{}])[0].get("iconId", 0)) == number, "The selected corpus item did not change."):
		return
	_call("history.undo", {"expectedRevision": _revision()})
	var undone := _call("item.list", {"scope": "scenario", "limit": 1})
	if not _check(int(undone.get("items", [{}])[0].get("iconId", 0)) == original_icon, "Undo did not restore the corpus item."):
		return
	_call("history.redo", {"expectedRevision": _revision()})
	_call("project.save")
	if _failed:
		return
	_bridge.stop()
	if not _check(bool(_bridge.start_project(project, args[1], args[2]).get("ok", false)), "Saved corpus project did not reopen."):
		return
	var reopened := _call("item.list", {"scope": "scenario", "limit": 1})
	var assets := _call("project-asset.list", {"limit": 1})
	if not _check(int(reopened.get("items", [{}])[0].get("iconId", 0)) == number and int(assets.get("total", 0)) == int(before.get("total", 0)) + 1, "Reopen lost the assignment or duplicated assets."):
		return
	_bridge.stop()
	print("PROVIDENCE_ASSETS_CORPUS_OK items=%d vault=%d copy-use-undo-redo-save-reopen" % [int(items.total), int(supplied.total)])
	quit()
