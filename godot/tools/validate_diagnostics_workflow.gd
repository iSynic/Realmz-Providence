extends SceneTree

class Bridge extends "res://src/native_bridge.gd":
	var fail_method := ""
	var delayed_method := ""
	func _request(method: String, params: Dictionary = {}) -> Dictionary:
		if method==delayed_method: OS.delay_msec(500)
		if method==fail_method: return {"ok":false,"error":"Controlled diagnostic read rejection."}
		return super._request(method,params)

var shell
var work := ""
var receipts: Array = []
func _initialize() -> void: call_deferred("_run")
func _run() -> void:
	var args:=OS.get_cmdline_user_args()
	if args.size()!=2 or not args[0].get_file().begins_with("providence-ui-"): quit(1); return
	work=args[0]; OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.size=Vector2i(1600,900);root.content_scale_size=root.size
	shell=preload("res://src/editor_shell.tscn").instantiate();root.add_child(shell);await _idle()
	shell._bridge.stop();shell._bridge=Bridge.new(work.path_join("settings.cfg"))
	await _fresh_state()
	for name in ["City of Bywater","Half Truth"]:
		_check(shell._bridge.create_project("diagnostic-workflow",work.path_join(name)).get("ok",false),"Create disposable import")
		_check(shell._bridge.import_classic_scenario("D:/Scenarios/"+name,0,shell._bridge.bundled_classic_application_data_root()).get("ok",false),"Import "+name)
		await shell._activate_session(shell._bridge.request("session.describe"));await _idle()
		await _catalogs(name);await _navigation(name);await _families(name);await _failure_boundaries(name)
		_check(shell._bridge.request("project.save").get("ok",false),"Save "+name)
		await _idle();_check(shell._bridge.start_project(work.path_join(name)).get("ok",false),"Reopen "+name)
		await shell._activate_session(shell._bridge.request("session.describe"));await _idle()
		await shell._navigation.select_route("records.evidence");await _idle()
		var evidence=shell._documents.view("records.evidence")
		await evidence.open_source("Data SD2");await _idle()
		_check(not evidence.get_node("%OpenRecords").disabled,"Reopened source has canonical rows")
		shell._close_project();await _idle()
	await _preserved_sources()
	var file:=FileAccess.open(args[1],FileAccess.WRITE);file.store_string(JSON.stringify({"status":"passed","checks":receipts},"\t"));file.close()
	shell.free();await process_frame
	print("PROVIDENCE_DIAGNOSTICS_WORKFLOW_OK imports=2 filters=exact history=restored pages=independent failures=cleared stale=rejected save=reopened");quit()

func _fresh_state() -> void:
	_check(shell._bridge.create_project("fresh-diagnostics",work.path_join("fresh")).get("ok",false),"Create fresh diagnostic project")
	await shell._activate_session(shell._bridge.request("session.describe"));await _idle()
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size=viewport;root.content_scale_size=viewport
		await shell._navigation.select_route("linter.issues");await _idle()
		shell._issues.workbench.state.set_filters("no-findings-for-fresh-diagnostic-fixture");await _idle()
		for name in ["OpenFinding","FindUses","OpenRecords","OpenEvidence"]:
			_check(shell._issues.workbench.get_node("%"+name).disabled,"Fresh filtered-empty Issues disables "+name)
		shell._issues.workbench.state.set_filters("");await _idle()
		for route in ["records.decoded-records","records.evidence"]:
			await shell._navigation.select_route(route);await _idle()
			_check(shell._command_bar.command_title.text.strip_edges()==shell._documents.view(route).workbench_title(),"Fresh destination chrome matches "+route)
			_check(not shell.get_node("%EncounterRouteTabs").visible,"Diagnostic route hides Encounter navigation")
	shell._close_project();await _idle()

func _preserved_sources() -> void:
	_check(preload("res://tools/diagnostics_import_fixture.gd").create(shell._bridge,work).get("ok",false),"Import exact partial SD2/EDCD fixture")
	await shell._activate_session(shell._bridge.request("session.describe"));await _idle()
	await shell._navigation.select_route("linter.issues");await _idle()
	var view=shell._issues.workbench
	view.state.set_filters("classic-source:Data SD2");await _idle()
	_check(not view.state.show_all and view.state.selected_finding().is_empty(), "Preservation detail stays outside default actionable findings")
	view.get_node("%ShowAll").button_pressed = true; await _idle()
	_check(view.state.selected_finding().get("code")=="source.partial-record.preserved","Partial source warning has original source owner")
	_check(view.get_node("%OpenFinding").text=="Open retained source" and not view.get_node("%OpenFinding").disabled,"Source-only finding offers honest retained source action")
	view.get_node("%OpenFinding").pressed.emit();await _idle()
	var evidence=shell._documents.view("records.evidence")
	_check(shell._navigation.current_route()=="records.evidence" and evidence._source.source.nativePath=="Data SD2","Source-only finding navigates exact retained file")
	_check(int(evidence._source.codecDescriptors[0].trailingBytes)==1 and int(evidence._source.decodedRecordCount)==1,"Partial source shows complete decoded rows separately from residue")
	var hash_before:String=evidence._source.source.blob
	_check(shell._bridge.request("project.save").get("ok",false),"Save retained fragment project")
	_check(shell._bridge.start_project(work.path_join("partial-project")).get("ok",false),"Reopen retained fragment project")
	var reopened:Dictionary=shell._bridge.request("source-evidence.open",{"nativePath":"Data SD2"})
	_check(reopened.result.source.blob==hash_before and int(reopened.result.source.byteLength)==257,"Save/reopen preserves exact malformed source bytes")

func _catalogs(name: String) -> void:
	await shell._navigation.activate_domain("assets");await _idle()
	await shell._navigation.select_route("assets.decoded-records");await _idle()
	_check(shell._navigation.active_domain=="assets",name+" Assets Records entry retains originating activity")
	await shell._navigation.select_route("records.decoded-records");await _idle()
	var view=shell._documents.view("records.decoded-records")
	view.get_node("%CatalogSearch").text="battle"
	for i in view.get_node("%TypeFilter").item_count:
		if view.get_node("%TypeFilter").get_item_metadata(i)=="battle": view.get_node("%TypeFilter").select(i)
	await view.refresh_workbench();await view.filter_source("Data SD2");await _idle()
	_check(view.get_node("%CatalogSearch").text.is_empty() and view._filter(view.get_node("%TypeFilter"))=="all",name+" exact source clears conflicting filters")
	_check(view._page.total>0 and view._record.sourceRetained,name+" retained source and canonical records")
	var rows:Dictionary=shell._bridge.request("record.list",{"nativePath":"Data SD2","limit":128}).result
	var candidates:Array=rows.items.filter(func(row): return int(row.incomingReferences)>3)
	if not candidates.is_empty():
		await view.filter_identity(str(candidates[0].identity));await _idle()
		view._step_links(1);await _idle();_check(view._cursors.incoming==3,name+" incoming second page")
		view._choose_detail("outgoing");await _idle();_check(view._cursors.outgoing==0,name+" outgoing independent cursor")
		view._choose_detail("incoming");await _idle();_check(view._cursors.incoming==3,name+" incoming page retained")
	var before:Dictionary=view.read_navigation_state()
	view._select_record(view._record);await _idle()
	_check(view.read_navigation_state().identity==before.identity and view._cursors==before.cursors,name+" same selection preserves cursor")
	await shell._navigation.select_route("records.evidence");await _idle()
	var evidence=shell._documents.view("records.evidence")
	await evidence.open_source("Data SD2");await _idle()
	_check(not evidence.get_node("%OpenRecords").disabled and int(evidence._source.decodedRecordCount)>0,name+" actual canonical count enables Records")
	_check(not evidence._compiler.is_empty() and evidence._compiler.has("sourceTree"),name+" embedded tool identity")

func _navigation(name: String) -> void:
	await shell._navigation.select_route("records.decoded-records");await _idle()
	var view=shell._documents.view("records.decoded-records")
	await view.filter_source("Data SD2");await _idle()
	view.get_node("%CatalogSearch").grab_focus()
	var origin:Dictionary=view.read_navigation_state()
	var domain:String=shell._navigation.active_domain
	await view._open_owner();await _idle()
	_check(shell._navigation.current_route()=="text.messages",name+" exact message owner")
	await shell._navigation.navigate_back();await _idle()
	_check(view._record.get("identity")==origin.identity and view._filter(view.get_node("%SourceFilter"))==origin.source,name+" history retains selection and filters")
	_check(view.get_node("%CatalogSearch").has_focus(),name+" history restores keyboard focus")
	_check(shell._navigation.active_domain==domain,name+" history restores originating Records activity")
	var source_navigation=preload("res://src/source_navigation.gd")
	var result:bool=await source_navigation.open(shell._navigation,{"source":"land:99999","field":"tiles[0][0]"});await _idle()
	_check(not result,name+" failed map does not report source-open success")
	await shell._navigation.select_route("records.decoded-records");await _idle()
	var unknown=shell._navigation.describe_source({"source":"battle:0","field":"grid"})
	_check(not unknown.exact and not unknown.reason.is_empty(),name+" unsupported field has honest record fallback")
	var exact=shell._navigation.describe_source({"source":"battle:0","field":"grid[0].monster"})
	_check(exact.exact,name+" supported battle slot has exact field capability")

func _failure_boundaries(name: String) -> void:
	await shell._navigation.select_route("records.decoded-records");await _idle()
	var view=shell._documents.view("records.decoded-records")
	var location:Dictionary=view.read_navigation_state()
	shell._bridge.fail_method="record.list"
	_check(not (await view.refresh_workbench()).get("ok",false),name+" record read fails explicitly")
	_check(view._record.is_empty() and view.get_node("%OpenOwner").disabled,name+" failed read clears actionable stale details")
	shell._command_bar.search_button.grab_focus()
	_check(not await view.restore_navigation_state(location),name+" failed history read returns false")
	_check(shell._command_bar.search_button.has_focus(),name+" failed restore does not steal focus")
	shell._bridge.fail_method="";await view.restore_navigation_state(location);await _idle()
	shell._bridge.delayed_method="record.list"
	create_timer(.1).timeout.connect(func(): view.reader.invalidate())
	_check(not await view.restore_navigation_state(location),name+" invalidated session read cannot restore old focus")
	shell._bridge.delayed_method="";await view.refresh_workbench();await _idle()
	await shell._navigation.select_route("records.evidence");await _idle()
	var evidence=shell._documents.view("records.evidence")
	shell._bridge.fail_method="source-evidence.list"
	_check(not (await evidence.refresh_workbench()).get("ok",false),name+" source read fails explicitly")
	_check(evidence._source.is_empty() and evidence.get_node("%OpenRecords").disabled,name+" evidence failure clears source actions")
	shell._bridge.fail_method="";await evidence.refresh_workbench();await _idle()
	await _detail_failures(view,evidence,name)

func _detail_failures(view: Control, evidence: Control, name: String) -> void:
	for pair in [[view,"records.decoded-records","record.open"],[evidence,"records.evidence","source-evidence.open"]]:
		await shell._navigation.select_route(pair[1]);await _idle()
		var location:Dictionary=pair[0].read_navigation_state()
		shell._bridge.fail_method=pair[2];shell._command_bar.search_button.grab_focus()
		_check(not await pair[0].restore_navigation_state(location),name+" selected-detail failure rejects "+pair[2]+" history return")
		_check(shell._command_bar.search_button.has_focus(),name+" selected-detail failure cannot steal focus")
		_check(shell.get_node("%Status").text.contains("Controlled diagnostic read rejection"),name+" selected-detail failure has current footer")
		if pair[2]=="record.open":
			for button in ["Incoming","Outgoing","Problems"]: _check(pair[0].get_node("%"+button).text==button,name+" failed detail clears "+button+" count")
		shell._bridge.fail_method="";_check(await pair[0].restore_navigation_state(location),name+" explicit detail retry succeeds")
		await _idle()
		await shell._navigation.select_route("text.messages");await _idle()
		var history_size:int=shell._navigation._back.size()
		shell._bridge.fail_method=pair[2];shell._command_bar.search_button.grab_focus()
		await shell._navigation.navigate_back();await _idle()
		_check(shell._navigation._back.size()==history_size,name+" failed detail return retains its history destination")
		_check(shell._command_bar.search_button.has_focus(),name+" failed history destination keeps current focus")
		_check(not shell.get_node("%Status").text.begins_with("Back to"),name+" failed detail return does not announce navigation success")
		shell._bridge.fail_method="";await shell._navigation.navigate_back();await _idle()
		_check(shell._navigation._back.size()==history_size-1,name+" explicit Back retries only diagnostic reads")

func _families(name: String) -> void:
	var destinations=preload("res://src/diagnostic_destination.gd")
	for kind in ["action-point","extra-action-point","simple-encounter","complex-encounter","rogue-encounter","timed-encounter","battle","monster","treasure","shop","standard-item","scenario-item","standard-spell","scenario-spell","race","caste","player-map","land-map","dungeon-map"]:
		var response:Dictionary=shell._bridge.request("record.list",{"recordType":kind,"limit":1})
		_check(response.get("ok",false),name+" "+kind+" bounded catalog")
		if response.result.items.is_empty(): continue
		var row:Dictionary=response.result.items[0]
		if not row.get("owningEditorAvailable",true): continue
		var reference:Dictionary={"source":row.identity,"field":""}
		var destination:Dictionary=destinations.describe(reference)
		if destination.is_empty(): continue
		var opened:bool=await preload("res://src/source_navigation.gd").open(shell._navigation,reference);await _idle()
		_check(opened and shell._navigation.current_route()==destination.route,name+" "+kind+" opens its owning authoring tool")
	await shell._navigation.select_route("text.messages");await _idle()
	var strings=shell._documents.view("text.messages")
	strings.get_node("%MessageText").text="Local diagnostic departure draft";strings.get_node("%MessageText").text_changed.emit();await _idle()
	var opened:bool=await shell._navigation.open_map("land:0")
	_check(not opened and shell._unapplied_dialog.visible,name+" same/different route dirty navigation awaits decision")
	shell._unapplied_dialog.hide();shell._unapplied_dialog.canceled.emit();await _idle()
	_check(shell._navigation.current_view()==strings and strings.get_node("%MessageText").text=="Local diagnostic departure draft",name+" Cancel retains source draft and destination")
	strings.discard_draft();await _idle()

func _idle() -> void:
	await create_timer(.15).timeout
	var deadline:=Time.get_ticks_msec()+20000
	while Time.get_ticks_msec()<deadline:
		await process_frame
		if not shell._operations.busy and not shell._bridge.operation_busy() and not shell._issues.workbench.state.has_pending_refresh(): return
	push_error("Diagnostics workflow exceeded bounded wait");quit(1)
func _check(condition: bool, claim: String) -> void:
	if not condition: push_error(claim);quit(1)
	else: receipts.append(claim)
