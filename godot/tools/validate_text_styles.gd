extends SceneTree
var _bridge := ProvidenceNativeBridge.new()
var _operations := ProvidenceEditorOperation.new()
var _failed := false
func _initialize() -> void: call_deferred("_run")
func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size()!=1 or not args[0].get_base_dir().get_file().begins_with("providence-ui-"): quit(1); return
	root.size = Vector2i(1600,900)
	root.gui_embed_subwindows = true
	root.add_child(_operations)
	var created := _bridge.create_project("text-formatting",args[0])
	if not _check(created.get("ok",false),str(created)): _finish(); return
	var dialog = preload("res://src/new_text_dialog.tscn").instantiate()
	root.add_child(dialog)
	dialog.configure_operations(_operations)
	await _create_formatted_text(dialog)
	if _failed: _finish(); return
	var edit = preload("res://src/text_resource_dialog.tscn").instantiate()
	root.add_child(edit)
	edit.configure_operations(_operations)
	await _edit_offsets(edit)
	await _verify_history(args[0])
	await _repair_invalid_text(edit,dialog)
	edit.discard_draft()
	dialog.queue_free()
	edit.queue_free()
	_finish()
func _create_formatted_text(dialog: Window) -> void:
	_check((await dialog.open_new(_bridge)).get("ok",false),"Could not open New TEXT")
	dialog.get_node("%Number").text = "-201"
	dialog.get_node("%TextName").text = "Café chronicle"
	dialog.editor.text = "Café guard\nThe moon gate opens."
	dialog.editor.text_changed.emit()
	dialog.draft_changed()
	await _settle()
	var styles = dialog.get_node("%StyleWorkbench")
	styles.editor.set_caret_line(0)
	styles.editor.set_caret_column(0)
	styles.editor.select(0,0,0,4)
	styles.get_node("%StyleBold").pressed.emit()
	styles.get_node("%StyleBold").set_pressed_no_signal(true)
	styles.get_node("%StyleBold").toggled.emit(true)
	styles.get_node("%StyleUnderline").toggled.emit(true)
	styles.get_node("%StyleColor").color_changed.emit(Color("ffbc4c"))
	styles.get_node("%ApplySelection").pressed.emit()
	await _settle()
	_check(styles.current_ranges().size()==2,"Selection formatting did not split its range")
	_check(not dialog.get_node("%Create").disabled,"Valid formatted new TEXT cannot be created")
	await dialog.create_text()
	_check(not dialog.visible,"Create did not finish")
	var state := _bridge.request("session.describe")
	_check(int(state.result.revision)==1,"Creating TEXT and formatting used more than one history entry")
func _edit_offsets(edit: Window) -> void:
	_check((await edit.open_text(_bridge,"text:-201")).get("ok",false),"Could not open created text")
	_check(edit.get_node("%StyleWorkbench").current_ranges().size()==2,"Style ranges did not persist")
	edit.editor.text = "Préface\n" + edit.editor.text
	edit.editor.text_changed.emit()
	await _settle()
	var ranges: Array = edit.get_node("%StyleWorkbench").current_ranges()
	_check(int(ranges[-1].start)==12,"Text insertion did not rebase formatting offsets")
	_check(not edit.get_node("%Apply").disabled,"Valid TEXT edit cannot Apply")
	await edit.apply_text()
	_check(not edit.visible,"TEXT Apply did not finish")
func _verify_history(project: String) -> void:
	var state := _bridge.request("session.describe")
	_check(int(state.result.revision)==2,"TEXT edit used more than one command")
	_check(_bridge.request("history.undo",{"expectedRevision":2}).get("ok",false),"Undo failed")
	var read := _bridge.request("text-resource.open",{"identity":"text:-201"})
	_check(read.result.text.begins_with("Café"),"Undo did not restore complete text")
	_check(int(read.result.styles[1].start)==4,"Undo did not restore formatting offsets")
	_check(_bridge.request("history.redo",{"expectedRevision":3}).get("ok",false),"Redo failed")
	_check(_bridge.request("project.save").get("ok",false),"Save failed")
	_check(_bridge.start_project(project).get("ok",false),"Reopen failed")
	read = _bridge.request("text-resource.open",{"identity":"text:-201"})
	_check(read.result.text.begins_with("Préface") and int(read.result.styles[-1].start)==12,"Reopen lost text or styles")
func _repair_invalid_text(edit: Window, dialog: Window) -> void:
	_check((await edit.open_text(_bridge,"text:-201")).get("ok",false),"Could not reopen native draft")
	edit.editor.text += " 🐉"
	edit.editor.text_changed.emit()
	await _settle()
	_check(edit.get_node("%Apply").disabled and edit.has_unapplied_changes(),"Invalid encoding was accepted or draft lost")
	_check(edit.get_node("%SelectCharacter").visible,"Invalid appended character has no exact repair action")
	edit.get_node("%SelectCharacter").pressed.emit()
	_check(edit.editor.get_selected_text()=="🐉","Repair selected a substring-relative character instead of the offender")
	edit.editor.text = edit.editor.text.replace("🐉","é")
	edit.editor.text_changed.emit()
	await _settle()
	_check(not edit.get_node("%Apply").disabled,"Correcting an invalid edit did not recover Apply")
	await edit.apply_text()
	_check(not edit.visible,"Repaired TEXT did not Apply")
	await dialog.open_new(_bridge)
	dialog.get_node("%Number").text = "-202"
	dialog.editor.text = "New text 🐉"
	dialog.editor.text_changed.emit()
	await _settle()
	_check(dialog.get_node("%Create").disabled,"Invalid new TEXT was accepted")
	_check(_operations.begin(_bridge,"Concurrent draft read"),"Could not hold a shared read")
	dialog.editor.text = "New text é"
	dialog.editor.text_changed.emit()
	await dialog.validate_now()
	_check(not dialog.get_node("%ValidationTimer").is_stopped(),"Busy validation consumed its retry timer")
	_operations.finish({"ok":true})
	await _settle()
	_check(not dialog.get_node("%Create").disabled,"Repairing new TEXT did not recover Create")
	await dialog.create_text()
	_check(not dialog.visible,"Repaired new TEXT did not Create")
func _settle() -> void:
	await create_timer(0.8).timeout
	while _operations.busy: await process_frame
func _check(condition: bool, message: String) -> bool:
	if not condition: _failed = true; push_error(message)
	return condition
func _finish() -> void:
	_bridge.stop()
	_operations.queue_free()
	await process_frame
	if not _failed: print("PROVIDENCE_TEXT_STYLES_OK atomic-new selection-format offset-rebase undo-redo save-reopen invalid-draft")
	quit(1 if _failed else 0)
