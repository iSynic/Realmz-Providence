extends HBoxContainer

signal context_changed(context: Dictionary)
signal commit_requested
signal recovery_requested
signal guard_resolved(proceed: bool)
signal reference_requested(field: String)
signal reference_open_requested(field: String)
signal record_operation_requested(action: String)
signal library_operation_requested(action: String)
signal comparison_requested

const BrowserState = preload("res://src/monster_browser_state.gd")
const PopulationPlan = preload("res://src/monster_population_plan.gd")
const LibraryDraft = preload("res://src/monster_library_record_draft.gd")
var browser := BrowserState.new()
var _bridge
var _operations: ProvidenceEditorOperation
var _active := ""
var _plan_generation := 0
var plan_loading := false
var last_plan_metrics: Dictionary = {}
var draft = preload("res://src/monster_record_draft.gd").new()
var commit_handler: Callable
var _authoring := false
var _recovery_locked := false
var _guarding := false
var _bound_art: Dictionary = {}
var _saved_art: Dictionary = {}
var _guard_focus: Control

var _chosen_references: Dictionary = {}
var _protected_library := false
var _navigation_reference := ""
var _attachment_generation := 0
var library_drag = preload("res://src/monster_library_drag.gd").new()

@onready var scenario = $Inventories/ScenarioMonsterList
@onready var library = $Inventories/MonsterLibraryList
@onready var form = $DetailScroll/Details/RecordForm
@onready var preview = $DetailScroll/Details/LibraryPreview
@onready var custom_library = $DetailScroll/Details/CustomLibrary
@onready var status: Label = $DetailScroll/Details/SelectionStatus
@onready var multiple = $DetailScroll/Details/MultipleSelection


func _ready() -> void:
	library_drag.initialize(self)
	$Failure/Body/Actions/Compare.pressed.connect(comparison_requested.emit)
	$DraftComparison.rebase_requested.connect(rebase_draft)
	draft.changed.connect(_refresh_draft_footer)
	form.field_edited.connect(func(path: String, value: Variant): draft.edit_field(path, value))
	form.description_edited.connect(func(text: String): draft.edit_description(text))
	form.bestiary_edited.connect(func(hidden: bool): draft.edit_bestiary(hidden))
	form.preferred_id_edited.connect(func(value: Variant):
		if draft.has_method("edit_preferred_id"): draft.edit_preferred_id(value))
	form.reference_requested.connect(reference_requested.emit)
	form.reference_open_requested.connect(reference_open_requested.emit)
	form.action_requested.connect(record_operation_requested.emit)
	scenario.get_node("Header/NewMonster").pressed.connect(func(): record_operation_requested.emit("NewMonster"))
	library.get_node("Header/NewLibrary").pressed.connect(func(): library_operation_requested.emit("NewLibrary"))
	for direction in ["UndoLibrary", "RedoLibrary"]:
		library.get_node("History/" + direction).pressed.connect(func(): library_operation_requested.emit(direction))
	multiple.operation_requested.connect(library_operation_requested.emit)
	for action in ["CopyStock", "CopyVisible", "CopyCustom"]:
		library.get_node("Header/PopulateScenario/Menu/Actions/" + action).pressed.connect(func():
			library.get_node("Header/PopulateScenario").close_menu()
			library_operation_requested.emit(action))
	form.apply_requested.connect(func(): commit_requested.emit())
	form.discard_requested.connect(discard_draft)
	$DraftGuard.add_button("Discard & Continue", true, "discard")
	$DraftGuard.confirmed.connect(_apply_guard)
	$DraftGuard.custom_action.connect(_discard_guard)
	$DraftGuard.canceled.connect(_cancel_guard)
	$Failure/Body/Actions/Close.pressed.connect(_close_failure)
	$Failure.close_requested.connect(_close_failure)
	$Failure/Body/Actions/CheckResult.pressed.connect(func(): recovery_requested.emit())
	form.get_node("%CheckResult").pressed.connect(func(): recovery_requested.emit())
	library.get_node("Header/PopulateScenario").fallback_controls.append(scenario.get_node("%ScenarioSearch"))
	browser.detail_cleared.connect(_scenario_cleared)
	browser.detail_presenter = _show_scenario
	scenario.record_selected.connect(_scenario_result)
	library.selection_cleared.connect(_library_cleared)
	library.selection_presenter = _present_library_selection
	library.entry_requested.connect(func():
		_active = "library"
		_clear_display())
	multiple.clear_requested.connect(library.clear_multiple_selection)
	form.set_requested.connect(_switch_set)


func configure_operations(operations: ProvidenceEditorOperation) -> void:
	_operations = operations


func configure_authoring() -> void:
	_authoring = true
	get_node("DetailScroll/Details/MultipleSelection").copy_enabled = true
	browser.navigation_guard = request_draft_navigation
	get_node("Inventories/MonsterLibraryList").navigation_guard = request_draft_navigation


func attach(bridge, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	_attachment_generation += 1
	_bridge = bridge
	clear_selection()
	scenario.get_node("Header/NewMonster").disabled = not has_scenario_destination() or not _authoring
	browser.attach(bridge, _operations)
	if bridge != null:
		var page := await browser.load_page(0, borrowed)
		if not page.get("ok", false):
			scenario.bind_state(browser, has_scenario_destination())
			return page
	scenario.bind_state(browser if bridge != null else null, has_scenario_destination())
	var browser_token := browser.selection_token()
	var library_page: Dictionary = await library.attach(bridge, _operations, borrowed)
	library.get_node("Header/NewLibrary").disabled = library.revision < 0 or not _authoring
	for action in ["CopyStock", "CopyVisible", "CopyCustom"]:
		library.get_node("Header/PopulateScenario/Menu/Actions/" + action).disabled = library.revision < 0 or not _authoring or not has_scenario_destination()
	if library_page.get("outcomeUnknown", false): return library_page
	if browser_token != browser.selection_token():
		return {"ok": false, "stale": true, "error": "The scenario search changed while the Library loaded."}
	$Thumbnails.attach(bridge, [library, scenario], _operations)
	return {"ok": true} if bridge == null else library_page


func selection_snapshot() -> Dictionary:
	var entry: Dictionary = library.current_entry().get("entry", {})
	return {"setId": browser.set_id, "nativeId": browser.native_id,
		"active": _active, "libraryIdentity": entry.get("identity", ""),
		"libraryScope": "personal" if entry.get("ownership", "") == "custom" else "stock",
		"scenarioQuery": browser.query, "scenarioOffset": browser.offset,
		"scenarioScroll": scenario.get_node("InventoryScroll").scroll_vertical,
		"detailScroll": $DetailScroll.scroll_vertical, "libraryPage": library.navigation_snapshot(),
		"detailSection": form.current_section(), "sectionScroll": form.get_node("%BodyScroll").scroll_vertical,
		"focusedReference": _navigation_reference}


func restore_selection(selection: Dictionary, borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if not selection.is_empty():
		var opened := await browser.restore_selection(selection, borrowed)
		scenario.bind_state(browser, has_scenario_destination())
		scenario.get_node("InventoryScroll").set_deferred("scroll_vertical", int(selection.get("scenarioScroll", 0)))
		_scenario_result(opened)
		if not opened.get("ok", false): return opened
	if selection.has("libraryPage"):
		var page: Dictionary = await library.restore_navigation(selection.libraryPage, borrowed)
		if not page.get("ok", false): return page
	if str(selection.get("active", "")) == "library" and not str(selection.get("libraryIdentity", "")).is_empty():
		if str(library.current_entry().get("entry", {}).get("identity", "")) != str(selection.libraryIdentity):
			var response: Dictionary = await library.open_entry(str(selection.libraryIdentity), borrowed)
			if not response.get("ok", false): return response
	if str(selection.get("active", "")) == "scenario": scenario.set_selection_active(true)
	form.show_section(str(selection.get("detailSection", "Overview")))
	form.get_node("%BodyScroll").set_deferred("scroll_vertical", int(selection.get("sectionScroll", 0)))
	$DetailScroll.set_deferred("scroll_vertical", int(selection.get("detailScroll", 0)))
	_navigation_reference = str(selection.get("focusedReference", ""))
	if not _navigation_reference.is_empty(): form.focus_reference.call_deferred(_navigation_reference)
	return {"ok": true}


func clear_selection() -> void:
	browser.cancel_pending_read()
	library.cancel_pending_selection()
	_active = ""
	browser.native_id = -1
	browser.detail.clear()
	_clear_display()
	scenario.set_selection_active(false)
	library.set_selection_active(false)


func _clear_display() -> void:
	$ReferencePicker.cancel()
	_chosen_references.clear()
	_protected_library = false
	_navigation_reference = ""
	draft.clear()
	_bound_art.clear()
	_saved_art.clear()
	_plan_generation += 1
	plan_loading = false
	multiple.clear_items()
	multiple.hide()
	form.clear_projection()
	preview.clear_projection()
	custom_library.clear_projection()
	custom_library.hide()
	form.hide()
	preview.hide()
	status.text = "No monster selected."
	status.show()
	context_changed.emit({})


func _scenario_cleared() -> void:
	library.cancel_pending_selection()
	if plan_loading:
		_clear_display()
	if _active == "scenario":
		_clear_display()


func _library_cleared() -> void:
	if _active == "library":
		_clear_display()


func _show_scenario(result: Dictionary, operation: ProvidenceEditorOperation = null) -> Dictionary:
	library.cancel_pending_selection()
	_clear_display()
	_active = "scenario"
	var generation := _plan_generation
	var browser_token := browser.selection_token()
	var current := func(): return is_instance_valid(self) and generation == _plan_generation and browser.selection_token() == browser_token and browser.detail == result
	var request: Callable = _bridge.request if operation == null else operation.request
	var art := await preload("res://src/monster_detail_loader.gd").load_scenario(request, result, current)
	if not art.get("ok", false): return art
	form.set_projection(result, art.normalFlag)
	form.set_reward_art(art.rewards)
	form.set_appearance(art.portrait)
	_bound_art = art
	_saved_art = art.duplicate(true)
	_activate_draft(false)
	draft.bind(result, art.normalFlag)
	draft.document["normalNotOnMenu"] = art.normalFlag
	form.configure_editing(_authoring, art.normalFlag != null)
	form.configure_context(result, false)
	_refresh_draft_footer()
	form.show()
	status.hide()
	scenario.set_selection_active(true)
	library.set_selection_active(false)
	context_changed.emit({"kind": "scenario-monster", "result": result.duplicate(true)})
	return {"ok": true}


func _scenario_result(response: Dictionary) -> void:
	if response.get("busy", false) or response.get("stale", false) or response.get("connectionChanged", false) or response.get("canceled", false): return
	if not bool(response.get("ok", false)):
		_clear_display()
		_active = "scenario"
		form.show_missing(browser.set_id, browser.native_id, str(response.get("error", "Monster unavailable.")))
		form.show()
		status.hide()
		library.set_selection_active(false)


func _switch_set(set_id: int) -> void:
	var response := await browser.switch_set(set_id)
	scenario.render_catalog()
	scenario.set_selection_active(true)
	_scenario_result(response)


func _present_library_selection(operation: ProvidenceEditorOperation) -> Dictionary:
	if library.selected_identities().size() > 1: return await _show_multiple(library.selected_items(), operation)
	var entry: Dictionary = library.current_entry()
	return {"ok": true} if entry.is_empty() else await _show_library(entry, operation)


func _show_library(result: Dictionary, operation: ProvidenceEditorOperation = null) -> Dictionary:
	_clear_display()
	_active = "library"
	if browser.revision < 0 or result.get("projectRevision") != browser.revision:
		status.text = "Project changed. Reload and select the Library entry again."
		return {"ok": false, "stale": true, "error": status.text}
	scenario.set_selection_active(false)
	library.set_selection_active(true)
	var generation := _plan_generation
	var current := func(): return is_instance_valid(self) and generation == _plan_generation
	var entry: Dictionary = result.get("entry", {})
	var request: Callable = _bridge.request if operation == null else operation.request
	var art := await preload("res://src/monster_detail_loader.gd").load_art(request, browser.revision, int(entry.get("template", {}).get("iconId", 0)), current)
	if not art.get("ok", false): return art
	if entry.get("ownership") in ["built-in", "custom"]:
		_activate_draft(true)
		var document := _library_document(result)
		draft.bind(document, entry.get("template", {}).get("notOnMenu"))
		_bound_art = art
		_saved_art = art.duplicate(true)
		_protected_library = bool(result.get("protected", true))
		_render_current_draft()
		form.show()
		status.hide()
	else:
		status.text = "Library detail has an unsupported ownership state."
	context_changed.emit({"kind": "monster-library-entry", "result": result.duplicate(true)})
	return {"ok": true}


func _show_multiple(items: Array, operation: ProvidenceEditorOperation = null) -> Dictionary:
	var bind_started := Time.get_ticks_usec()
	_clear_display()
	_active = "library"
	scenario.set_selection_active(false)
	library.set_selection_active(true)
	multiple.set_items(items)
	multiple.show()
	status.hide()
	if not has_scenario_destination():
		multiple.set_plan({"ok": false, "error": "Open a scenario before reviewing destinations or copying Library entries."})
		context_changed.emit({"kind": "monster-library-selection", "count": items.size(), "planAvailable": false})
		return {"ok": true}
	plan_loading = true
	multiple.begin_plan()
	var generation := _plan_generation
	var project_revision: int = browser.revision
	var library_revision: int = library.revision
	var metrics: Dictionary = {}
	metrics["summaryInitialBindingUsec"] = Time.get_ticks_usec() - bind_started
	last_plan_metrics = metrics
	var obsolete := func(): return not is_instance_valid(self) or generation != _plan_generation or project_revision != browser.revision or library_revision != library.revision
	var plan := await PopulationPlan.load_plan(_bridge if operation == null else operation, library.selected_identities(), project_revision, library_revision, obsolete, metrics)
	if plan.get("outcomeUnknown", false):
		plan_loading = false
		multiple.set_plan(plan)
		return plan
	if obsolete.call():
		if is_instance_valid(self) and generation == _plan_generation:
			plan_loading = false
			multiple.set_plan({"ok": false, "error": "Source revisions changed. Select again to refresh destinations."})
		return {"ok": false, "stale": true, "error": "The Library selection changed while planning destinations."}
	var started := Time.get_ticks_usec()
	multiple.set_plan(plan)
	metrics["summaryTargetBindingUsec"] = Time.get_ticks_usec() - started
	metrics["maxStepUsec"] = maxi(int(metrics.get("maxStepUsec", 0)), Time.get_ticks_usec() - started)
	plan_loading = false
	context_changed.emit({"kind": "monster-library-selection", "count": items.size(), "planAvailable": bool(plan.get("ok", false))})
	return plan


func has_unapplied_changes() -> bool:
	return draft.has_changes() or _recovery_locked


func submitted_draft() -> Dictionary:
	return draft.submission()


func authoring_generation() -> Vector2i:
	return Vector2i(_plan_generation, draft.generation)


func draft_revision() -> int:
	return int(draft.document.get("revision", -1))


func draft_domain() -> String:
	return "library" if draft is LibraryDraft else "project"


func accept_saved_document(submitted: Dictionary, saved: Dictionary) -> void:
	_recovery_locked = false
	_saved_art = _bound_art.duplicate(true)
	if draft_domain() == "library":
		draft.accept(submitted, _library_document(saved))
		library.revision = int(saved.get("revision", -1))
	else:
		draft.accept(submitted, saved)
		browser.revision = int(saved.get("revision", -1))
		browser.detail = saved.duplicate(true)
	_render_current_draft()
	$Failure.hide()


func discard_draft() -> void:
	if _recovery_locked or draft.document.is_empty(): return
	var saved: Dictionary = draft.document.duplicate(true)
	draft.bind(saved, saved.get("normalNotOnMenu"))
	_chosen_references.clear()
	_bound_art = _saved_art.duplicate(true)
	_render_current_draft()


func _render_current_draft() -> void:
	var section: String = form.current_section()
	var scroll: int = form.get_node("%BodyScroll").scroll_vertical
	var result: Dictionary = draft.current_document()
	for path in _chosen_references:
		if path.begins_with("spells.") or path.begins_with("items."):
			var family := str(path).get_slice(".", 0)
			var rows: Array = result.get("slotPreview", {}).get(family, []).duplicate(true)
			var slot := int(str(path).get_slice(".", 1))
			rows = rows.filter(func(row): return int(row.get("slot", -1)) != slot)
			var choice: Dictionary = _chosen_references[path]
			rows.append({"slot": slot, "rawId": choice.value, "target": choice.identity, "label": choice.label, "resolution": "resolved"})
			if not result.has("slotPreview"): result["slotPreview"] = {}
			result.slotPreview[family] = rows
	form.set_projection(result, result.get("normalNotOnMenu"))
	form.set_reward_art(_bound_art.get("rewards", []))
	form.set_appearance(_bound_art.get("portrait", {}))
	form.configure_editing(_authoring and not _recovery_locked and not _protected_library, result.get("normalNotOnMenu") != null)
	form.configure_context(result, draft_domain() == "library", _protected_library, _authoring and not _recovery_locked, has_scenario_destination())
	form.show_section(section)
	form.get_node("%BodyScroll").set_deferred("scroll_vertical", scroll)
	_refresh_draft_footer()


func _refresh_draft_footer() -> void:
	library.set_history_locked(_recovery_locked)
	scenario.get_node("Header/NewMonster").disabled = not has_scenario_destination() or not _authoring or _recovery_locked
	library.get_node("Header/NewLibrary").disabled = library.revision < 0 or not _authoring or _recovery_locked
	for action in ["CopyStock", "CopyVisible", "CopyCustom"]:
		library.get_node("Header/PopulateScenario/Menu/Actions/" + action).disabled = library.revision < 0 or not _authoring or _recovery_locked or not has_scenario_destination()
	var count: int = draft.fields.size() + (1 if draft.description != null else 0) + (1 if draft.normal_not_on_menu != null else 0)
	if draft_domain() == "library" and draft.preferred_id != null: count += 1
	var message := "%d unapplied changes · Apply updates this record and its reviewed shared fields" % count if count else "Saved · No unapplied changes"
	if _protected_library: message = "Protected Library source · Customize to edit · Copies require a reviewed allocation"
	if _recovery_locked: message = "Original result uncertain · Draft kept · Check result before continuing"
	form.show_draft_state(draft.has_changes(), message, _recovery_locked)
	form.get_node("%CheckResult").visible = _recovery_locked
	form.get_node("%CheckResult").disabled = not _recovery_locked


func show_submission_failure(response: Dictionary) -> void:
	if response.has("issues"): form.show_validation(response.issues)
	_recovery_locked = _recovery_locked or bool(response.get("outcomeUnknown", false))
	$Failure/Body/Message.text = str(response.get("error", "Your Monster draft could not be applied. It has been kept."))
	$Failure/Body/Actions/CheckResult.visible = _recovery_locked
	$Failure/Body/Actions/Compare.visible = not _recovery_locked and str(response.get("error", "")).to_lower().contains("revision")
	if _recovery_locked:
		form.configure_editing(false)
		form.configure_context(draft.current_document(), draft_domain() == "library", _protected_library, false)
	_refresh_draft_footer()
	$Failure.popup_centered(Vector2i(720, 240))
	$Failure/Body/Actions/Close.grab_focus()


func release_recovery_lock() -> void:
	_recovery_locked = false
	_render_current_draft()


func request_draft_navigation(destination: String) -> bool:
	if _recovery_locked: return false
	if not draft.has_changes(): return true
	if _guarding: return false
	_guarding = true
	_guard_focus = get_viewport().gui_get_focus_owner()
	$DraftGuard.dialog_text = "This Monster has unapplied changes. Apply or discard them before %s, or keep editing." % destination.to_lower()
	$DraftGuard.popup_centered(Vector2i(640, 200))
	$DraftGuard.get_cancel_button().grab_focus()
	var proceed: bool = await guard_resolved
	_guarding = false
	if not proceed and is_instance_valid(_guard_focus): _guard_focus.call_deferred("grab_focus")
	return proceed


func _apply_guard() -> void:
	if not commit_handler.is_valid(): return
	var response: Dictionary = await commit_handler.call()
	if not response.get("ok", false): return
	$DraftGuard.hide()
	guard_resolved.emit(not has_unapplied_changes())


func _discard_guard(action: StringName) -> void:
	if action != &"discard" or _recovery_locked: return
	discard_draft()
	$DraftGuard.hide()
	guard_resolved.emit(true)


func _cancel_guard() -> void:
	guard_resolved.emit(false)


func _close_failure() -> void:
	$Failure.hide()
	form.get_node("%CheckResult" if _recovery_locked else "%ApplyDraft").call_deferred("grab_focus")


func _activate_draft(library_context: bool) -> void:
	draft = preload("res://src/monster_library_record_draft.gd").new() if library_context else preload("res://src/monster_record_draft.gd").new()
	draft.changed.connect(_refresh_draft_footer)


func _library_document(result: Dictionary) -> Dictionary:
	var entry: Dictionary = result.get("entry", {})
	return {"entry": entry.duplicate(true), "revision": result.get("revision", -1),
		"projectRevision": result.get("projectRevision", -1), "setId": 0,
		"monster": entry.get("template", {}).duplicate(true), "description": {"text": entry.get("description", "")},
		"normalNotOnMenu": entry.get("template", {}).get("notOnMenu"),
		"preferredScenarioMonsterId": entry.get("preferredScenarioMonsterId"), "slotPreview": result.get("slotPreview", {})}


func reference_context(field: String) -> Dictionary:
	if draft.document.is_empty() or _recovery_locked or not has_scenario_destination(): return {}
	var record: Dictionary = draft.document.get("monster", {})
	var label := "Appearance" if field == "iconId" else preload("res://src/monster_review_labels.gd").field(field)
	var set_name: String = {0: "Normal", 1: "Monster", -1: "Mega"}.get(int(draft.document.get("setId", 0)), "Unknown")
	var destination := "Library · %s · %s" % [record.get("displayName", ""), label] if draft_domain() == "library" else "Monster %d · %s · %s" % [record.get("nativeId", -1), set_name, label]
	return {"field": field, "label": label, "destination": destination, "currentValue": draft.current_value(field),
		"origin": authoring_generation(), "projectRevision": browser.revision, "domain": draft_domain(),
		"identity": record.get("identity"), "section": form.current_section()}


func reference_context_matches(context: Dictionary) -> bool:
	return not context.is_empty() and not draft.document.is_empty() and not _recovery_locked and context.get("origin") == authoring_generation() and context.get("identity") == draft.document.get("monster", {}).get("identity") and context.get("projectRevision") == browser.revision and context.get("section") == form.current_section()


func accept_reference_choice(field: String, choice: Dictionary) -> void:
	if draft.current_value(field) == choice.value: return
	draft.edit_field(field, int(choice.value))
	_chosen_references[field] = choice.duplicate(true)
	var section: String = form.current_section()
	_render_current_draft()
	form.show_section(section)


func set_draft_appearance(appearance: Dictionary) -> void:
	_bound_art["portrait"] = appearance
	form.set_appearance(appearance)


func record_operation_context() -> Dictionary:
	if browser.revision < 0 or _recovery_locked: return {}
	return {"origin": authoring_generation(), "revision": browser.revision,
		"domain": draft_domain(), "setId": browser.set_id, "nativeId": browser.native_id,
		"destination": "Monster %d · %s" % [browser.native_id, {0: "Normal", 1: "Monster", -1: "Mega"}.get(browser.set_id, "Unknown")]}


func set_navigation_reference(field: String) -> void:
	_navigation_reference = field


func show_draft_comparison(saved: Dictionary) -> void:
	$Failure.hide()
	var document := _library_document(saved) if draft_domain() == "library" else saved
	$DraftComparison.begin(draft, document, authoring_generation(), str(reference_context("iconId").get("destination", "Monster")), form.get_node("%ApplyDraft"))


func rebase_draft(saved: Dictionary, keep: Array, origin: Vector2i, submitted: Dictionary) -> void:
	if origin != authoring_generation() or submitted != draft.submission() or _recovery_locked: return
	draft.rebase(saved, keep)
	if draft_domain() == "library": library.revision = int(saved.revision)
	else: browser.revision = int(saved.revision); browser.detail = saved.duplicate(true)
	_chosen_references.clear()
	_render_current_draft()


func library_operation_context(action: String) -> Dictionary:
	if browser.revision < 0 or library.revision < 0 or _recovery_locked: return {}
	var result := {"origin": authoring_generation(), "projectRevision": browser.revision,
		"libraryRevision": library.revision, "destination": "Monster Library", "setId": browser.set_id, "nativeId": browser.native_id}
	var entry: Dictionary = library.current_entry().get("entry", {})
	if not entry.is_empty():
		result.merge({"identity": entry.identity, "label": entry.label, "preferredId": entry.preferredScenarioMonsterId})
		if entry.get("origin", {}).get("kind") == "built-in-override": result.identity = entry.origin.sourceEntry if action == "Restore" else entry.identity
	if action in ["Transfer", "CopySelected"]: result["entryIds"] = library.selected_identities()
	elif action == "CopyStock": result["ownership"] = "built-in"
	elif action == "CopyCustom": result["ownership"] = "custom"
	elif action == "CopyVisible":
		var navigation: Dictionary = library.navigation_snapshot()
		result.merge({"ownership": navigation.get("scope", "all"), "query": navigation.get("query", "")})
	if action == "CopyToLibrary": result["label"] = draft.document.get("monster", {}).get("displayName", "")
	var label: String = str(result.get("label", "New entry"))
	result.destination = "Library · %s · %s" % [label, action.replace("Library", "").capitalize()]
	if action in ["Transfer", "CopySelected", "CopyStock", "CopyVisible", "CopyCustom"]:
		result.destination = "Library → Scenario · %s" % (label if action == "Transfer" else action.trim_prefix("Copy").capitalize() + " membership")
	elif action == "CopyToLibrary": result.destination = "Monster %d · %s → Custom Library entry" % [browser.native_id, label]
	return result


func has_scenario_destination() -> bool:
	return _bridge != null and (not _bridge.has_method("is_project_backed") or _bridge.is_project_backed())


func library_drag_context() -> Dictionary:
	if not _authoring or _recovery_locked or not has_scenario_destination(): return {}
	if browser.revision < 0 or library.revision < 0 or (_operations != null and _operations.busy): return {}
	return {"attachment": _attachment_generation, "projectRevision": browser.revision, "libraryRevision": library.revision}


func focus_authoring_field(field: String) -> bool:
	return form.focus_source_field("iconId" if field=="icon" else field)

func supports_source_field(field: String) -> bool:
	return form.supports_source_field("iconId" if field=="icon" else field)
