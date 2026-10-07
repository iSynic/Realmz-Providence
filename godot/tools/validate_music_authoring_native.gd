extends SceneTree

class IsolatedBridge extends "res://src/native_bridge.gd":
	var personal_root := ""
	func configured_personal_library_root() -> String: return personal_root
	func configured_application_library_root(_explicit_root: String = "") -> String: return ""
	func configured_reference_catalog_root(_explicit_root: String = "") -> String: return ""
	func configured_monster_library_root(_explicit_root: String = "") -> String: return ""

var bridge: IsolatedBridge
var workbench: Control
var dialog: Window
var panel: Control
var work_root := ""
var path := ""
var failed := false
var receipts: Array = []


func _initialize() -> void: _run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty(): push_error("A disposable fixture root is required."); quit(2); return
	work_root = args[0]; DirAccess.make_dir_recursive_absolute(work_root)
	path = work_root.path_join("harbor.mod")
	FileAccess.open(path, FileAccess.WRITE).store_buffer(preload("res://tools/music_fixture.gd").module_bytes())
	root.gui_embed_subwindows = true; root.size = Vector2i(1600, 900)
	bridge = IsolatedBridge.new(work_root.path_join("settings.cfg"))
	bridge.personal_root = work_root.path_join("library")
	if not _check(bridge.create_project("music-authoring", work_root.path_join("scenario")).get("ok", false), "create real project"): return
	workbench = load("res://src/unified_assets_editor.tscn").instantiate(); root.add_child(workbench)
	workbench.size = Vector2(1500, 800)
	await workbench.reload(bridge); await workbench.show_scope("scenario")
	dialog = workbench.get_node("%MediaDialog"); panel = workbench.get_node("%Gallery")
	if not await _imports_and_cancel(): return
	if not await _playback(): return
	if not await _library_copy_and_replace(): return
	if not await _history_and_reopen(): return
	workbench.queue_free(); await process_frame; bridge.stop()
	FileAccess.open(work_root.path_join("receipts.json"), FileAccess.WRITE).store_string(JSON.stringify(receipts, "\t"))
	print("PROVIDENCE_MUSIC_AUTHORING_NATIVE_OK real-adapter slots explicit-replacement cancel library playback history save-reopen")
	quit(1 if failed else 0)


func _imports_and_cancel() -> bool:
	await _open("import", {"scope": "scenario", "kind": "music"})
	dialog.get_node("%Path").text = path; dialog.get_node("%DraftName").text = "Harbor at Dusk"
	if not await _review(): return false
	if not _check(dialog.get_node("%OutputDetails").text.contains("Exact source retained"), "exact MOD review"): return false
	dialog._cancel()
	if not _check(bridge.request("session.describe").result.revision == 0, "Cancel leaves the scenario unchanged"): return false
	await _open("import", {"scope": "scenario", "kind": "music"})
	dialog.get_node("%Path").text = path; dialog.get_node("%DraftName").text = "Harbor at Dusk"
	if not await _review(): return false
	await _accept()
	if not _check(not dialog.visible, "Import closes after acknowledgement"): return false
	var list: Dictionary = bridge.request("project-asset.list", {"kind": "music"})
	return _check(list.result.total == 1 and list.result.items[0].classicResource.resourceId == 1, "slot 1 persisted")


func _playback() -> bool:
	await panel.show_kind("music"); await panel.refresh_selection("asset:scenario-music:1")
	var music: Control = panel.get_node("%MusicAudition")
	if not _check(music.visible and music.get_node("%PlayMusic").text == "Play Music", "Music playback command is discoverable"): return false
	music.get_node("%PlayMusic").pressed.emit()
	var deadline := Time.get_ticks_msec() + 15000
	while not music.get_node("%MusicAudio").playing and Time.get_ticks_msec() < deadline: await process_frame
	if not _check(music.get_node("%MusicAudio").playing, "real adapter, decoder and native AudioStreamPlayer playback: " + music.get_node("%PlaybackStatus").text): return false
	music.get_node("%StopMusic").pressed.emit()
	if not _check(not music.get_node("%MusicAudio").playing, "Stop ends playback"): return false
	panel.get_node("%OpenPreview").pressed.emit(); await process_frame
	var preview: Window = panel.get_node("%MediaPreview")
	var nested: Control = preview.get_node("%MusicAudition")
	if not _check(preview.visible and nested.visible, "Nested Music preview owns its playback controls"): return false
	nested.get_node("%PlayMusic").pressed.emit()
	deadline = Time.get_ticks_msec() + 15000
	while not nested.get_node("%MusicAudio").playing and Time.get_ticks_msec() < deadline: await process_frame
	if not _check(nested.get_node("%MusicAudio").playing, "Nested Music window plays the selected source"): return false
	preview.cancel(); await process_frame
	if not _check(not nested.get_node("%MusicAudio").playing and panel.get_node("%OpenPreview").has_focus(), "Nested Cancel stops playback and restores focus"): return false
	await panel.refresh_selection("music-slot:3")
	if not _check(not music.visible and not panel.get_node("%Import").disabled and panel.get_node("%OpenPreview").disabled, "Empty Music slot offers Import and no audition"): return false
	await panel.refresh_selection("asset:scenario-music:1")
	return true


func _library_copy_and_replace() -> bool:
	await _open("transfer", panel.selection_context())
	if not await _review(): return false
	await _accept()
	if not _check(bridge.request("session.describe").result.revision == 1, "Add to My Library preserves scenario revision"): return false
	await workbench.show_scope("personal"); await panel.show_kind("music"); await panel._select(0)
	await _open("prepare-original", panel.selection_context())
	var allocation: Control = dialog.get_node("%MusicAllocation")
	if not _check(allocation.get_node("%ReplaceMusic").visible and dialog.get_node("%Accept").disabled, "Occupied slot requires explicit replacement"): return false
	allocation.get_node("%MusicSlot").select(1); allocation.get_node("%MusicSlot").item_selected.emit(1)
	if not await _review(): return false
	await _accept()
	if not _check(bridge.request("project-asset.list", {"kind": "music"}).result.total == 2, "Library copy explicitly allocates slot 2"): return false
	await panel._select(0); await _open("prepare-original", panel.selection_context())
	allocation = dialog.get_node("%MusicAllocation")
	allocation.get_node("%MusicSlot").select(1); allocation.get_node("%MusicSlot").item_selected.emit(1)
	allocation.get_node("%ReplaceMusic").button_pressed = true
	allocation.get_node("%MusicSlot").item_selected.emit(1)
	if not _check(allocation.get_node("%ReplaceMusic").button_pressed, "Same slot keeps explicit replacement acceptance"): return false
	if not await _review(): return false
	if not _check(dialog._prepared.params.get("replaceIdentity") == "asset:scenario-music:2", "Replacement retains the exact selected slot identity"): return false
	dialog._cancel()
	return _check(bridge.request("session.describe").result.revision == 2, "Canceled replacement preserves both slots")


func _history_and_reopen() -> bool:
	if not _check(bridge.request("history.undo", {"expectedRevision": 2}).get("ok", false), "undo copy"): return false
	if not _check(bridge.request("project-asset.list", {"kind": "music"}).result.total == 1, "undo restores slot allocation"): return false
	if not _check(bridge.request("history.redo", {"expectedRevision": 3}).get("ok", false), "redo copy"): return false
	if not _check(bridge.request("project.save", {}).get("ok", false), "Save music"): return false
	bridge.stop()
	if not _check(bridge.start_project(work_root.path_join("scenario")).get("ok", false), "reopen project"): return false
	return _check(bridge.request("project-asset.list", {"kind": "music"}).result.total == 2, "both exact music slots survive reopen")


func _open(action: String, context: Dictionary) -> void:
	await dialog.open_review(action, bridge, workbench._media_commands, context)
	dialog.get_node("%PrepareDelay").stop()


func _review() -> bool:
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	return _check(not dialog.get_node("%Accept").disabled, "review allowed: " + dialog.get_node("%Impact").text)


func _accept() -> void:
	await dialog._accept()
	await process_frame
	var deadline := Time.get_ticks_msec() + 15000
	while bridge.operation_busy() or workbench._media_commands.operations.busy:
		if Time.get_ticks_msec() > deadline: _check(false, "authoring follow-up completes"); return
		await process_frame


func _check(condition: bool, label: String) -> bool:
	receipts.append({"check": label, "passed": condition})
	if condition: return true
	failed = true; push_error(label)
	if bridge != null: bridge.stop()
	FileAccess.open(work_root.path_join("receipts.json"), FileAccess.WRITE).store_string(JSON.stringify(receipts, "\t"))
	quit(1); return false
