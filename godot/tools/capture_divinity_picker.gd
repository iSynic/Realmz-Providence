extends SceneTree

const Actions = preload("res://tools/divinity_picker_test_actions.gd")
var shell: Control
var workbench: ProvidenceActionStepWorkbench
var picker: ProvidenceDivinityCodeHelper
var output := ""
var captures: Array = []


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and FileAccess.file_exists(args[0].path_join("assets-corpus-disposable.marker")))
	output = args[1]
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true
	root.size = Vector2i(1600, 900); root.content_scale_size = root.size
	shell = load("res://src/editor_shell.tscn").instantiate()
	shell._bridge = ProvidenceNativeBridge.new(args[0].path_join("picker-capture-settings.cfg"))
	root.add_child(shell); await process_frame
	await shell._project_session.open_project(args[0]); await settle()
	for context in [
		["ap", "scripts.action-points", "action-point:land:0:0", "open_action_point", 7],
		["xap", "scripts.macros", "extra-action-point:436", "open_extra_action_point", 7],
		["simple", "encounters.simple", "simple-encounter:1", "open_simple_encounter", 7],
		["complex", "encounters.complex", "complex-encounter:3", "open_complex_encounter", 11]]:
		await _context(context)
	var helper := shell.get_node("%DivinityCodeHelper") as ProvidenceDivinityCodeHelper
	helper.open_for_code(24, shell.get_node("%PrimaryWorkspace")); await settle()
	await pair("reference", "reference", "Contextless standalone help; neutral availability, no authoring acceptance")
	var file := FileAccess.open(output.path_join("capture.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"kind": "divinity-picker-native", "axes": {"mode": "dark", "density": "balanced"},
		"source": "Half Truth imported by the native adapter; signed/previews are inert local selections",
		"configuredAdapter": shell._bridge._adapter_path(), "buildIdentity": shell._bridge.request("build.identity").result,
		"captures": captures}, "\t")); file.close()
	shell._bridge.stop(); shell.free()
	print("PROVIDENCE_DIVINITY_PICKER_CAPTURE_OK ", captures.size())
	quit()


func settle() -> void:
	var idle := 0
	while idle < 4:
		await process_frame
		idle = 0 if shell._operations.busy else idle + 1


func _context(context: Array) -> void:
	await shell._navigation.select_route(context[1]); await settle()
	assert(await shell._scripts.call(context[3], context[2])); await settle()
	var view: Control = shell._documents.view(context[1])
	if str(context[1]).begins_with("encounters."):
		view.call("_open_step", context[4]); await settle()
		workbench = view._step_dialog._workbench
	else:
		workbench = view.get_node("%SemanticActionSteps")
		workbench.focus_slot(context[4]); await settle()
	picker = workbench.get_node("%StepActionPicker")
	await pair(context[0], "entry", "Current action and Choose action; existing source record/parent commands")
	workbench.get_node("%ChooseAction").pressed.emit(); await settle()
	await pair(context[0], "populated", "Actual available-first catalog; full documentation and exact destination")
	if context[0] == "ap": await _ap_states()
	picker.close_helper(); await settle()
	if str(context[1]).begins_with("encounters."): view._step_dialog.cancel()


func _search(query: String) -> void:
	var search := picker.get_node("%CodeSearch") as LineEdit
	search.text = query; search.text_changed.emit(query)


func _preview(identity: String) -> void:
	var list := picker.get_node("%CodeEntries") as ProvidenceDivinityActionList
	for index in list.item_count:
		if str((list.get_item_metadata(index) as Dictionary).get("identity", "")) == identity:
			list.select(index); list.item_selected.emit(index); list.ensure_current_is_visible(); return
	assert(false, "Missing preview " + identity)


func _ap_states() -> void:
	_search("Exit Action Point And Keep Codes"); _preview("realmz.action.24")
	await pair("ap", "alias", "Original Divinity name resolves Providence Continue Steps; query does not mutate the draft")
	_search("")
	var category := picker.get_node("%ActionCategory") as OptionButton
	for index in category.item_count:
		if category.get_item_metadata(index) == "Dialogue": category.select(index); category.item_selected.emit(index)
	_preview("realmz.action.1")
	await pair("ap", "category", "Dialogue category filter and result count")
	category.select(0); category.item_selected.emit(0)
	(picker.get_node("%ShowUnavailable") as CheckBox).button_pressed = true
	_search("34"); _preview("realmz.action.34")
	await pair("ap", "unavailable", "Exit Encounter cannot be authored in an AP; core reason and disabled Use action")
	_search("no_such_action_723651")
	await pair("ap", "no-results", "Stale details cleared; recovery and disabled acceptance")
	_search(""); _preview(workbench._selected_action_identity())
	await pair("ap", "current", "Current action is labeled; accepting it preserves all draft settings")
	_search("-14"); _preview("realmz.action.-14")
	await pair("ap", "signed-14", "Distinct signed character-selection identity; canonical effect alongside shared manual text")
	_search("-23"); _preview("realmz.action.-23")
	await pair("ap", "signed-23", "Distinct signed force-branch identity; does not enable GOSUB")
	_search("0"); _preview("realmz.action.0")
	await pair("ap", "empty-step", "Explicit Empty Step choice affects only the selected local slot")
	_search("Not Used")
	var reference := picker._visible_entries.find_custom(func(e): return str(e.get("identity", "")).is_empty())
	assert(reference >= 0)
	(picker.get_node("%CodeEntries") as ProvidenceDivinityActionList).select(reference)
	picker.get_node("%CodeEntries").item_selected.emit(reference)
	await pair("ap", "manual-only", "Manual-only entry has no canonical action; disabled Use action with explanation")


func pair(kind: String, state: String, description: String) -> void:
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport; root.content_scale_size = viewport
		await settle()
		for modal in shell.find_children("*", "Window", true, false):
			if modal.visible: modal.popup_centered()
		for _frame in range(8): await process_frame
		await RenderingServer.frame_post_draw
		var frame := "%s-%s-%dx%d.png" % [kind, state, viewport.x, viewport.y]
		assert(root.get_texture().get_image().save_png(output.path_join(frame)) == OK)
		captures.append({"kind": kind, "state": state, "description": description, "viewport": [viewport.x, viewport.y], "frame": frame})
		print("PICKER_CAPTURE ", frame)
