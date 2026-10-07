extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var fail_method := ""
	var delayed_method := ""
	var unknown := false
	var malformed_identity := ""
	func _request(method: String, params: Dictionary = {}) -> Dictionary:
		if method==delayed_method: OS.delay_msec(1500)
		if method==fail_method: return {"ok":false,"outcomeUnknown":unknown,"error":"Controlled storage rejection. Your draft is kept."}
		var response: Dictionary=super._request(method,params)
		if method=="text-resource.open" and params.get("identity")==malformed_identity and response.get("ok",false):
			response.result.styleEditable=false;response.result.styles=[];response.result.styleError="Imported formatting table is incomplete. Preserve it; edit text only without changing its length."
		return response

const PROSE := "The lantern keeper watches the moon gate.\n\nCafé by the river. The guard raises a hand.\nFollow the old road through the valley."
var _shell
var _output := ""
var _work := ""
var _width := 1600
var _captures: Array = []
var _route := ""
var _revision := 0
func _initialize() -> void: call_deferred("_run")
func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size()!=3: quit(1);return
	_output=args[0]; _work=args[1]; _width=int(args[2])
	if not _work.get_file().begins_with("providence-ui-") or not _width in [1600,1920]: quit(1);return
	DirAccess.make_dir_recursive_absolute(_output)
	root.size=Vector2i(_width,900 if _width==1600 else 1080)
	root.content_scale_size=root.size; root.gui_embed_subwindows=true
	OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	_shell=preload("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell)
	_shell._bridge.stop(); _shell._bridge=Bridge.new(_work.path_join("settings.cfg"))
	_assert(_shell._bridge.create_project("moon-gate-chronicle",_work.path_join("project")))
	await _shell._activate_session(_shell._bridge.request("session.describe"))
	await _show("scripts.global-macros"); await _capture("empty","Fresh scenario: all five events unassigned; primary authoring enabled.")
	await _show("text.messages"); await _capture("empty","Fresh scenario: New String enabled; Option Labels hidden; no fabricated rows.")
	await _show("text.spell-check");await _capture("empty","Fresh scenario: no text findings; Refresh and filters remain available.")
	await _shell._navigation.activate_domain("assets");await _idle();_route="assets.text-resources"
	await _capture("empty","Fresh scenario: Assets owns New Text and import; no fabricated TEXT or formatting resources.")
	_seed()
	await _shell._activate_session(_shell._bridge.request("session.describe"))
	await _globals()
	await _strings()
	await _text()
	await _export_check()
	var file:=FileAccess.open(_output.path_join("capture-%d.json" % _width),FileAccess.WRITE)
	file.store_string(JSON.stringify({"viewport":[_width,root.size.y],"captures":_captures,"adapter":_shell._bridge.request("build.identity").get("result",{})},"\t"));file.close()
	_shell._close_project(); _shell.queue_free();await process_frame
	print("PROVIDENCE_STORY_TEXT_CAPTURE_OK states=",_captures.size());quit()
func _seed() -> void:
	for row in [[449,"The guard blocks your way."],[510,"Café by the moon gate."],[511,"The road leads north."],[512,"The guard opens the gate."],[513,"The lantern keeper smiles."],[514,"An inscription marks the passage."],[515,"The river crossing lies east."],[516,"The guard watches the tower."],[517,"The bell calls you home."],[518,"The guard blocks your way. 🐉"],[519,"x".repeat(256)]]:
		_assert(_shell._bridge.request("message.create",{"expectedRevision":_revision,"nativeId":row[0],"text":row[1]}))
	_assert(_shell._bridge.request("option-label.create",{"expectedRevision":_revision}))
	_assert(_shell._bridge.request("text.apply-draft",{"expectedRevision":_revision,"draft":{"family":"option-label","nativeId":0,"expectedText":"","text":"Ask the keeper"}}))
	for id in [417,418,119]:
		_assert(_shell._bridge.request("extra-action-point.create",{"expectedRevision":_revision,"nativeId":id}))
		var opened: Dictionary=_shell._bridge.request("extra-action-point.open",{"identity":"extra-action-point:%d" % id})
		_assert(opened)
		var record: Dictionary=opened.result.extraActionPoint
		record.actions=[{"slot":0,"rawOpcode":1,"targetNativeId":449},{"slot":3,"rawOpcode":9,"targetNativeId":1},{"slot":5,"rawOpcode":62,"targetNativeId":-201},{"slot":7,"rawOpcode":24,"targetNativeId":0}]
		_assert(_shell._bridge.request("extra-action-point.update",{"expectedRevision":_revision,"extraActionPoint":record}))
	_assert(_shell._bridge.request("global-macro.update-all",{"expectedRevision":_revision,"hooks":{"start":"extra-action-point:418","death":null,"quit":null,"shop":null,"temple":null}}))
	_assert(_shell._bridge.request("text-resource.create",{"expectedRevision":_revision,"resourceId":-201,"label":"The moon gate chronicle","text":PROSE,"edits":[{"kind":"replace-text","start":0,"removed":0,"text":PROSE},{"kind":"format","start":0,"end":18,"patch":{"bold":true,"color":[65535,48316,19532],"size":18}},{"kind":"format","start":41,"end":58,"patch":{"italic":true,"color":[31868,55769,44204]}}]}))
	_assert(_shell._bridge.request("project.save"))
	for number in [-202,-205]:
		_assert(_shell._bridge.request("text-resource.create",{"expectedRevision":_revision,"resourceId":number,"label":"Plain chronicle" if number==-202 else "Retained chronicle","text":PROSE}))
	_assert(_shell._bridge.request("project.save"))
func _globals() -> void:
	await _show("scripts.global-macros")
	var view=_shell._documents.view(_route)
	await _capture("populated","Five event hooks; saved Start XAP 418; complete eight-slot preview.")
	view.find_child("StartGlobalMacroHook",true,false).find_child("Choose",true,false).pressed.emit()
	await _idle(); await _capture("picker-current","Owned XAP picker reveals current target; single-click previews without changing the draft.")
	view.picker.get_node("%Search").text="119"; view.picker.get_node("%Search").text_changed.emit("119")
	await _idle();await _capture("picker-filtered","Search the complete XAP catalog; exact destination remains visible.")
	view.picker.cancel();view.set_draft_target("death",119);view.select_hook("death");await _idle()
	await _capture("dirty","Local Death assignment; saved project unchanged before one five-hook Apply.")
	view.show_failure({"error":"Controlled write rejection. All five hook drafts are kept; retry remains explicit."})
	await _capture("failure","Controlled known-write failure presented by the feature; native failure behavior has a separate receipt.")
	view.discard_draft()
	var saved: Dictionary=_shell._bridge.request("global-macro.open").result
	var missing: Dictionary=saved.duplicate(true)
	missing.hooks[0].targetNativeId=-27;missing.assignedScripts=[]
	view.set_document(missing);view.select_hook("start");await _capture("missing","Controlled imported projection: signed missing Start assignment and its unavailable preview remain explicit; no fabricated script.")
	view.set_document(saved)
func _strings() -> void:
	await _show("text.messages")
	var view=_shell._documents.view(_route)
	await view.open_native(449);await _idle()
	await _capture("populated","Complete String 449 with derived callers and sound-step destinations; no invented message sound attachment.")
	view.get_node("%OccurrenceSearch").text="guard";view.get_node("%OccurrenceSearch").text_changed.emit("guard")
	await _idle();await _capture("find-count","Saved-text match count before acceptance; Find Next disabled.")
	view.get_node("%FindFirst").pressed.emit();await _idle()
	await _capture("find-selected","First exact occurrence is highlighted in its canonical String.")
	view.set_query("keeper");await view.reload("",0,false);await _idle()
	await _capture("filtered","Bounded catalog query returns the named String.")
	view.set_query("not-in-this-scenario");await view.reload("",0,false);await _idle()
	await _capture("no-results","Editable filters retained; stale text, callers and selection cleared.")
	await view.open_native(449);view.get_node("%MessageText").text="The guard opens the moon gate.";view.get_node("%MessageText").text_changed.emit();await _idle()
	await _capture("dirty","A complete local text draft; core-derived MacRoman byte count.")
	view.request_navigation(func(): pass,"opening Extra Action Point 418 · Step 1");await _capture("departure","Owned Apply/Discard/Cancel guard retains the origin draft and names its exact destination.")
	_shell._unapplied_dialog.hide();_shell._unapplied_dialog.canceled.emit();view.discard_draft();await _idle()
	await view.open_native(518);await _idle();await _capture("invalid","Exact unsupported character feedback; Apply disabled without rewriting imported text.")
	await _string_faults(view)
	await view.open_option_label(0);await _idle();await _capture("option-labels","Conditional legacy label catalog; separate 24-byte limit and owning callers.")
	await view.open_native(449);view.get_node("%NewString").pressed.emit();await _idle()
	await _capture("new","Allocated local String draft; no command has created it yet.")
	view.discard_draft();await _idle()
	await _import_review(view)
func _string_faults(view: ProvidenceStringEditor) -> void:
	view.reset_document();_shell._bridge.delayed_method="message.list"
	view.reload();await _capture("loading","Actual initial catalog worker read; New/Import disabled until successful allocation/catalog response.")
	await _idle();_shell._bridge.delayed_method=""
	_shell._bridge.fail_method="message.list";await view.reload()
	await _capture("failure","Controlled read rejection clears details; allocation disabled; explicit Retry remains available.")
	_shell._bridge.fail_method="";await view.reload()
	await view.open_native(449);view.get_node("%MessageText").text="Unconfirmed guard draft";view.get_node("%MessageText").text_changed.emit();await _idle()
	_shell._bridge.fail_method="text.apply-draft";_shell._bridge.unknown=true
	await view.commit_selected();await _capture("uncertain","Controlled uncertain response locks the submitted draft and navigation; no automatic mutation replay.")
	_shell._bridge.fail_method="";_shell._bridge.unknown=false
	_assert(_shell._bridge.start_project(_work.path_join("project")))
	await _shell._activate_session(_shell._bridge.request("session.describe"));await _show("text.messages")
func _import_review(view: ProvidenceStringEditor) -> void:
	var path:=_work.path_join("strings.txt")
	_assert(_shell._bridge.request("text.export-file",{"path":path}))
	var text:=FileAccess.get_file_as_string(path).replace("The road leads north.","The road leads toward the moon gate.")
	var file:=FileAccess.open(path,FileAccess.WRITE);file.store_string(text);file.close()
	var review=view.get_node("%StringImportDialog")
	review._begin();await review._import_file(path);await _idle()
	await _capture("import-review","Real file review; complete current/replacement text; Cancel is nonmutating.")
	review.cancel()
	file=FileAccess.open(path,FileAccess.WRITE);file.store_string(text.replace("The guard blocks your way.","Replacement 🐉"));file.close()
	review._begin();await review._import_file(path);await _idle()
	review.get_node("%ImportChanges").item_selected.emit(0)
	await _capture("import-detail","Invalid replacement selected; complete current/replacement text and exact feedback; no mutation and Apply disabled.")
	review.cancel()
func _text() -> void:
	await _shell._navigation.activate_domain("assets");await _idle()
	_route="assets.text-resources"
	var gallery=_shell._assets.library_workbench.get_node("%Gallery")
	await gallery.refresh_selection("text:-201");await _idle()
	gallery.get_node("%EditResource").pressed.emit();await _idle()
	var dialog=gallery.get_node("%TextDialog")
	await _capture("populated","Owned TEXT window with exact signed identity, editable text and supported formatting.")
	var styles=dialog.get_node("%StyleWorkbench")
	styles.get_node("%StyleRanges").item_selected.emit(0);await _capture("range-selected","Text and formatting range highlighted; distinct Add/Edit/Remove actions.")
	dialog.editor.text=PROSE+"\nA new chapter begins.";dialog.editor.text_changed.emit();await _idle()
	await _capture("dirty","Text and style edits remain local until atomic pair Apply.")
	dialog.request_cancel();await _capture("departure","Nested TEXT draft guard; Keep Editing is the default focus.")
	dialog.get_node("%Discard").hide();dialog.get_node("%Discard").canceled.emit()
	dialog.editor.text+=" 🐉";dialog.editor.text_changed.emit();await _idle()
	dialog.get_node("%SelectCharacter").pressed.emit();await _capture("invalid","Core reports the exact unsupported character; local preview names its last valid state.")
	dialog.discard_draft()
	var workbench=_shell._assets.library_workbench
	workbench.get_node("%NewText").pressed.emit();await _idle()
	var new_text=workbench.get_node("%NewTextDialog")
	await new_text.validate_now()
	await _capture("new","New TEXT starts with no fabricated formatting; fixed Create/Cancel footer remains visible.")
	new_text.get_node("%Number").text="-204";new_text.editor.text=PROSE;new_text.editor.text_changed.emit();new_text.draft_changed();await _idle()
	await new_text.validate_now();await _idle()
	_assert({"ok":not new_text.get_node("%Create").disabled and not new_text.get_node("%Availability").text.contains("Checking")})
	await _capture("new-valid","Signed allocation and complete text validated; enabled Create commits once.")
	new_text.discard_draft()
	await _text_recovery(dialog)
	await dialog.open_text(_shell._bridge,"text:-202");await _capture("plain","Real plain TEXT: no style companion manufactured; explicit selection formatting remains available.");dialog.discard_draft()
	_shell._bridge.malformed_identity="text:-205"
	await dialog.open_text(_shell._bridge,"text:-205");await _capture("malformed","Controlled malformed-companion projection; formatting controls disabled and exact preservation explanation visible. Core/adapter malformed fixture has separate receipts.")
	dialog.discard_draft();_shell._bridge.malformed_identity=""
func _text_recovery(dialog: Window) -> void:
	await dialog.open_text(_shell._bridge,"text:-201")
	dialog.editor.text+=" Retained local chapter.";dialog.editor.text_changed.emit();await _idle()
	var read: Dictionary=_shell._bridge.request("text-resource.open",{"identity":"text:-201"})
	var response: Dictionary=_shell._bridge.request("text-resource.apply-styles",{"expectedRevision":int(read.result.revision),"identity":"text:-201","edits":[{"kind":"replace-text","start":0,"removed":0,"text":"Saved preface. "}]})
	_assert(response);await dialog.apply_text();await dialog.review_current();await _idle()
	await _capture("conflict","Real changed-revision rejection; full saved/current comparison retains the local draft without retrying Apply.")
	dialog.discard_draft()
func _export_check() -> void:
	await _show("text.spell-check")
	var view=_shell._documents.view(_route)
	await view.refresh_workbench();await _idle();view.get_node("%ExportIssueTable").item_selected.emit(0)
	await _capture("populated","Real Classic encoding findings with exact character position and owning-field repair.")
	view.get_node("%IssueSearch").text="guard";await view.refresh_workbench();await _idle()
	await _capture("filtered","Complete-text query narrows actual findings; selected exact owner and character remain coherent.")
	view.get_node("%IssueSearch").text=""
	view.get_node("%IncludeClean").set_pressed_no_signal(true);view.get_node("%IssueFamily").select(3)
	await view.refresh_workbench();await _idle();view.get_node("%ExportIssueTable").item_selected.emit(0)
	await _capture("text-family","Scrolling TEXT uses its own geometry; no message-sized 255-byte refusal.")
	await view.open_owner();await _idle();await _capture("nested-text-repair","Exact owning TEXT draft opens as a modal owned window.")
	view.get_node("%TextRepair").request_cancel()
	view.get_node("%IssueSearch").text="absent-text";await view.refresh_workbench();await _idle()
	await _capture("no-results","No matches; summary and current filters remain truthful; details clear.")
	view.get_node("%IssueSearch").text=""
	_shell._bridge.fail_method="text.export-check";await view.refresh_workbench()
	await _capture("failure","Controlled read failure clears all prior findings and summary; Refresh retries the read.")
	_shell._bridge.fail_method="";_shell._bridge.delayed_method="text.export-check"
	view.refresh_workbench();await _capture("loading","Actual pending worker read; stale details/counts clear and global operation lock is active.")
	await _idle();_shell._bridge.delayed_method=""
	await _export_pages(view)
func _export_pages(view: Control) -> void:
	var revision: int=_shell._bridge.request("session.describe").result.revision
	for number in range(1000,1066):
		var response: Dictionary=_shell._bridge.request("message.create",{"expectedRevision":revision,"nativeId":number,"text":"Controlled encoding fixture 🐉"})
		_assert(response);revision=int(response.result.revision)
	view.get_node("%IssueSearch").text="";view.get_node("%IssueFamily").select(1);view.get_node("%IncludeClean").set_pressed_no_signal(false)
	await view.refresh_workbench();await _idle()
	await _capture("paged","Real 68-finding catalog; bounded 64-row page and truthful Next availability.")
func _show(route: String) -> void:
	_route=route
	await _shell._navigation.select_route(route);await _idle()
func _capture(state: String,evidence: String) -> void:
	await process_frame;await process_frame;await RenderingServer.frame_post_draw
	_check_command_state(state)
	var name: String=_route.replace(".","-")+"-"+state+"-%d.png" % _width
	_assert({"ok":root.get_texture().get_image().save_png(_output.path_join(name))==OK})
	_captures.append({"route":_route,"state":state,"path":name,"viewport":[_width,root.size.y],"evidence":evidence})
func _check_command_state(state: String) -> void:
	var bar = _shell._command_bar
	if state == "loading":
		_assert({"ok":_shell._operations.busy and bar.search_button.disabled and bar.get_node("Save").disabled and bar.get_node("Validate").disabled and bar.get_node("Compile").disabled})
	if state == "failure" and _route == "text.spell-check":
		_assert({"ok":not _shell._status.text.contains("in progress")})
	if _route == "scripts.global-macros" and state in ["empty","populated","dirty"]:
		_assert({"ok":bar.commit_button.disabled == (state != "dirty")})
func _idle() -> void:
	await create_timer(0.55).timeout
	var deadline := Time.get_ticks_msec()+15000
	while Time.get_ticks_msec()<deadline:
		await process_frame
		if not _shell._operations.busy and not _shell._bridge.operation_busy(): return
	push_error("Native capture exceeded its bounded wait");quit(1)
func _assert(response: Dictionary) -> void:
	if not response.get("ok",false): push_error(str(response));quit(1)
	_revision=int(response.get("result",{}).get("revision",_revision))
