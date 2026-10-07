extends RefCounted

var shell
var view: ProvidenceRuleAuthoringEditor
var controller
var capture: Callable
var idle: Callable

func run(editor, workbench, commands, snapshot: Callable, settle: Callable) -> void:
	shell = editor; view = workbench; controller = commands; capture = snapshot; idle = settle
	await sections()
	await catalog_states()
	await picker_states()
	await draft_states()
	await operation_states()
	await preload("res://tools/rule_gate_navigation.gd").new().run(shell, view, Callable(self, "settle"), capture)
	await theme_states()

func snap(state: String, evidence: String) -> void: await capture.call(view, state, evidence)
func settle() -> void: await idle.call(controller)
func custom_id() -> String: return "classic.%s.%d" % [view.rule_kind, 20 if view.rule_kind == "race" else 21]

func sections() -> void:
	for button in view.get_node("%SectionTabs").get_children():
		var section := str(button.get_meta("section"))
		view.show_section(section); await settle()
		await snap(section.to_lower().replace(" & ", "-"), "Real complete form, populated through atomic Rule commands.")
		var scroll: ScrollContainer = view.get_node("%RuleDetailScroll")
		if scroll.get_v_scroll_bar().max_value > scroll.size.y:
			scroll.scroll_vertical = int(scroll.get_v_scroll_bar().max_value)
			await snap(section.to_lower().replace(" & ", "-") + "-bottom", "Remaining fixed controls are reachable through the section scroll.")
	view.show_section("Profile")

func catalog_states() -> void:
	await controller.open_rule("classic.%s.1" % view.rule_kind); await settle()
	await snap("stock", "Real protected application source; Duplicate stages a reviewed custom destination.")
	var discovery = shell._commands._discovery
	view.get_node("%FindAllUses").pressed.emit(); await settle()
	assert(discovery._view.visible and discovery._view._record.identity == view.current_selection())
	assert(discovery._view._record.scope == "scenario" and int(discovery._view._page.total) == view._uses_total)
	await snap("stock-links", "Protected stock-equivalent mechanics still follow the exact effective scenario identity and its callers.")
	discovery._view.close_view(); await settle()
	await controller.open_rule("classic.%s.30" % view.rule_kind); await settle()
	await snap("empty", "Real vacant fixed custom identity; create through the reviewed allocation.")
	await controller.open_rule(custom_id()); await settle()
	var search: LineEdit = view.get_node("%RecordSearch")
	search.text = "Wayfinder" if view.rule_kind == "caste" else "Dune"; search.text_changed.emit(search.text)
	await view.get_tree().create_timer(0.25).timeout; await settle()
	await snap("filtered", "Complete bounded catalog search retains exact current identity.")
	search.text = "No matching rule"; search.text_changed.emit(search.text)
	await view.get_tree().create_timer(0.25).timeout; await settle()
	await snap("no-results", "Empty clean search clears details and stale previews.")
	search.text = ""; search.text_changed.emit("")
	await view.get_tree().create_timer(0.25).timeout; await settle()
	await controller.open_rule(custom_id()); await settle()

func picker_states() -> void:
	var field := "defaultIconSet" if view.rule_kind == "race" else "defaultIcon"
	controller._references.open_picker(field, -1); await settle()
	await snap("picker", "Current signed stored identity and exact artwork preselected; browsing does not write.")
	var picker = controller._references._picker
	picker.get_node("%ShowUnavailable").button_pressed = true
	var search: LineEdit = picker.get_node("%Search")
	search.text = "32767"; search.text_changed.emit(search.text)
	await view.get_tree().create_timer(0.25).timeout; await settle()
	await snap("picker-no-results", "No-result picker clears stale details and acceptance.")
	picker.cancel(false)
	if view.rule_kind == "caste":
		view.show_section("Equipment"); controller._references.open_picker("startingItem", 0); await settle()
		await snap("item-picker", "Nested item picker names the exact fixed slot and displays the accepted item preview.")
		picker.cancel(false)
	view.show_section("Profile")

func draft_states() -> void:
	var name: LineEdit = view.form.control_for(["definition", "name"])
	name.text += " · local draft"; name.text_changed.emit(name.text); await settle()
	await snap("dirty", "Real local edit; canonical definition is unchanged until Apply.")
	view.form.control_for(["definition", "attributeLimits", 0]).value = 20
	view.form.control_for(["definition", "attributeLimits", 1]).value = 3
	await controller.validate_draft(); await settle()
	await snap("invalid", "Core rejects the changed minimum/maximum pair and retains the complete draft.")
	view.discard_draft(); await settle()
	var field := "defaultIconSet" if view.rule_kind == "race" else "defaultIcon"
	view.draft.edit_path(["definition", field], 32767); view.selection_changed.emit(view.selected_definition())
	await settle()
	await snap("missing", "Real missing exact resource for a local signed value; no fallback or mutation.")
	controller._references.open_picker(field, -1); await settle()
	var picker = controller._references._picker
	picker.get_node("%ShowUnavailable").button_pressed = true; await settle()
	var choices: ItemList = picker.get_node("%Choices")
	assert(int(picker.selected.get("value", 0)) == 32767)
	assert(picker.get_node("%UseSelection").disabled and not picker.get_node("%Availability").text.is_empty())
	assert(not choices.get_selected_items().is_empty())
	await settle(); await snap("picker-unavailable", "Unavailable signed current identity has an explanation and disabled Use.")
	picker.cancel(false); view.discard_draft(); await settle()
	name.text += " · retained draft"; name.text_changed.emit(name.text); await settle()
	view.show_submission({"ok": false, "error": "Controlled write rejection. Your complete draft is retained."})
	view.get_node("%RuleDetailScroll").scroll_vertical = 0
	await settle()
	assert(view.get_node("%SubmissionNotice").visible and view.get_node("%SubmissionNotice").text.contains("Controlled write rejection"))
	await snap("failure", "Controlled known rejection presentation; failure boundaries are exercised in the real native journey.")
	assert(view.has_unapplied_changes())
	view.show_submission({"ok": true})
	assert(shell._operations.begin(shell._bridge, "Apply " + view.rule_kind.capitalize()))
	shell._operations.finish({"ok": false, "outcomeUnknown": true}, true)
	view.show_submission({"ok": false, "outcomeUnknown": true, "pendingMutation": true, "error": "The original Apply acknowledgement is uncertain. Check its result; do not repeat the write."})
	await settle()
	assert(view._locked and view.get_node("%CheckOriginalResult").visible and view.get_node("%ApplyRule").disabled)
	assert(shell._commands._bar.undo_button.disabled and shell._commands._bar.redo_button.disabled)
	assert(view.get_node("%DraftStatus").text.contains("uncertain"))
	assert(shell._commands._bar.get_node("Save").disabled and shell._commands._bar.get_node("Compile").disabled)
	await snap("uncertain", "Controlled recovery presentation with global write lock; exact receipt/no-replay is independently exercised.")
	shell._operations.reset_session(); shell._commands.set_history(true, false)
	view.show_submission({"ok": true}); view.discard_draft(); await settle()

func operation_states() -> void:
	await controller._records.review_record("new"); await settle()
	await snap("allocation", "Core-derived vacant destination and explicit local staging; no occupied ID is replaced.")
	controller._records._review.cancel()
	await controller._records.review_record("clear"); await settle()
	await snap("clear-review", "Core-derived incoming-use impact; fixed identity and callers survive Clear.")
	controller._records._review.cancel()
	await shell._operations.run_workflow(shell._bridge, "Load Rules", loading)
	await controller.reload(); await controller.open_rule(custom_id()); await settle()

func loading(_operation) -> Dictionary:
	view.bind_document({}); view.show_catalog_loading()
	assert(view.current_selection().is_empty() and view.get_node("%RecordStatus").text.contains("Loading"))
	assert(not view.get_node("%RecordStatus").text.contains("draft kept"))
	await snap("loading", "Initial loading inside the actual global read-operation lease; no stale record.")
	return {"ok": true}

func theme_states() -> void:
	for mode in ["light", "high-contrast"]:
		for density in ["balanced", "compact"]:
			view.apply_theme(mode, density)
			await snap("regression-" + mode + "-" + density, "Contrast and layout regression only; certified form gate is dark/balanced.")
	view.apply_theme("dark", "balanced")
