class_name ProvidenceScenarioSectionEditor
extends VBoxContainer

const SOURCE_FIELDS := {"startLocation.map":"ChooseStartupLand", "startLocation.coordinate.x":"StartupX",
		"startLocation.coordinate.y":"StartupY", "startup.name":"ScenarioName", "startup.markerFilename":"MarkerFile",
		"startup.recommendedPartyLevels":"RecommendedLevel", "startup.maximumPartyLevels":"MaximumLevel",
		"startup.creatorUserCheck":"CreatorUserCheck", "campaign.contact.title":"ContactTitle",
		"campaign.contact.email":"ContactEmail", "campaign.contact.web":"ContactWeb", "campaign.contact.date":"ContactDate",
		"campaign.contact.fee":"ContactFee", "campaign.author":"ContactAuthor", "campaign.version":"ContactVersion",
		"campaign.description":"ContactDescription", "security.segment1":"CodeSegment1", "security.segment2":"CodeSegment2"}

signal document_applied(result: Dictionary)
signal route_requested(tab_index: int)
signal map_open_requested(identity: String)
signal projection_applied(projection: Dictionary)

const ROUTE_TABS := {"StartupTab": "scenario.startup", "RestrictionsTab": "scenario.restrictions",
	"ContactTab": "scenario.contact", "SecurityTab": "scenario.registration", "GlobalMacrosTab": "scripts.global-macros",
	"Assets": "assets.project-assets", "Spells": "rules.spells", "Races": "rules.races", "Castes": "rules.castes"}

@export var stable_route_id := "scenario.startup"
@export var projection_method := "scenario-startup.open"
@export var write_method := "scenario-startup.update"
@export var section_title := "Startup"

var controller := preload("res://src/scenario_section_controller.gd").new()
var applied: Dictionary = {}
var _baseline: Dictionary = {}
var _valid := false
var _busy := false
var _unknown := false
var _binding := false
var _refresh_required := false
var _validation_delay: Timer


func _ready() -> void:
	_validation_delay = Timer.new()
	_validation_delay.one_shot = true
	_validation_delay.wait_time = 0.25
	add_child(_validation_delay)
	_validation_delay.timeout.connect(controller.validate)
	controller.projection_applied.connect(projection_applied.emit)
	for name in ROUTE_TABS:
		var button := find_child(name, true, false) as Button
		if button != null:
			button.disabled = ROUTE_TABS[name] == stable_route_id
			button.pressed.connect(route_requested.emit.bind(ProvidenceRouteCatalog.tab_for_route(ROUTE_TABS[name])))
	for field in editing_nodes():
		if field is LineEdit: field.text_changed.connect(func(_value: String): draft_changed())
		elif field is TextEdit: field.text_changed.connect(draft_changed)
	find_child("ApplySection", true, false).pressed.connect(controller.apply)
	find_child("DiscardSection", true, false).pressed.connect(discard_draft)
	find_child("CopyDraft", true, false).pressed.connect(func(): DisplayServer.clipboard_set(preload("res://src/native_json.gd").stringify(draft_token())))
	text_field("SectionSearch").text_changed.connect(_filter_sections)
	find_child("ResolveSection", true, false).pressed.connect(controller.resolve_original_result)
	var disclosure := find_child("EvidenceDisclosure", true, false) as Button
	disclosure.toggled.connect(func(expanded: bool): find_child("EvidenceDetails", true, false).visible = expanded)
	clear_projection()


func configure_operations(operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	controller.initialize(self, operations, read_bridge)


func configure_authoring(accept_draft: Callable) -> void:
	controller.configure_authoring(accept_draft)


func refresh_workbench(operation: ProvidenceEditorOperation = null) -> Dictionary:
	return await controller.reload(operation)


func reload(_bridge, _preferred = "", borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	return await controller.reload(borrowed)


func teardown_session() -> void:
	controller.teardown()


func clear_selection() -> void:
	controller.teardown()


func clear_projection() -> void:
	applied.clear()
	var evidence := find_child("SourceEvidence", true, false) as Label
	if evidence != null: evidence.text = ""
	_baseline.clear()
	_valid = false
	_unknown = false
	_refresh_required = false
	_binding = true
	for field in editing_nodes(): field.text = ""
	clear_extra_state()
	_binding = false
	set_interaction(false)
	status("Open a project to edit this section.")
	document_applied.emit({})


func set_projection(result: Dictionary) -> void:
	var scroll := find_child("WorkbenchScroll", true, false) as ScrollContainer
	var position := scroll.scroll_vertical
	_binding = true
	applied = result.duplicate(true)
	render_projection(applied)
	_baseline = draft_token()
	_binding = false
	_valid = false
	_unknown = false
	_refresh_required = false
	set_interaction(false)
	scroll.set_deferred("scroll_vertical", position)
	status("Saved")
	document_applied.emit(applied.duplicate(true))


func acknowledge_saved(revision: int) -> void:
	applied["revision"] = revision
	_baseline = draft_token()


func discard_draft() -> void:
	if can_edit(): set_projection(applied)


func has_unapplied_changes() -> bool:
	return not applied.is_empty() and draft_token() != _baseline


func draft_token() -> Dictionary:
	var result := extra_draft_token()
	for field in editing_nodes(): result[str(field.name)] = field.text
	return result


func draft_changed() -> void:
	if _binding: return
	_valid = false
	_refresh_actions()
	status("Checking draft…" if has_unapplied_changes() else "Saved section · edit a field to enable Apply.")
	_validation_delay.start()


func schedule_validation() -> void:
	_validation_delay.start()


func accept_validation(valid: bool, error: String) -> void:
	_valid = valid
	status(error if not valid else "Draft ready · Apply commits this section as one edit." if has_unapplied_changes() else "Saved section · edit a field to enable Apply.")
	_refresh_actions()


func set_interaction(busy: bool) -> void:
	_busy = busy
	for field in editing_nodes(): field.editable = not busy and not applied.is_empty() and not _unknown and not _refresh_required
	set_extra_interaction(can_edit())
	_refresh_actions()
	if not busy and has_unapplied_changes() and not _valid and not _unknown:
		_validation_delay.start()


func can_edit() -> bool:
	return not _busy and not _unknown and not _refresh_required and not applied.is_empty()


func can_commit() -> bool:
	return _valid and has_unapplied_changes() and not _busy and not _unknown and not _refresh_required


func _refresh_actions() -> void:
	find_child("ApplySection", true, false).disabled = not can_commit()
	find_child("DiscardSection", true, false).disabled = not has_unapplied_changes() or _busy or _unknown or _refresh_required
	find_child("CopyDraft", true, false).visible = _unknown
	find_child("ResolveSection", true, false).visible = _unknown or _refresh_required
	find_child("ResolveSection", true, false).text = "Resolve outcome" if _unknown else "Refresh saved section"
	find_child("ResolveSection", true, false).disabled = _busy


func show_result(response: Dictionary) -> void:
	if response.get("outcomeUnknown", false):
		_unknown = true
		set_interaction(false)
		status("Outcome unknown. Use Resolve outcome to check the original durable result. Your draft is retained; Apply is locked.")
	elif response.has("viewRefreshError"):
		_refresh_required = true
		set_interaction(false)
		status(str(response.viewRefreshError) + " Refresh the saved section before further editing.")
	elif not response.get("ok", false): status(str(response.get("error", "The section could not be saved. Your draft is retained.")))


func status(message: String) -> void:
	find_child("DraftStatus", true, false).text = message


func applied_revision() -> int:
	return int(applied.get("revision", 0))


func route_identity() -> String: return stable_route_id
func current_selection() -> String: return stable_route_id if not applied.is_empty() else ""
func workbench_title() -> String: return "SCENARIO / " + section_title.to_upper()
func apply_label() -> String: return "Apply " + section_title
func present_selection() -> void: document_applied.emit(applied.duplicate(true))
func commit_selected() -> void: await controller.apply()
func command_state(command_id: String) -> String:
	return "working" if command_id in [projection_method, write_method] else "not-applicable"
func editing_nodes() -> Array: return []
func extra_draft_token() -> Dictionary: return {}
func clear_extra_state() -> void: pass
func set_extra_interaction(_enabled: bool) -> void: pass
func render_projection(_result: Dictionary) -> void: pass
func draft_params() -> Dictionary: return {}
func complete_projection(_operation: ProvidenceEditorOperation, response: Dictionary) -> Dictionary: return response


func text_field(name: String) -> LineEdit:
	return find_child(name, true, false) as LineEdit


func text_editor(name: String) -> TextEdit:
	return find_child(name, true, false) as TextEdit


func integer_field(name: String, maximum: int) -> Dictionary:
	var value := text_field(name).text.strip_edges()
	if not value.is_valid_int() or int(value) < 0 or int(value) > maximum:
		return {"localError": "%s must be an integer from 0 through %d." % [name.capitalize(), maximum]}
	return {"value": int(value)}


func _filter_sections(query: String) -> void:
	for name in ROUTE_TABS:
		var button := find_child(name, true, false) as Button
		if button != null: button.visible = query.is_empty() or button.text.to_lower().contains(query.to_lower())


func unlock_recovery() -> void:
	_unknown = false
	_refresh_required = false
	set_interaction(false)


func restore_draft_token(token: Dictionary) -> void:
	_binding = true
	for field in editing_nodes(): field.text = str(token.get(str(field.name), field.text))
	restore_extra_draft(token)
	_binding = false
	draft_changed()


func restore_extra_draft(_token: Dictionary) -> void: pass


func read_navigation_state() -> Dictionary:
	var focus := get_viewport().gui_get_focus_owner()
	return {"scroll": find_child("WorkbenchScroll", true, false).scroll_vertical,
		"focus": str(get_path_to(focus)) if focus != null and is_ancestor_of(focus) else ""}


func restore_navigation_state(state: Dictionary) -> bool:
	find_child("WorkbenchScroll", true, false).set_deferred("scroll_vertical", int(state.get("scroll", 0)))
	var focus := get_node_or_null(str(state.get("focus", ""))) as Control
	if focus != null and focus.is_visible_in_tree(): focus.call_deferred("grab_focus")
	return true


func focus_source(_identity: String, _slot: int, field: String) -> bool:

	var control := find_child(str(SOURCE_FIELDS.get(field, "")), true, false) as Control if SOURCE_FIELDS.has(field) else null
	if control == null: return false
	find_child("WorkbenchScroll", true, false).ensure_control_visible(control)
	control.grab_focus()
	return control.has_focus()

func supports_source_field(field: String) -> bool:
	return SOURCE_FIELDS.has(field)
