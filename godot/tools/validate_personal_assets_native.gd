extends SceneTree

class IsolatedBridge extends "res://src/native_bridge.gd":
	var personal_root := ""
	func configured_personal_library_root() -> String: return personal_root
	func configured_application_library_root(_explicit_root: String = "") -> String: return ""
	func configured_reference_catalog_root(_explicit_root: String = "") -> String: return ""
	func configured_monster_library_root(_explicit_root: String = "") -> String: return ""

var bridge: IsolatedBridge
var workbench: Control
var panel: Control
var dialog: Window
var original_path := ""
var scenario_path := ""
var collection_id := ""
var failed := false


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	create_timer(45).timeout.connect(func(): push_error("Personal authoring exceeded its deadline"); quit(1))
	var paths := OS.get_cmdline_user_args()
	if not _check(paths.size() == 1, "fixture root"): return
	var work_root := paths[0]
	DirAccess.make_dir_recursive_absolute(work_root)
	var image := Image.create(2, 2, false, Image.FORMAT_RGBA8); image.fill(Color(0.8, 0.2, 0.1, 0.5))
	original_path = work_root.path_join("Ruby.png")
	if not _check(image.save_png(original_path) == OK, "source PNG"): return
	bridge = IsolatedBridge.new(work_root.path_join("settings.cfg"))
	bridge.personal_root = work_root.path_join("personal-assets")
	scenario_path = work_root.path_join("copy-scenario")
	if not _check(bridge.create_project("copy-scenario", scenario_path).get("ok", false), "create scenario"): return
	workbench = load("res://src/unified_assets_editor.tscn").instantiate(); root.add_child(workbench)
	workbench.size = Vector2(1480, 800)
	await workbench.reload(bridge)
	panel = workbench.get_node("%Gallery"); dialog = workbench.get_node("%MediaDialog")
	await _import_and_organize()
	if failed: return
	await _copy_and_reopen()
	if failed: return
	await _remove_original()
	if failed: return
	workbench.queue_free(); await process_frame; bridge.stop()
	print("PROVIDENCE_PERSONAL_ASSETS_NATIVE_OK reviewed-original atomic-name-collection independent-history copy-reopen-remove")
	quit()


func _check(condition: bool, message: String) -> bool:
	if condition: return true
	failed = true; push_error("PERSONAL_ASSETS_NATIVE_FAILED " + message)
	if bridge != null: bridge.stop()
	quit(1); return false


func _review_and_accept() -> bool:
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	if not _check(not dialog.get_node("%Accept").disabled, dialog.get_node("%Impact").text): return false
	await dialog._accept()
	while bridge.operation_busy(): await process_frame
	return _check(not dialog.visible, "committed acknowledgement closes review")


func _import_and_organize() -> void:
	await workbench.show_scope("personal")
	await dialog.open_review("import", bridge, workbench._media_commands, {"scope":"personal", "kind":"icon"})
	dialog.get_node("%Path").text = original_path; dialog.get_node("%DraftName").text = "Ruby"
	dialog.get_node("%OutputMode").select(1)
	if not await _review_and_accept(): return
	await dialog.open_review("new-collection", bridge, workbench._media_commands, {"scope":"personal"})
	dialog.get_node("%DraftName").text = "Gems"
	if not await _review_and_accept(): return
	collection_id = bridge.request("personal-library.collections", {}).result.items[0].identity
	await panel.reload(bridge); await panel._select(0)
	if not _check(panel.get_node("%Preview").texture != null, "original preview"): return
	await dialog.open_review("organize", bridge, workbench._media_commands, panel.selection_context())
	dialog.get_node("%DraftName").text = "Garnet"; dialog.get_node("%Collection").select(1)
	if not await _review_and_accept(): return
	var row: Dictionary = bridge.request("personal-library.list", {}).result.items[0]
	if not _check(row.name == "Garnet" and row.collection == collection_id, "atomic name and collection"): return
	await workbench._library_history("undo")
	row = bridge.request("personal-library.list", {}).result.items[0]
	if not _check(row.name == "Ruby" and row.collection == null, "undo whole metadata form"): return
	await workbench._library_history("redo")
	_check(bridge.request("session.describe").result.revision == 0, "library editing leaves scenario untouched")


func _copy_and_reopen() -> void:
	await panel.reload(bridge); await panel._select(0)
	await dialog.open_review("prepare-original", bridge, workbench._media_commands, panel.selection_context())
	dialog.get_node("%Number").value = 30126
	if not await _review_and_accept(): return
	if not _check(bridge.request("project-asset.list", {}).result.total == 1, "copy creates exact scenario resource"): return
	if not _check(bridge.request("project.save", {}).get("ok", false), "Save acknowledged"): return
	bridge.stop()
	if not _check(bridge.start_project(scenario_path).get("ok", false), "reopen"): return
	await workbench.reload(bridge); await panel._select(0)
	var listed: Dictionary = bridge.request("personal-library.list", {"collection":collection_id,"limit":25})
	_check(listed.result.total == 1 and listed.result.items[0].name == "Garnet", "library metadata survives reopen")


func _remove_original() -> void:
	await dialog.open_review("remove-personal", bridge, workbench._media_commands, panel.selection_context())
	if not await _review_and_accept(): return
	if not _check(bridge.request("personal-library.list", {}).result.total == 0, "library remove"): return
	if not _check(bridge.request("project-asset.list", {}).result.total == 1, "scenario copy survives library removal"): return
	if not _check(FileAccess.file_exists(original_path), "source file preserved"): return
	await workbench._library_history("undo")
	_check(bridge.request("personal-library.list", {}).result.items[0].collection == collection_id, "undo removal restores original and metadata")
