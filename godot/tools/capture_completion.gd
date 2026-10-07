extends "res://tools/validate_completion_workflow.gd"

const Actions = preload("res://tools/divinity_picker_test_actions.gd")
var output := ""
var captures: Array = []

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")))
	output = args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = ReadFailureBridge.new(args[0].path_join("capture-settings.cfg"))
	root.add_child(shell); await process_frame
	await shell._project_session.open_project(args[0]); await settle()
	await _callers()
	for viewport in [Vector2i(1920,1080), Vector2i(1600,900)]:
		DisplayServer.window_set_size(viewport)
		root.content_scale_size = viewport
		root.size = viewport
		await _forms()
		await _routes()
		await _links()
	await _ultrawide()
	await _response_budget()
	var receipt := FileAccess.open(output.path_join("captures.json"), FileAccess.WRITE)
	receipt.store_string(JSON.stringify({"captures":captures, "functionalChecks":checks}, "\t")); receipt.close()
	shell._bridge.stop(); shell.free(); await process_frame
	print("PROVIDENCE_COMPLETION_CAPTURE_OK captures=", captures.size())
	quit()

func _response_budget() -> void:
	var discovery = shell._commands._discovery
	var samples: Array[float] = []
	discovery.open_search(); await settle()
	await discovery.search("quest", "scenario", "all", 0)
	for index in 30:
		var started := Time.get_ticks_usec()
		await discovery.search("quest", "scenario", "all", 0)
		await RenderingServer.frame_post_draw
		samples.append(float(Time.get_ticks_usec() - started) / 1000.0)
	samples.sort()
	assert(samples[28] <= 100, "Warmed rendered Search exceeded its 100 ms p95 budget")
	var file := FileAccess.open(output.path_join("rendered-search-response.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"samples":30,"p95Ms":samples[28],"maxMs":samples.back(),"budgetMs":100,"scope":"Warmed Search through native list rendering; cold index measured separately"},"\t"))
	file.close(); discovery._view.close_view()

func _forms() -> void:
	await shell._navigation.open_script_target("same-map-action-point", 78, "action-point:land:0:78", {}); await settle()
	var view: Control = shell._documents.view("scripts.action-points")
	var workbench: ProvidenceActionStepWorkbench = view.get_node("%SemanticActionSteps")
	workbench.focus_slot(0)
	assert(Actions.choose_fresh(workbench,"realmz.action.40")); await settle()
	await capture("ap-condition-draft", "scripts.action-points", "Real picker selection; condition precedes expected state and branch routing")
	assert(Actions.preview(workbench,"realmz.action.-23") >= 0); await settle()
	await capture("signed-picker", "divinity-picker", "Nested owned picker preserves distinct signed identities")
	workbench.get_node("%StepActionPicker").get_node("%CancelAction").pressed.emit(); await settle()
	view.discard_draft(); await settle()
	await shell._navigation.open_script_target("extra-action-point",31000,"extra-action-point:31000",{}); await settle()
	view = shell._documents.view("scripts.macros")
	workbench = view.get_node("%SemanticActionSteps")
	workbench.focus_slot(4)
	assert(Actions.choose_fresh(workbench,"realmz.action.3")); await settle()
	await capture("xap-player-option-draft", "scripts.macros", "Choice text precedes Continue When and Otherwise; draft remains local")
	workbench._field_renderer.changed.emit("choiceText",1,"authoring-mode"); await settle()
	await capture("xap-player-option-invalid", "scripts.macros", "New custom choices require explicit selections; invalid draft stays local")
	workbench._field_renderer.changed.emit("promptA",26,"authoring-selection"); await settle()
	workbench._field_renderer.changed.emit("promptB",27,"authoring-selection"); await settle()
	await capture("xap-player-option-custom", "scripts.macros", "Custom left/right labels precede their continue and otherwise behaviors")
	view.discard_draft(); await settle()

func _routes() -> void:
	for route in ["scripts.action-points","scripts.macros","encounters.simple","encounters.complex","encounters.rogue","encounters.timed","linter.issues","export.export-plan"]:
		await shell._navigation.select_route(route); await settle()
		assert(shell._navigation.current_route() == route)
		await capture(route.replace(".","-"), route, "Current real adapter record; Rogue 8 and Timed 3 are freshly created fixture records")
	await shell._navigation.select_route("encounters.simple"); await settle()
	var view: Control = shell._documents.view("encounters.simple")
	var picker: OptionButton = view._response_controls[0].result
	var original: int = picker.get_item_metadata(picker.selected)
	view._populate_result_picker(picker,0,-4); await settle()
	await capture("simple-auto-run-draft", "encounters.simple", "Option 1 auto-run remains explicit; all response/routing widths match")
	view._populate_result_picker(picker,0,original)

func _links() -> void:
	await shell._navigation.open_script_target("extra-action-point",31001,"extra-action-point:31001",{}); await settle()
	var view: Control = shell._documents.view("scripts.macros")
	view.find_child("Callers",true,false).pressed.emit(); await settle()
	var discovery = shell._commands._discovery
	var links: Window = discovery._view
	var rows: Tree = links.get_node("%Rows")
	rows.get_root().get_first_child().select(0); await settle()
	await capture("callers-populated", "callers", "Real incoming XAP occurrence with exact UI Step 5 destination (native slot 4)")
	shell._bridge.fail_source = true
	links.get_node("%OpenSource").pressed.emit(); await settle()
	await capture("callers-failed-open", "callers", "Controlled adapter read failure retains rows, selection and origin for explicit retry")
	shell._bridge.fail_source = false
	links.get_node("%Query").text = "no-such-caller-873261"
	await discovery.links(links._record,"incoming","no-such-caller-873261",0)
	await capture("callers-empty", "callers", "Real filtered empty response clears stale link details")
	links.get_node("%Query").text = ""
	await discovery.links(links._record,"incoming","",0)
	shell._operations.busy = true
	links.refresh()
	await capture("callers-loading", "callers", "Pending request state; existing interaction remains bounded", false)
	shell._operations.busy = false; await settle()
	links.close_view(); await settle()

func _ultrawide() -> void:
	var original: bool = shell._layout.centered_workspace()
	var viewport := Vector2i(3440,1392)
	DisplayServer.window_set_size(viewport)
	root.content_scale_size = viewport; root.size = viewport
	await shell._navigation.select_route("scripts.macros"); await settle()
	shell._layout.set_centered_workspace(true); await settle()
	await capture("workspace-centered", "workspace", "Entire in-app workspace centered to content-height 16:9")
	shell._layout.set_centered_workspace(false); await settle()
	await capture("workspace-full-width", "workspace", "Default full-width workspace")
	shell._layout.set_centered_workspace(original)

func capture(state: String, route: String, evidence: String, wait := true) -> void:
	if wait: await settle()
	await RenderingServer.frame_post_draw
	var size := root.get_texture().get_size()
	var name := "%s-%dx%d.png" % [state,size.x,size.y]
	assert(root.get_texture().get_image().save_png(output.path_join(name)) == OK)
	captures.append({"state":state,"route":route,"file":name,"width":size.x,"height":size.y,"evidence":evidence})
