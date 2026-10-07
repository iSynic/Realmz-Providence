extends SceneTree

var _bridge := ProvidenceNativeBridge.new()
var _operations := ProvidenceEditorOperation.new()
var _view: ProvidenceStringEditor
var _revision := 0
var _failed := false

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_base_dir().get_file().begins_with("providence-ui-"):
		quit(1); return
	root.size = Vector2i(1600,900)
	root.gui_embed_subwindows = true
	root.add_child(_operations)
	_view = preload("res://src/string_editor.tscn").instantiate()
	root.add_child(_view)
	var created := _bridge.create_project("string-authoring",args[0])
	if not _check(created.get("ok",false),str(created)): _finish(); return
	_accept(_bridge.request("message.create",{"expectedRevision":_revision,"nativeId":7,"text":"Original guard"}))
	_accept(_bridge.request("option-label.create",{"expectedRevision":_revision}))
	_view.attach_session(_bridge,func(): return {"revision":_revision},_accept,_accept,1,_operations)
	_view.projection_applied.connect(_projection)
	if not _check(await _view.reload(),"Could not load Strings"): _finish(); return
	await _new_and_duplicate()
	await _catalog_keyboard()
	await _search_and_return()
	await _option_labels()
	await _import_review(args[0].get_base_dir())
	_accept(_bridge.request("project.save",{}))
	var opened := _bridge.start_project(args[0])
	_check(opened.get("ok",false),"Save/reopen failed")
	_revision = int(opened.get("result",{}).get("revision",_revision))
	_view.attach_session(_bridge,func(): return {"revision":_revision},_accept,_accept,3,_operations)
	await _view.open_native(1)
	_check(_view.draft_text() == "Imported guard","Imported string did not persist")
	_finish()

func _new_and_duplicate() -> void:
	var revision := _revision
	(_view.find_child("NewString",true,false) as Button).pressed.emit()
	await _settle()
	_check(_view.is_new() and _revision == revision,"New mutated before Apply")
	_view.discard_draft()
	await _settle()
	_check(not _view.is_new() and _revision == revision,"Discard created a string")
	(_view.find_child("NewString",true,false) as Button).pressed.emit()
	await _settle()
	var edit := _view.find_child("MessageText",true,false) as TextEdit
	edit.text = "Café guard"
	await _settle()
	_check(not (_view.find_child("ApplyString",true,false) as Button).disabled,"MacRoman draft was not accepted")
	await _view.commit_selected()
	_check(_revision == revision+1 and not _view.has_unapplied_changes(),"New was not one atomic Apply")
	(_view.find_child("DuplicateString",true,false) as Button).pressed.emit()
	await _settle()
	_check(_view.is_new() and _view.draft_text() == "Café guard" and _revision == revision+1,"Duplicate mutated before Apply")
	await _view.commit_selected()
	_check(_view.selected_identity() == "message:1","Duplicate allocated the wrong ID")
	edit.text = "Unrepresentable 🐉"
	await _settle()
	_check((_view.find_child("ApplyString",true,false) as Button).disabled,"Encoding risk left Apply enabled")
	await _view.commit_selected()
	_check(_view.has_unapplied_changes() and _revision == revision+2,"Invalid text partially applied")
	_view.discard_draft()
	await _settle()

func _search_and_return() -> void:
	var find := _view.find_child("OccurrenceSearch",true,false) as LineEdit
	find.text = "GUARD"
	find.text_changed.emit(find.text)
	await _settle()
	_check((_view.find_child("OccurrenceStatus",true,false) as Label).text.contains("3 occurrences"),"Find did not preview its match count")
	_check((_view.find_child("FindNext",true,false) as Button).disabled,"Find Next was enabled before accepting a match")
	(_view.find_child("FindFirst",true,false) as Button).pressed.emit()
	await _settle()
	_check(_view.selected_identity() == "message:0","Find First did not search native record order")
	var edit := _view.find_child("MessageText",true,false) as TextEdit
	_check(edit.get_selected_text() == "guard","Find did not highlight exact text")
	(_view.find_child("FindNext",true,false) as Button).pressed.emit()
	await _settle()
	_check(_view.selected_identity() == "message:1","Find Next repeated the first hit")
	var state := _view.read_navigation_state()
	await _view.open_native(7)
	_check(await _view.restore_navigation_state(state),"Linked return failed")
	_check(_view.selected_identity() == "message:1" and edit.has_focus(),"Linked return lost selection or focus")
	var filter := _view.find_child("MessageSearch",true,false) as LineEdit
	filter.text = "no matching text"
	filter.text_changed.emit(filter.text)
	await _settle()
	_check(_view.selected_identity().is_empty() and _view.used_by().is_empty(),"Empty results retained stale details")
	for _frame in 60:
		if (_view.find_child("OccurrenceStatus",true,false) as Label).text.contains("3 occurrences"): break
		await create_timer(0.02).timeout
	_check(not (_view.find_child("FindFirst",true,false) as Button).disabled,"Empty browser filter disabled complete-catalog occurrence search")
	_check((_view.find_child("OccurrenceStatus",true,false) as Label).text.contains("3 occurrences"),"Empty browser filter lost the saved-text occurrence count")
	filter.text = "Café"
	filter.text_changed.emit(filter.text)
	await _settle()
	_check(_view.total_messages() == 2,"Filter did not find MacRoman aliases")
	await _view.open_native(1)

func _option_labels() -> void:
	_check((await _view.open_option_label(0)).get("ok",false),"Could not open Option Labels")
	var edit := _view.find_child("MessageText",true,false) as TextEdit
	edit.text = "Leave café"
	await _settle()
	await _view.commit_selected()
	var before := _revision
	(_view.find_child("NewString",true,false) as Button).pressed.emit()
	await _settle()
	_check(_view.is_new() and _revision == before,"New label mutated before Apply")
	edit.text = "Stay"
	await _settle()
	await _view.commit_selected()
	_check(_revision == before+1,"New label required multiple commands")
	await _view.open_native(1)

func _import_review(root_path: String) -> void:
	var path := root_path.path_join("Strings.txt")
	var separator := "                    " + char(0xf8ff) + "                    "
	var file := FileAccess.open(path,FileAccess.WRITE)
	file.store_string(separator.join(["Café guard","Imported guard","Original guard"]))
	file.close()
	var dialog := _view.get_node("%StringImportDialog") as Window
	var revision := _revision
	dialog.choose_import()
	(dialog.find_child("ImportFile",true,false) as FileDialog).hide()
	(dialog.find_child("ImportFile",true,false) as FileDialog).file_selected.emit(path)
	await _settle()
	_check(dialog.visible and not (dialog.find_child("ApplyImport",true,false) as Button).disabled,"Import review did not enable valid changes")
	_check((dialog.find_child("ImportCurrent",true,false) as TextEdit).text == "Café guard","Inspection did not show complete original text")
	dialog.cancel()
	_check(_revision == revision,"Cancel applied imported text")
	dialog.choose_import()
	(dialog.find_child("ImportFile",true,false) as FileDialog).hide()
	(dialog.find_child("ImportFile",true,false) as FileDialog).file_selected.emit(path)
	await _settle()
	(dialog.find_child("ApplyImport",true,false) as Button).pressed.emit()
	await _settle()
	_check(not dialog.visible and _revision == revision+1,"Import did not apply exactly once")
	_accept(_bridge.request("history.undo",{"expectedRevision":_revision}))
	await _view.refresh_workbench()
	await _view.open_native(1)
	_check(_view.draft_text() == "Café guard","Undo did not restore imported row")
	_accept(_bridge.request("history.redo",{"expectedRevision":_revision}))
	await _view.refresh_workbench()
	_check(_view.draft_text() == "Imported guard","Redo did not restore imported row")

func _settle() -> void:
	await create_timer(0.35).timeout
	while _operations.busy: await process_frame
	await process_frame

func _accept(response: Dictionary) -> bool:
	if response.get("ok",false): _revision = int(response.get("result",{}).get("revision",_revision))
	return bool(response.get("ok",false))

func _projection(projection: Dictionary) -> void:
	_revision = int(projection.get("revision",_revision))

func _check(condition: bool, message: String) -> bool:
	if not condition: _failed = true; push_error("PROVIDENCE_STRING_AUTHORING_FAILED " + message)
	return condition

func _finish() -> void:
	_view.teardown()
	_bridge.stop()
	_view.free()
	_operations.free()
	if not _failed: print("PROVIDENCE_STRING_AUTHORING_OK local-new duplicate strict-encoding native-find highlight empty-filter return-focus option-label atomic-import cancel undo-redo save-reopen")
	quit(1 if _failed else 0)

func _catalog_keyboard() -> void:
	var catalog = _view.get_node("%MessageCollection")
	var target: String = _view.row_at(0).identity
	var revision := _revision
	catalog.select(1)
	var event := InputEventKey.new();event.pressed=true;event.keycode=KEY_UP
	catalog._keyboard(event)
	await _settle()
	_check(_view.selected_identity()==target and _revision==revision,"Catalog keyboard selection changed canonical state or opened the wrong String")
	_check(catalog.get_node("%Rows").get_child(0).get_node("Inset/Lines/Context").text.contains("characters"),"Catalog omitted its visible secondary context")
	await _view.reload()
	_check(catalog.item_count > 1,"Catalog reload did not restore selectable records")
	if catalog.item_count < 2: return
	target = _view.row_at(1).identity
	catalog.get_node("%Rows").get_child(1).pressed.emit()
	await _settle()
	_check(_view.selected_identity()==target and _revision==revision,"Catalog pointer selection changed state or opened the wrong String")
