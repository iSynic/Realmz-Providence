extends SceneTree

class FaultBridge extends "res://src/native_bridge.gd":
	var lose_method := ""
	var calls: Array[String] = []
	func _request(method: String, params: Dictionary) -> Dictionary:
		calls.append(method)
		var result: Dictionary = super._request(method, params)
		if method == lose_method:
			lose_method = ""
			return {"ok": false, "outcomeUnknown": true, "error": "Controlled lost acknowledgement after durable Rule Apply."}
		return result

var bridge: FaultBridge
var operations: ProvidenceEditorOperation
var view: ProvidenceRuleAuthoringEditor
var controller
var revision := 0
var failed := false
var project := ""

func _initialize() -> void: _run.call_deferred()

func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not check(args.size() == 1 and DirAccess.dir_exists_absolute(args[0]), "Expected owned disposable root"): quit(1); return
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	project = args[0].path_join("project")
	bridge = FaultBridge.new(args[0].path_join("settings.cfg"))
	operations = ProvidenceEditorOperation.new(); root.add_child(operations)
	if not ok(bridge.create_project("rule-authoring-journey", project)): quit(1); return
	for kind in ["race", "caste"]:
		await run_family(kind)
		if failed: break
	bridge.stop(); operations.queue_free(); await process_frame
	if not failed: print("PROVIDENCE_RULE_AUTHORING_JOURNEY_OK two-routes fixed-ID-create stock-copy atomic-eligibility full-control-bindings fixed-slots successive-bitsets picker-focus cancel current-noop stale-origin lost-ack-no-replay undo-redo save-reopen")
	if not failed: print("PROVIDENCE_RULE_WORKBENCH_OK adapter-backed authoring replaces read-only scaffolding")
	quit(1 if failed else 0)

func run_family(kind: String) -> void:
	view = load("res://src/" + kind + "_editor.tscn").instantiate(); root.add_child(view); view.size = Vector2(1600, 900)
	controller = preload("res://src/rule_workbench_controller.gd").new()
	controller.initialize(view, operations, func(): return {"revision": revision}, func(): return bridge, func(result): return result.get("ok", false))
	controller.projection_applied.connect(func(change): revision = int(change.revision))
	controller.attach_session(bridge)
	if not ok(await controller.reload()): return
	check(not view.draft.editable, "Stock is protected before copying")
	if revision == 0:
		var presence: Dictionary = bridge.request("rule.open-authoring", {"kind":kind, "classicId":int(view.selected_definition().classicId)})
		if not ok(presence): return
		check(view.get_node("%FindAllUses").disabled == not presence.result.discoveryRecordPresent and not view.get_node("%FindAllUses").tooltip_text.is_empty(), "Find Uses follows canonical record presence independently of stock ownership")
	await controller._records.review_record("new")
	check(controller._records._review.visible, "Creation presents a core-derived allocation")
	controller._records._review.get_node("%UseDraft").pressed.emit()
	name_rule("Éclat " + kind)
	await edit_collections(kind)
	await choose_portrait(kind)
	if not ok(await view.commit_selected()): return
	check(not view.has_unapplied_changes(), "Apply acknowledges one complete draft")
	await idle()
	await picker_checks(kind)
	await preload("res://tools/rule_correction_checks.gd").new().run(view, controller, check, idle)
	await linked_return(kind)
	await invalid_and_recovery()
	if failed: return
	await history_and_persistence(kind)
	await copy_and_clear()
	await idle(); controller.dispose(); view.queue_free(); controller = null; await process_frame

func edit_collections(kind: String) -> void:
	view.show_section("Items")
	var first: CheckBox = view.form.find_child("Category0", true, false)
	var second: CheckBox = view.form.find_child("Category1", true, false)
	first.button_pressed = true; second.button_pressed = true
	check((int(view.selected_definition().itemCategoryMasks[0]) & 3) == 3, "Successive category toggles retain both bits")
	view.show_section("Castes" if kind == "race" else "Races")
	view.form.find_child("Eligible1", true, false).button_pressed = true
	view.form.find_child("Eligible2", true, false).button_pressed = true
	var field := "eligibleCasteIds" if kind == "race" else "eligibleRaceIds"
	check(view.selected_definition()[field].size() == 2, "Successive reciprocal eligibility edits retain both identities")
	if kind == "caste":
		view.form.control_for(["nativeFields", "maximumSpellsPerRound"]).value = 3
		var context: Dictionary = controller._references._context("startingItem", 2)
		controller._references.accept({"available": true, "value": 1, "targetIdentity": "classic.item.1"}, context)
		check(view.draft.edit.nativeFields.startingItems[0] == null and view.draft.edit.nativeFields.startingItems[2] == "classic.item.1", "One slot selection preserves sibling holes")

func picker_checks(kind: String) -> void:
	if kind == "caste":
		check(view.form.get_node_or_null("%ChoosePortrait") == null, "Divinity Caste authoring has no portrait control")
		return
	view.show_section("Profile")
	var target: LineEdit = view.form.control_for(["definition", "name"])
	target.grab_focus()
	controller._references.open_picker("defaultIconSet" if kind == "race" else "defaultIcon", -1)
	await idle()
	var picker = controller._references._picker
	check(picker.visible and not view.has_unapplied_changes(), "Browsing never writes the local draft")
	var context: Dictionary = picker.context.duplicate(true)
	var escape := InputEventKey.new(); escape.keycode = KEY_ESCAPE; escape.pressed = true
	picker._input(escape); await process_frame
	check(root.gui_get_focus_owner() == target, "Cancel restores the originating field focus")
	var before: Dictionary = view.draft.edit.duplicate(true)
	controller._references.accept({"available": true, "value": context.currentValue}, context)
	check(view.draft.edit == before and not view.has_unapplied_changes(), "Accepting current action is a no-op")
	controller._references.open_picker(context.field, -1); await idle()
	picker.get_node("%Choices").grab_focus()
	var enter := InputEventKey.new(); enter.keycode = KEY_ENTER; enter.pressed = true
	picker._input(enter); await idle()
	check(not picker.visible and view.draft.edit == before and not view.has_unapplied_changes(), "Enter accepts the revealed current identity without resetting fields")
	name_rule("Changed picker origin")
	controller._references.accept({"available": true, "value": 1}, context)
	check(int(view.selected_definition()[context.field]) == int(context.currentValue), "Edited originating draft rejects stale acceptance")
	view.discard_draft(); await idle()

func choose_portrait(kind: String) -> void:
	if kind == "caste": return
	var field := "defaultIconSet" if kind == "race" else "defaultIcon"
	var value := 1 if kind == "race" else 257
	controller._references.open_picker(field, -1); await idle()
	var picker = controller._references._picker
	var search: LineEdit = picker.get_node("%Search")
	search.text = str(value); search.text_changed.emit(search.text)
	await create_timer(0.3).timeout; await idle()
	check(not picker._rows.is_empty() and int(picker._rows[0].value) == value, "Exact stored portrait match is first")
	picker.get_node("%Choices").item_activated.emit(0); await idle()
	check(not picker.visible and int(view.selected_definition()[field]) == value, "Double-click waits for exact artwork then accepts its stored identity")

func linked_return(kind: String) -> void:
	await idle()
	var field := "eligibleCasteIds[0]" if kind == "race" else "startingItemIds[0]"
	check(await view.focus_source(view.current_selection(), -1, field), "Exact typed owning field is focusable")
	var expected: Control = view.form.find_child("Eligible1" if kind == "race" else "ChooseItem2", true, false)
	check(root.gui_get_focus_owner() == expected, "Compact typed item reference resolves to the preserved native slot")
	var state := view.read_navigation_state()
	view.show_section("Profile")
	check(await view.restore_navigation_state(state), "Linked return restores the saved route state")
	check(root.gui_get_focus_owner() == expected and view._section == state.section, "Return restores exact section and field focus")

func invalid_and_recovery() -> void:
	view.show_section("Profile")
	view.form.control_for(["definition", "attributeLimits", 0]).value = 10
	view.form.control_for(["definition", "attributeLimits", 1]).value = 2
	var result: Dictionary = await view.commit_selected()
	check(not result.get("ok", false) and view.has_unapplied_changes(), "Invalid minimum/maximum keeps the complete local draft")
	view.discard_draft(); await idle()
	name_rule("Durable lost acknowledgement")
	bridge.lose_method = "rule.draft.apply"
	result = await view.commit_selected()
	check(result.get("outcomeUnknown", false) and view._locked, "An uncertain Apply locks editing and browsing")
	var count := bridge.calls.count("rule.draft.apply")
	check(not (await view.commit_selected()).get("ok", false), "Repeated Apply is blocked")
	await controller.check_original_result()
	check(not view.has_unapplied_changes() and not operations.requires_reopen and bridge.calls.count("rule.draft.apply") == count, "Exact receipt recovery reads committed state without mutation replay")

func history_and_persistence(kind: String) -> void:
	var identity := view.current_selection()
	var saved := view.selected_definition()
	var undo := bridge.request("history.undo", {"expectedRevision": revision})
	if not ok(undo): return
	revision = int(undo.result.revision)
	var redo := bridge.request("history.redo", {"expectedRevision": revision})
	if not ok(redo): return
	revision = int(redo.result.revision)
	if not ok(bridge.request("project.save", {"expectedRevision": revision})): return
	await idle(); bridge.stop()
	if not ok(bridge.start_project(project)): return
	revision = int(bridge.request("session.describe", {}).result.revision)
	controller.attach_session(bridge)
	if not ok(await controller.open_rule(identity)): return
	check(view.selected_definition() == saved and not view.has_unapplied_changes(), "Save/reopen restores exact metadata, signed mechanics and reciprocal choices")
	if kind == "caste": check(view.draft.edit.nativeFields.maximumSpellsPerRound == 3 and view.draft.edit.nativeFields.startingItems[2] == "classic.item.1", "Native-only limit and fixed item slots persist")

func copy_and_clear() -> void:
	if not ok(await controller.open_rule("classic.%s.1" % view.rule_kind)): return
	await controller._records.review_record("copy")
	if not check(controller._records._review.visible, "Stock copy presents reviewed destination: " + view.get_node("%SubmissionNotice").text): return
	controller._records._review.get_node("%UseDraft").pressed.emit()
	if view.rule_kind == "caste":
		for slot in 20:
			var identity: Variant = view.draft.edit.nativeFields.startingItems[slot]
			if identity != null and not bridge.request("item.open", {"identity": identity}).get("ok", false):
				controller._references.accept({"available": true, "value": 0}, controller._references._context("startingItem", slot))
	if not ok(await view.commit_selected()): return
	await idle()
	var saved := view.selected_definition()
	await controller._records.review_record("clear")
	controller._records._review.get_node("%Cancel").pressed.emit()
	check(not view.has_unapplied_changes(), "Cancelling Clear preserves canonical content")
	await controller._records.review_record("clear")
	controller._records._review.get_node("%UseDraft").pressed.emit()
	check(view.has_unapplied_changes(), "Clear stages a local draft at the same identity")
	view.discard_draft()
	check(view.selected_definition() == saved, "Discard restores the complete copied record")

func name_rule(value: String) -> void:
	var control: LineEdit = view.form.control_for(["definition", "name"])
	control.text = value; control.text_changed.emit(value)

func idle() -> void:
	var stable := 0
	for frame in 1800:
		await process_frame
		stable = stable + 1 if not operations.busy and not bridge.operation_busy() and controller._validation_timer.is_stopped() else 0
		if stable >= 12: return
	check(false, "The workflow exceeded its bounded wait")

func ok(result: Dictionary) -> bool: return check(result.get("ok", false), str(result.get("error", "Rule command failed")))
func check(value: bool, message: String) -> bool:
	if not value: failed = true; push_error("RULE_AUTHORING_JOURNEY_FAILED: " + message)
	return value
