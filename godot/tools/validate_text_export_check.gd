extends SceneTree
class Navigation extends RefCounted:
	var strings: ProvidenceStringEditor
	func open_script_target(kind: String, id: int, _identity: String, _context: Dictionary) -> bool:
		if kind=="option-label": return (await strings.open_option_label(id)).get("ok",false)
		await strings.open_native(id)
		return strings.selected_identity()=="message:%d" % id
	func current_view() -> Control: return strings
var _bridge := ProvidenceNativeBridge.new()
var _operations := ProvidenceEditorOperation.new()
var _revision := 0
var _failed := false
var _view: Control
var _strings: ProvidenceStringEditor
func _initialize() -> void: call_deferred("_run")
func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size()!=1 or not args[0].get_base_dir().get_file().begins_with("providence-ui-"): quit(1); return
	root.size=Vector2i(1600,900)
	root.gui_embed_subwindows = true
	root.add_child(_operations)
	if not _accept(_bridge.create_project("export-check",args[0])): _finish(); return
	_accept(_bridge.request("message.create",{"expectedRevision":_revision,"nativeId":1,"text":"First\nCafé 🐉 moon 🐉"}))
	_accept(_bridge.request("message.create",{"expectedRevision":_revision,"nativeId":2,"text":"x".repeat(256)}))
	_accept(_bridge.request("text-resource.create",{"expectedRevision":_revision,"resourceId":-201,"label":"Chronicle","text":"Café guard\n".repeat(200)}))
	_strings = preload("res://src/string_editor.tscn").instantiate()
	root.add_child(_strings)
	_strings.attach_session(_bridge,func(): return {"revision":_revision},_accept,_accept,1,_operations)
	_strings.projection_applied.connect(func(projection): _revision=int(projection.revision))
	var navigation := Navigation.new()
	navigation.strings = _strings
	_view = preload("res://src/text_export_check.tscn").instantiate()
	root.add_child(_view)
	_view.configure_navigation(navigation,func(projection): _revision=int(projection.revision),func(_projection): pass)
	_view.configure_operations(_operations,func(): return _bridge)
	var before := _revision
	_check((await _view.refresh_workbench()).get("ok",false),"Could not check export")
	_check(_view.get_node("%ExportIssueTable").item_count==2 and _revision==before,"Review mutated or lost invalid strings")
	_check(_view.get_node("%ExportIssueTable").get_item_text(0).begins_with("String 1 · Replacement Risk · "),"Finding identity/status/excerpt were not separated")
	_check(_view.get_node("%IssueIdentity").text=="String 1","Finding title added decimals or an empty label separator")
	_check(_view.get_node("%IssueDetails").text.contains("Line 2, column 6"),"Exact unsupported character position is missing")
	_view.get_node("%IssueIndex").value = 2
	var location: Dictionary = _view.read_navigation_state()
	await _view.open_owner()
	_check(_strings.selected_identity()=="message:1","Repair opened wrong owner")
	var edit := _strings.find_child("MessageText",true,false) as TextEdit
	_check(edit.get_selected_text()=="🐉","Repair did not select exact unsupported character")
	_check(edit.get_selection_from_column()==12,"Second finding opened the first character instead")
	_check(await _view.restore_navigation_state(location),"Return to second finding failed")
	_check(int(_view.get_node("%IssueIndex").value)==2,"Return lost the selected second finding")
	await _view.open_owner()
	edit.text = "First\nCafé guard"
	await create_timer(0.4).timeout
	while _operations.busy: await process_frame
	await _strings.commit_selected()
	_check(_revision==before+1,"Repair did not commit once")
	_check(await _view.restore_navigation_state(location),"Return did not refresh findings")
	_check(_view.get_node("%ExportIssueTable").item_count==1,"Corrected string remained in findings")
	_view.get_node("%IncludeClean").set_pressed_no_signal(true)
	_view.get_node("%IssueFamily").select(3)
	_check((await _view.refresh_workbench()).get("ok",false),"Could not inspect TEXT")
	_check(_view.get_node("%ExportIssueTable").item_count==1 and _view.get_node("%IssueDetails").text.contains("no fixed-row limit"),"TEXT inherited the String byte limit")
	await _view.open_owner()
	var dialog = _view.get_node("%TextRepair")
	_check(dialog.visible and dialog.editor.text.length()>1000,"TEXT owner did not show complete text")
	dialog.request_cancel()
	_check(not dialog.visible and _revision==before+1,"Cancel changed TEXT")
	_view.teardown_session()
	_check(_view.get_node("%ExportIssueTable").item_count==0 and _view.get_node("%ExportSummary").text.is_empty(),"Teardown retained stale findings")
	_finish()
func _accept(response: Dictionary) -> bool:
	if response.get("ok",false): _revision=int(response.get("result",{}).get("revision",_revision))
	else: _check(false,str(response))
	return bool(response.get("ok",false))
func _check(condition: bool,message: String) -> bool:
	if not condition: _failed=true;push_error(message)
	return condition
func _finish() -> void:
	if _strings != null: _strings.teardown();_strings.free()
	if _view != null: _view.free()
	_bridge.stop()
	_operations.free()
	if not _failed: print("PROVIDENCE_TEXT_EXPORT_CHECK_OK bounded-family-limits exact-repair return-refreshed TEXT-cancel stale-clear")
	quit(1 if _failed else 0)
