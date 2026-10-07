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
var work_root := ""
var scenario_path := ""
var source_path := ""
var reverse_path := ""
var text_path := ""
var sound_path := ""
var failed := false
var receipts: Array = []


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(not args.is_empty(), "fixture root required"): return
	root.gui_embed_subwindows = true
	root.size = Vector2i(1920, 1080)
	work_root = args[0]
	DirAccess.make_dir_recursive_absolute(work_root)
	_create_sources()
	bridge = IsolatedBridge.new(work_root.path_join("settings.cfg"))
	bridge.personal_root = work_root.path_join("personal-assets")
	scenario_path = work_root.path_join("scenario")
	var created: Dictionary = bridge.create_project("media-authoring", scenario_path)
	if not _check(created.get("ok", false), "create real project: " + str(created)): return
	workbench = load("res://src/unified_assets_editor.tscn").instantiate()
	root.add_child(workbench)
	workbench.size = Vector2(1800, 960)
	await workbench.reload(bridge)
	panel = workbench.get_node("%Gallery")
	dialog = workbench.get_node("%MediaDialog")
	await _scenario_imports()
	if failed: return
	await preload("res://tools/media_import_review_checks.gd").run(dialog, bridge, workbench._media_commands, [source_path, sound_path, text_path], _check)
	if failed: return
	await _library_journey()
	if failed: return
	await _reverse_metadata()
	if failed: return
	await _replacement_and_history()
	if failed: return
	await _audio_output_controls()
	if failed: return
	await _text_journey()
	if failed: return
	await _paging_and_recovery()
	if failed: return
	if not _check(bridge.request("project.save", {}).get("ok", false), "explicit Save acknowledged"): return
	bridge.stop()
	if not _check(bridge.start_project(scenario_path).get("ok", false), "reopen real project"): return
	var listed: Dictionary = bridge.request("project-asset.list", {"limit": 128})
	if not _check(listed.get("result", {}).get("total", 0) >= 7, "media persists on reopen"): return
	workbench.queue_free()
	await process_frame
	bridge.stop()
	var receipt := FileAccess.open(work_root.path_join("receipts.json"), FileAccess.WRITE)
	receipt.store_string(JSON.stringify(receipts, "\t"))
	print("PROVIDENCE_MEDIA_AUTHORING_NATIVE_OK families=6 draft-history-library-copy-text-reopen-recovery")
	quit()


func _check(condition: bool, label: String) -> bool:
	if condition:
		receipts.append({"check": label, "passed": true})
		return true
	failed = true
	push_error("MEDIA_AUTHORING_FAILED " + label)
	if bridge != null: bridge.stop()
	quit(1)
	return false


func _create_sources() -> void:
	source_path = work_root.path_join("front.png")
	reverse_path = work_root.path_join("reverse.png")
	var image := Image.create(64, 64, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.8, 0.1, 0.2, 0.6))
	image.save_png(source_path)
	image.fill(Color(0.1, 0.5, 0.9, 0.8))
	image.save_png(reverse_path)
	text_path = work_root.path_join("scroll.txt")
	FileAccess.open(text_path, FileAccess.WRITE).store_string("Vixies welcome the party.\n".repeat(60))
	sound_path = work_root.path_join("voice.wav")
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = 11025
	var pcm := PackedByteArray()
	for _index in 100: pcm.append_array(PackedByteArray([0, 15, 30, 15, 0, 241, 226, 241]))
	wav.data = pcm
	wav.save_to_wav(sound_path)


func _open(action: String, context: Dictionary) -> void:
	await dialog.open_review(action, bridge, workbench._media_commands, context)
	dialog.get_node("%PrepareDelay").stop()


func _review() -> bool:
	dialog.get_node("%PrepareDelay").stop()
	await dialog._prepare()
	return _check(not dialog.get_node("%Accept").disabled, "review accepts: " + dialog.get_node("%Impact").text)


func _accept(interaction := "direct") -> void:
	for frame in 4: await process_frame
	if interaction == "mouse":
		var button: Button = dialog.get_node("%Accept")
		var motion := InputEventMouseMotion.new()
		motion.position = Vector2(dialog.position) + button.get_global_rect().get_center(); motion.global_position = motion.position
		root.push_input(motion, true)
		for down in [true, false]:
			var click := InputEventMouseButton.new()
			click.button_index = MOUSE_BUTTON_LEFT; click.pressed = down
			click.position = Vector2(dialog.position) + button.get_global_rect().get_center()
			click.global_position = click.position
			root.push_input(click, true)
	elif interaction == "keyboard":
		dialog.get_node("%Accept").grab_focus()
		for down in [true, false]:
			var key := InputEventKey.new()
			key.keycode = KEY_SPACE; key.pressed = down
			root.push_input(key, true)
	else:
		dialog._accept()
		if not _check(not dialog.get_node("%DraftName").editable and dialog.get_node("%Family").disabled, "submitted draft controls stay locked while awaiting acknowledgement"): return
	for frame in 300:
		await process_frame
		if not dialog.visible and not bridge.operation_busy(): return
	_check(false, "review acceptance completes through " + interaction + " rect=" + str(dialog.get_node("%Accept").get_global_rect()) + " window=" + str(dialog.size) + " impact=" + dialog.get_node("%Impact").text)


func _scenario_imports() -> void:
	await workbench.show_scope("scenario")
	for entry in [["picture", 30000, source_path], ["icon", 30001, source_path], ["special-land-tile", -1000, source_path], ["sound", 200, sound_path], ["combat-icon", 1000, source_path]]:
		await _open("import", {"scope": "scenario", "kind": entry[0]})
		dialog.get_node("%Path").text = entry[2]
		dialog.get_node("%DraftName").text = "Authored " + entry[0]
		dialog.get_node("%Number").value = entry[1]
		if entry[0] == "combat-icon":
			dialog.get_node("%ReversePath").text = reverse_path
			dialog.get_node("%Canvas").select(3)
		if not await _review(): return
		if entry[0] == "combat-icon" and not _check(dialog.get_node("%IncomingReverse").visible, "paired proposed reverse preview"): return
		await _accept("mouse" if entry[0] == "picture" else "keyboard" if entry[0] == "icon" else "direct")
		if failed: return
		if not _check(not dialog.visible, "import closes only after committed acknowledgement"): return
	var state: Dictionary = bridge.request("project-asset.list", {"limit": 128})
	_check(state.get("result", {}).get("total") == 6, "five families and paired artwork create six exact resources")


func _library_journey() -> void:
	await workbench.show_scope("personal")
	await _open("import", {"scope": "personal", "kind": "picture"})
	dialog.get_node("%Path").text = source_path
	dialog.get_node("%DraftName").text = "Original Ruby"
	dialog.get_node("%OutputMode").select(1)
	if not await _review(): return
	await _accept()
	await panel.reload(bridge)
	await panel._select(0)
	if not _check(panel.get_node("%Preview").texture != null, "personal original preview"): return
	await _open("organize", panel.selection_context())
	if not _check(dialog.get_node("%Accept").disabled, "same library name and collection is a no-op"): return
	dialog.get_node("%DraftName").text = "Renamed Ruby"
	if not await _review(): return
	await _accept()
	await panel._select(0)
	await _open("prepare-original", panel.selection_context())
	dialog.get_node("%Number").value = 30002
	if not await _review(): return
	await _accept()
	if not _check(bridge.request("project-asset.list", {}).result.total == 7, "prepare stored original and copy into scenario"): return
	await workbench._library_history("undo")
	var after_undo: Dictionary = bridge.request("personal-library.list", {})
	if not _check(after_undo.result.items[0].name == "Original Ruby", "independent library undo: " + str(after_undo) + " / " + workbench.get_node("%WorkspaceStatus").text): return
	if not _check(bridge.request("project-asset.list", {}).result.total == 7, "library undo preserves scenario copy"): return
	await workbench._library_history("redo")
	_check(bridge.request("personal-library.list", {}).result.items[0].name == "Renamed Ruby", "independent library redo")


func _replacement_and_history() -> void:
	await workbench.show_scope("scenario")
	await panel.refresh_selection("combat-icon:1000")
	await _open("replace", panel.selection_context())
	if not _check(dialog.get_node("%CurrentReverse").visible and dialog.get_node("%ReverseRow").visible, "replacement previews both exact retained appearances"): return
	var baseline: PackedByteArray = dialog.get_node("%Current").texture.get_image().get_data()
	dialog.get_node("%Path").text = reverse_path
	dialog.get_node("%ReversePath").text = source_path
	if not await _review(): return
	if not _check(dialog.get_node("%Current").texture.get_image().get_data() == baseline, "review preserves current artwork baseline"): return
	var revision: int = bridge.request("session.describe").result.revision
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE; escape.pressed = true
	dialog.push_input(escape)
	await process_frame
	if not _check(not dialog.visible and panel.get_viewport().gui_get_focus_owner() == panel.get_node("%Gallery"), "Escape cancels and restores originating gallery focus: visible=%s focus=%s" % [dialog.visible, panel.get_viewport().gui_get_focus_owner()]): return
	if not _check(bridge.request("session.describe").result.revision == revision, "cancel reviewed replacement preserves scenario"): return
	await _open("replace", panel.selection_context())
	dialog.get_node("%Path").text = reverse_path
	dialog.get_node("%ReversePath").text = source_path
	if not await _review(): return
	await _accept()
	if not _check(bridge.request("session.describe").result.revision == revision + 1, "pair replacement is one atomic history entry"): return
	if not _check(bridge.request("history.undo", {"expectedRevision": revision + 1}).get("ok", false), "project undo paired replacement"): return
	if not _check(bridge.request("history.redo", {"expectedRevision": revision + 2}).get("ok", false), "project redo paired replacement"): return
	await workbench.refresh_after_history(bridge)


func _reverse_metadata() -> void:
	await workbench.show_scope("scenario")
	await panel.refresh_selection("combat-icon:1308")
	await _open("edit", panel.selection_context())
	if not _check(dialog._base.identity == "combat-icon:1308" and int(dialog.get_node("%Number").value) == 1308, "reverse metadata retains selected identity"): return
	dialog.get_node("%DraftName").text = "Reverse guardian"
	if not await _review(): return
	await _accept()
	var front: Dictionary = bridge.request("project-asset.open", {"identity":"combat-icon:1000"})
	var reverse: Dictionary = bridge.request("project-asset.open", {"identity":"combat-icon:1308"})
	_check(front.result.asset.label == "Authored combat-icon" and reverse.result.asset.label == "Reverse guardian", "reverse rename preserves base metadata")


func _audio_output_controls() -> void:
	await _open("import", {"scope":"scenario","kind":"sound"})
	dialog.get_node("%Path").text = sound_path; dialog.get_node("%DraftName").text = "Prepared sound"
	dialog.get_node("%Number").value = 201
	if not await _review(): return
	dialog.get_node("%Play").pressed.emit()
	if not _check(dialog.get_node("%Audio").playing and dialog.get_node("%Play").text == "Stop output", "prepared sound Play exposes Stop"): return
	dialog.get_node("%Play").pressed.emit()
	if not _check(not dialog.get_node("%Audio").playing, "prepared sound Stop halts playback"): return
	dialog.get_node("%Family").select(0); dialog._changed(); dialog.get_node("%PrepareDelay").stop()
	if not _check(dialog.get_node("%Audio").stream == null and not dialog.get_node("%Play").visible, "changing family invalidates prepared playback"): return
	dialog._cancel()
	await _open("import", {"scope":"scenario","kind":"sound"})
	dialog.get_node("%Path").text = source_path; dialog.get_node("%DraftName").text = "Invalid sound"
	dialog.get_node("%PrepareDelay").stop(); await dialog._prepare()
	_check(dialog.get_node("%Accept").disabled and dialog.get_node("%Audio").stream == null and not dialog.get_node("%Play").visible, "invalid source and reopened context cannot play stale output")
	dialog._cancel()


func _text_journey() -> void:
	await workbench.show_scope("scenario")
	await _open("import", {"scope": "scenario", "kind": "text-resource"})
	dialog.get_node("%Path").text = text_path
	dialog.get_node("%DraftName").text = "Command of the Vixies"
	dialog.get_node("%Number").value = -32768
	if not await _review(): return
	if not _check(dialog.get_node("%Text").text.length() > 1400, "complete scrolling TEXT draft beyond preview length"): return
	dialog.get_node("%Text").text += " Unsupported: 🐉"
	dialog._changed()
	dialog.get_node("%PrepareDelay").stop()
	await dialog._prepare()
	if not _check(dialog.get_node("%Accept").disabled, "unrepresentable MacRoman text blocks acceptance"): return
	dialog.get_node("%Text").text = "Corrected full TEXT.\n".repeat(80)
	dialog._changed()
	if not await _review(): return
	await _accept()
	var opened: Dictionary = bridge.request("text-resource.open", {"identity": "text-resource:-32768"})
	_check(opened.get("ok", false) and opened.result.text == "Corrected full TEXT.\n".repeat(80), "signed TEXT identity and exact edited content")


func _paging_and_recovery() -> void:
	await workbench.show_scope("scenario")
	await panel.show_kind("picture")
	panel.get_node("%Search").text = "No such picture"
	await panel.reload(bridge)
	if not _check(panel.get_node("%Gallery").item_count == 0 and panel.get_node("%Preview").texture == null, "no results clears stale inspector"): return
	panel.get_node("%Search").text = ""
	await panel.reload(bridge)
	var response: Dictionary = bridge.request("media.recovery.read", {"method": "media.metadata.apply", "params": {}})
	if not _check(not response.get("ok", false), "recovery browsing rejects mutations"): return
	response = bridge.request("media.recovery.read", {"method": "project-asset.list", "params": {"limit": 1}})
	if not _check(response.get("ok", false) and response.result.items.size() == 1, "recovery read remains bounded"): return
	workbench._operations.requires_reopen = true
	await panel.reload(bridge)
	if not _check(panel.get_node("%Gallery").item_count > 0 and workbench._operations.requires_reopen, "uncertain outcome permits browsing without unlocking mutations"): return
	workbench._operations.requires_reopen = false
