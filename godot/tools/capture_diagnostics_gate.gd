extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var fail_method := ""
	var delayed_method := ""
	var fault := ""
	var repair_attempts := 0
	func _request(method: String, params: Dictionary = {}) -> Dictionary:
		if method==delayed_method: OS.delay_msec(1200)
		if method==fail_method: return {"ok":false,"error":"Controlled read rejection. Refresh explicitly retries this read."}
		if method=="action-settings.commit-repair":
			repair_attempts+=1
			if fault=="lost-before":
				fault=""
				return {"ok":false,"outcomeUnknown":true,"error":"Controlled lost reply before mutation"}
		return super._request(method,params)

var _shell
var _output := ""
var _work := ""
var _width := 1600
var _route := ""
var _captures: Array = []

func _initialize() -> void: call_deferred("_run")
func _run() -> void:
	var args:=OS.get_cmdline_user_args()
	if args.size()!=3: quit(1); return
	_output=args[0]; _work=args[1]; _width=int(args[2])
	if not _work.get_file().begins_with("providence-ui-"): quit(1); return
	root.size=Vector2i(_width,900 if _width==1600 else 1080)
	root.content_scale_size=root.size; root.gui_embed_subwindows=true
	OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	_shell=preload("res://src/editor_shell.tscn").instantiate(); root.add_child(_shell)
	await _idle()
	_shell._bridge.stop(); _shell._bridge=Bridge.new(_work.path_join("settings.cfg"))
	_assert(_shell._bridge.create_project("diagnostics-fresh",_work.path_join("project")))
	await _shell._activate_session(_shell._bridge.request("session.describe"))
	for route in ["linter.issues","records.decoded-records","records.evidence"]:
		await _show(route)
		if route=="linter.issues":
			for name in ["FindUses","OpenRecords","OpenEvidence"]: _assert({"ok":_shell._issues.workbench.get_node("%"+name).disabled})
		await _capture("fresh","Real fresh authored project; no fabricated imported annex or fixed records.")
	_assert(_shell._bridge.start_demo())
	var revision:int=_shell._bridge.request("session.describe").result.revision
	_assert(_shell._bridge.request("extra-action-point.create",{"expectedRevision":revision,"nativeId":31000}))
	var opened:Dictionary=_shell._bridge.request("extra-action-point.open",{"identity":"extra-action-point:31000"})
	var record:Dictionary=opened.result.extraActionPoint
	record.actions=[{"slot":4,"rawOpcode":1,"targetNativeId":30000},{"slot":5,"rawOpcode":1,"targetNativeId":30001}]
	_assert(_shell._bridge.request("extra-action-point.update",{"expectedRevision":int(_shell._bridge.request("session.describe").result.revision),"extraActionPoint":record}))
	await _shell._activate_session(_shell._bridge.request("session.describe"))
	await _issues(); await _records()
	_route="linter.issues"
	await preload("res://tools/capture_diagnostics_recovery.gd").new().run(_shell,_work,_capture,_idle)
	await _import_scenario("City of Bywater"); await _evidence(); await _import_scenario("Half Truth"); await _import_navigation(); await _preserved_source()
	var file:=FileAccess.open(_output.path_join("capture-%d.json" % _width),FileAccess.WRITE)
	file.store_string(JSON.stringify({"viewport":[_width,root.size.y],"captures":_captures,"adapter":_shell._bridge.request("build.identity").get("result",{})},"\t"));file.close()
	_shell._close_project(); _shell.queue_free(); await process_frame
	print("PROVIDENCE_DIAGNOSTICS_CAPTURE_OK states=",_captures.size());quit()

func _issues() -> void:
	await _show("linter.issues")
	var view=_shell._issues.workbench
	await _capture("populated","Real core findings; bounded All Groups page and exact authoring destinations.")
	view.state.set_filters("extra-action-point:31000","error");await _idle()
	await _capture("filtered","Real missing-message references in XAP 31000, Steps 5 and 6.")
	view.state.set_filters("absent-diagnostic-query");await _idle();await _capture("no-results","Query retained; stale details and actions cleared.")
	view.state.set_filters("extra-action-point:31000","error");await _idle()
	view._open_finding(view.state.selected_finding());await _idle()
	_route="linter.issues";await _capture("owning-step","Real exact source authoring navigation into XAP 31000 Step 5; Back to Issues retained.")
	var editor=_shell._documents.view("scripts.macros")
	editor._semantic_steps._field_renderer.accept_target("targetNativeId",29999);await _idle()
	_shell._issues.request_show();await _capture("departure","Real local authoring draft; Apply and Open, Discard and Open, or Cancel retain an explicit destination.")
	_shell._issues.guard.get_cancel_button().pressed.emit();await _idle()
	_shell._issues.request_show();_shell._issues.guard.custom_action.emit(&"discard");await _idle()
	await _nested()
	_shell._issues.request_show();await _idle()
	_shell._bridge.delayed_method="validation.begin";view.state.refresh();await _capture("loading","Real validation worker; previous finding actions clear while the check is pending.")
	await _idle();_shell._bridge.delayed_method=""
	_shell._bridge.fail_method="validation.begin";view.state.refresh();await _idle();await _capture("failure","Controlled validation read rejection; Check Again remains explicit.")
	_shell._bridge.fail_method="";view.state.refresh();await _idle()

func _nested() -> void:
	var opened:Dictionary=_shell._bridge.request("encounter.open-simple",{"identity":"simple-encounter:3"})
	var record:Dictionary=opened.result.encounter
	record.actions[0].targetNativeId=30003
	_assert(_shell._bridge.request("encounter.update-simple",{"expectedRevision":int(_shell._bridge.request("session.describe").result.revision),"encounter":record}))
	await _shell._activate_session(_shell._bridge.request("session.describe"));await _idle()
	_shell._issues.request_show();await _idle()
	var view=_shell._issues.workbench
	view.state.set_filters("simple-encounter:3","error");await _idle()
	view.get_node("%OpenFinding").pressed.emit();await _idle()
	var editor=_shell._documents.view("encounters.simple")
	_assert({"ok":editor._step_dialog.visible})
	await _capture("nested","Real finding opens its exact Simple Encounter result-step window with native modal ownership.")
	editor._step_dialog.cancel();await _idle()
	var created:Dictionary=_shell._bridge.request("encounter.create-complex",{"expectedRevision":int(_shell._bridge.request("session.describe").result.revision)})
	_assert(created);record=created.result.document.encounter
	var identity:String=record.identity
	record.actions=[{"slot":11,"rawOpcode":1,"targetNativeId":30004}]
	_assert(_shell._bridge.request("encounter.update-complex",{"expectedRevision":int(_shell._bridge.request("session.describe").result.revision),"encounter":record}))
	await _shell._activate_session(_shell._bridge.request("session.describe"));await _idle()
	_shell._issues.request_show();await _idle();view.state.set_filters(identity,"error");await _idle()
	view.get_node("%OpenFinding").pressed.emit();await _idle()
	editor=_shell._documents.view("encounters.complex")
	_assert({"ok":editor._step_dialog.visible and editor._selected_result==1 and editor._selected_step==3})
	await _capture("complex-nested","Real %s Result 2 Step 4 finding; exact flattened source slot and native nested window." % identity)
	editor._step_dialog.cancel();await _idle()

func _preserved_source() -> void:
	await _idle();_shell._close_project()
	_assert(preload("res://tools/diagnostics_import_fixture.gd").create(_shell._bridge,_work))
	await _shell._activate_session(_shell._bridge.request("session.describe"));await _idle()
	await _show("linter.issues")
	var view=_shell._issues.workbench
	view.state.set_filters("classic-source:Data SD2");await _idle()
	_assert({"ok":view.get_node("%OpenFinding").text=="Open retained source"})
	await _capture("record-fallback","Real partial imported message source; exact retained source is available, no fabricated editable partial record.")
	view.get_node("%OpenFinding").pressed.emit();await _idle();_route="records.evidence"
	await _capture("preserved-fragment","Actual imported SD2 tail is separate from its one complete decoded row; source bytes remain unchanged.")

func _records() -> void:
	await _show("records.decoded-records")
	var view=_shell._documents.view(_route)
	await _capture("populated","Real fixed-record geometry and derived caller/target/problem projections.")
	await view.filter_identity("extra-action-point:31000");view._choose_detail("outgoing");await _idle()
	await _capture("outgoing","Real missing targets disabled; explicit source navigation retained.")
	view._choose_detail("problems");await _idle();await _capture("problems","Real selected-record findings; Open in Issues preserves exact owning field.")
	await view.filter_source("Data SD2");await _capture("filtered","Exact retained-source navigation clears previous query and record-type filters.")
	view.get_node("%CatalogSearch").text="absent-record-query";await view.refresh_workbench();await _capture("no-results","All stale record details and links clear.")
	_shell._bridge.fail_method="record.list";await view.refresh_workbench();await _capture("failure","Controlled record read failure; Refresh retries explicitly.")
	_shell._bridge.fail_method="";view.clear_filters();await _idle()
	_shell._bridge.delayed_method="record.list";view.refresh_workbench();await _capture("loading","Real worker read; prior details clear while input remains responsive.")
	await _idle();_shell._bridge.delayed_method=""
	await _shell._navigation.activate_domain("assets");await _idle()
	await _show("assets.decoded-records");_assert({"ok":_shell._navigation.active_domain=="assets"})
	await _capture("asset-entry","Normal Assets activity opens its Decoded Records entry and retains Assets context in the shared document.")

func _evidence() -> void:
	await _show("records.evidence")
	var view=_shell._documents.view(_route)
	await _capture("populated","Real captured Classic files; original source identity and actual decoded count.")
	await view.open_source("Data SD2");await _capture("fixed-record","Real codec geometry and preservation; exact source opens Decoded Records.")
	var sources:Dictionary=_shell._bridge.request("source-evidence.list",{"kind":"resource-container","limit":1})
	if sources.get("ok",false) and not sources.result.items.is_empty():
		await view.open_source(sources.result.items[0].nativePath);await _capture("resource","Actual retained resource container; no fixed-record decoder or replacement is invented.")
	view.get_node("%CatalogSearch").text="absent-source-query";await view.refresh_workbench();await _capture("no-results","Source search retains filters and clears stale details.")
	_shell._bridge.fail_method="source-evidence.list";await view.refresh_workbench();await _capture("failure","Controlled source read rejection; no stale source or navigation actions.")
	_shell._bridge.fail_method="";view.clear_filters();await _idle()

func _show(route: String) -> void:
	_route=route;await _shell._navigation.select_route(route);await _idle()
	_assert({"ok":_shell._command_bar.command_title.text.strip_edges()==_shell._documents.view(route).workbench_title() if route!="linter.issues" else _shell._command_bar.command_title.text.contains("ISSUES")})
	_assert({"ok":not _shell.get_node("%EncounterRouteTabs").visible})
func _capture(state: String, evidence: String) -> void:
	await process_frame;await process_frame;await RenderingServer.frame_post_draw
	var name:=_route.replace(".","-")+"-"+state+"-%d.png" % _width
	_assert({"ok":root.get_texture().get_image().save_png(_output.path_join(name))==OK})
	_captures.append({"route":_route,"state":state,"path":name,"viewport":[_width,root.size.y],"evidence":evidence})
func _idle() -> void:
	await create_timer(.45).timeout
	var deadline:=Time.get_ticks_msec()+15000
	while Time.get_ticks_msec()<deadline:
		await process_frame
		if not _shell._operations.busy and not _shell._bridge.operation_busy() and not _shell._issues.workbench.state.has_pending_refresh(): return
	push_error("Diagnostic capture exceeded bounded wait");quit(1)
func _assert(response: Dictionary) -> void:
	if not response.get("ok",false): push_error(str(response));quit(1)

func _import_scenario(name: String) -> void:
	await _idle();_shell._close_project()
	_assert(_shell._bridge.create_project("diagnostics-import",_work.path_join(name)))
	_assert(_shell._bridge.import_classic_scenario("D:/Scenarios/"+name,0,_shell._bridge.bundled_classic_application_data_root()))
	_assert(_shell._bridge.request("project.save"))
	await _shell._activate_session(_shell._bridge.request("session.describe"));await _idle()

func _import_navigation() -> void:
	await _show("records.decoded-records")
	var view=_shell._documents.view(_route)
	await view.filter_source("Data SD2");await _idle()
	_assert({"ok":int(view._page.total)>0 and view._record.get("sourceRetained",false)})
	await _capture("imported","Real Half Truth fixed-record catalog, source ownership and independently paged callers.")
	var location:Dictionary=view.read_navigation_state()
	var identity:String=view._record.identity
	await view._open_owner();await _idle()
	_assert({"ok":_shell._navigation.current_view().route_identity()=="text.messages"})
	await _shell._navigation.navigate_back();await _idle()
	_assert({"ok":view._record.get("identity")==identity and view.read_navigation_state().get("source")==location.source})
	await _capture("returned","Real authoring-owner navigation and history return preserve record and exact source filter.")
	await _show("records.evidence")
	var evidence=_shell._documents.view(_route)
	await evidence.open_source("Data SD2");await _idle()
	_assert({"ok":not evidence.get_node("%OpenRecords").disabled and not evidence._compiler.is_empty()})
	await _capture("half-truth","Real imported source geometry and embedded compiler identity, no raw bytes copied to the view.")
