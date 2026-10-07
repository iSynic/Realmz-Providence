extends SceneTree

const Actions = preload("res://tools/divinity_picker_test_actions.gd")
var bridge := ProvidenceNativeBridge.new()
var workbench: ProvidenceActionStepWorkbench
var picker: ProvidenceDivinityCodeHelper


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.gui_embed_subwindows = true; root.size = Vector2i(1600, 900)
	assert(bridge.start_demo().ok)
	workbench = load("res://src/action_step_workbench.tscn").instantiate()
	root.add_child(workbench); await process_frame
	workbench.form_describe_requested.connect(func(query, id, _slot):
		var response := bridge.request("action-form.describe", {"query": query})
		assert(response.ok); workbench.set_form_description(response.result, id))
	workbench.set_catalog(bridge.request("action-definition.list", {"limit": 128}).result)
	await _check_current_reveal()
	workbench.set_document("simple-encounter:3", [], {"scriptKind": "simple-encounter", "encounterResultIndex": 1})
	workbench.focus_slot(3); await process_frame
	picker = workbench.get_node("%StepActionPicker")
	assert(Actions.preview(workbench, "realmz.action.-23") >= 0)
	for frame in 8: await process_frame
	var documentation: String = picker.get_node("%CodeDetails").text
	assert(documentation.find("The level field is Dungeon Level ID") < documentation.find("ORIGINAL DIVINITY NOTES"))
	assert(documentation.contains("ORIGINAL DIVINITY NOTES (SHARED WITH CODE 23)"))
	var list := picker.get_node("%CodeEntries") as ProvidenceDivinityActionList
	var row := list._items[list.get_selected_items()[0]]
	var mouse := InputEventMouseButton.new()
	mouse.button_index = MOUSE_BUTTON_LEFT; mouse.pressed = true; mouse.double_click = true
	mouse.position = row.get_global_rect().get_center()
	picker.push_input(mouse)
	await process_frame
	assert(not picker.visible and workbench._selected_action_identity() == "realmz.action.-23")
	assert(not workbench._current_draft().gosub and workbench.get_node("%ChooseAction").has_focus())
	await _check_lifetimes()
	workbench.free(); bridge.stop()
	print("PROVIDENCE_DIVINITY_PICKER_INPUT_OK pointer-double-click keyboard-browse list-enter focus result-document-route-stale current-reveal-1920+1600 signed-dungeon-notes")
	quit()


func _check_lifetimes() -> void:
	var list := picker.get_node("%CodeEntries") as ProvidenceDivinityActionList
	assert(Actions.preview(workbench, "realmz.action.24") >= 0)
	await process_frame
	var old := workbench._picker_callback
	workbench.set_document("simple-encounter:3", [], {"scriptKind": "simple-encounter", "encounterResultIndex": 2})
	old.call("realmz.action.24")
	assert(not picker.visible and workbench.draft_steps().is_empty(), "Old result/document selections are rejected")
	assert(Actions.preview(workbench, "realmz.action.24") >= 0)
	await process_frame
	old = workbench._picker_callback
	workbench.hide(); await process_frame
	old.call("realmz.action.24")
	assert(not picker.visible and workbench.draft_steps().is_empty(), "Hidden route selections are rejected")
	workbench.show(); await process_frame
	assert(Actions.preview(workbench, "realmz.action.24") >= 0)
	await process_frame
	var search := picker.get_node("%CodeSearch") as LineEdit
	search.grab_focus()
	var down := InputEventKey.new(); down.keycode = KEY_DOWN; down.pressed = true
	picker.push_input(down)
	assert(workbench.draft_steps().is_empty(), "Keyboard browsing must not select an action")
	list._items[list.get_selected_items()[0]].grab_focus()
	var enter := InputEventKey.new(); enter.keycode = KEY_ENTER; enter.pressed = true
	picker.push_input(enter); await process_frame
	assert(not picker.visible and not workbench.draft_steps().is_empty(), "Enter accepts with list-row focus")


func _check_current_reveal() -> void:
	for viewport in [Vector2i(1920, 1080), Vector2i(1600, 900)]:
		root.size = viewport
		for kind in ["action-point", "extra-action-point"]:
			workbench.set_document("action-point:land:0:0" if kind == "action-point" else "extra-action-point:1", [],
				{"scriptKind": kind, "mapIdentity": "land:0"})
			workbench.focus_slot(7)
			assert(Actions.choose(workbench, "realmz.action.24"))
			workbench.get_node("%ChooseAction").pressed.emit()
			var window := workbench.get_node("%StepActionPicker") as ProvidenceDivinityCodeHelper
			for frame in 8: await process_frame
			_assert_selected_visible(window, viewport, kind)
			for show in [true, false]:
				window.get_node("%ShowUnavailable").button_pressed = show
				for frame in 8: await process_frame
				_assert_selected_visible(window, viewport, kind)
			window.close_helper()


func _assert_selected_visible(window: ProvidenceDivinityCodeHelper, viewport: Vector2i, kind: String) -> void:
	var list := window.get_node("%CodeEntries") as ProvidenceDivinityActionList
	var selected := list.get_selected_items()[0]
	assert(list.get_item_metadata(selected).identity == "realmz.action.24")
	var row := list._items[selected].get_global_rect()
	var bounds := list.get_global_rect()
	assert(row.position.y >= bounds.position.y and row.end.y <= bounds.end.y,
		"Current action must be fully visible after opening/filtering: %s %s %s %s" % [kind, viewport, row, bounds])
