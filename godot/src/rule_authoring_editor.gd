class_name ProvidenceRuleAuthoringEditor
extends HBoxContainer

signal document_applied(result: Dictionary)
signal route_requested(tab_index: int)
signal navigation_requested(action: Callable)
signal catalog_requested(query: Dictionary)
signal catalog_applied(rows: Array, revision: int)
signal open_requested(identity: String)
signal record_requested(action: String)
signal draft_edited
signal selection_changed(definition: Dictionary)
signal recovery_requested
signal saved_version_requested
signal used_by_requested(reference: Dictionary)
signal target_requested(reference: Dictionary)
signal uses_page_requested(offset: int)
signal discovery_requested(direction: String)
signal source_requested(source: String)

@export var rule_kind := "race"
var form: VBoxContainer:
	get: return get_node("%RuleForm")
var draft = preload("res://src/rule_record_draft.gd").new()
var commit_handler: Callable
var open_handler: Callable
var source_handler: Callable
var restore_handler: Callable
var _query := {"kind": "race", "scope": "all", "query": "", "source": "authoring"}
var _rows: Array = []
var _locked := false
var _pending := false
var _valid := true
var _section := "Profile"
var _used_by: Array = []
var _outgoing: Array = []
var _uses_offset := 0
var _uses_total := 0

func _ready() -> void:
	resized.connect(queue_redraw)
	_query.kind = rule_kind
	%RuleSources.source_requested.connect(_request_source)
	%RuleSources.configure_requested.connect(func(): route_requested.emit(ProvidenceRouteCatalog.tab_for_route("scenario.startup")))
	%RuleSources.set_source(_query.source)
	for name in ["All sources", "Stock", "Scenario", "Empty slots"]: %OwnershipFilter.add_item(name)
	%OwnershipFilter.item_selected.connect(func(index: int): _query.scope = ["all", "stock", "scenario", "vacant"][index]; catalog_requested.emit(catalog_query()))
	%RecordSearch.text_changed.connect(func(text: String): _query.query = text; $SearchDelay.start())
	$SearchDelay.timeout.connect(func(): catalog_requested.emit(catalog_query()))
	%RecordList.item_selected.connect(_select_row)
	%NewRule.pressed.connect(_record.bind("new"))
	%DuplicateRule.pressed.connect(_record.bind("copy"))
	%ClearRule.pressed.connect(_record.bind("clear"))
	%ApplyRule.pressed.connect(commit_selected)
	%DiscardRule.pressed.connect(discard_draft)
	%CheckOriginalResult.pressed.connect(recovery_requested.emit)
	%ReviewSavedVersion.pressed.connect(saved_version_requested.emit)
	$Catalog/Routes.configure(route_identity())
	$Catalog/Routes.route_requested.connect(func(identity: String): route_requested.emit(ProvidenceRouteCatalog.tab_for_route(identity)))
	for button in %SectionTabs.get_children(): button.pressed.connect(show_section.bind(str(button.get_meta("section"))))
	%Uses.item_activated.connect(func(index: int): if index < _used_by.size(): used_by_requested.emit(_used_by[index]))
	%Outgoing.item_activated.connect(func(index: int): if index < _outgoing.size(): target_requested.emit(_outgoing[index]))
	%PreviousUses.pressed.connect(func(): uses_page_requested.emit(maxi(0, _uses_offset - 64)))
	%NextUses.pressed.connect(func(): uses_page_requested.emit(_uses_offset + 64))
	%FindAllUses.pressed.connect(func(): discovery_requested.emit("incoming"))
	%TraceCallers.pressed.connect(func(): discovery_requested.emit("trace"))
	form.field_edited.connect(func(path: Array, value: Variant):
		draft.edit_path(path, value); draft_edited.emit(); selection_changed.emit(selected_definition()))
	draft.changed.connect(_draft_changed)
	bind_document({})

func route_identity() -> String: return "rules." + rule_kind + "s"
func workbench_title() -> String: return "CHARACTERS & MAGIC / " + rule_kind.to_upper() + "S"
func apply_label() -> String: return "Apply " + rule_kind.capitalize()
func has_unapplied_changes() -> bool: return draft.dirty() or _pending
func can_apply_draft() -> bool: return not _locked and _valid and draft.dirty()
func catalog_query() -> Dictionary: return _query.duplicate(true)
func set_catalog_source(source: String) -> void:
	_query.source = source
	%RuleSources.set_source(source)

func _request_source(source: String) -> void:
	if has_unapplied_changes(): navigation_requested.emit(func(): source_requested.emit(source))
	else: source_requested.emit(source)
func selected_definition() -> Dictionary: return draft.definition().duplicate(true)
func current_selection() -> String: return str(draft.definition().get("id", ""))
func current_applied_identity() -> String: return current_selection()
func command_state(command: String) -> String:
	return "working" if command in [route_identity(), "rule.catalog", "rule.open-authoring", "rule.draft.apply"] else "unavailable"

func show_section(section: String) -> void:
	_section = section
	for page in form.get_children(): page.visible = page.get_meta("section", "") == section
	for button in %SectionTabs.get_children(): button.set_pressed_no_signal(button.get_meta("section", "") == section)
	%RuleDetailScroll.scroll_vertical = 0

func bind_document(document: Dictionary) -> void:
	%SubmissionNotice.text = ""; %SubmissionNotice.hide()
	%ReviewSavedVersion.hide(); %CheckOriginalResult.hide()
	_locked = false
	draft.bind_document(document)
	%RuleSources.show_context(document.get("ruleSource", {}))
	form.set_item_choices(document.get("itemChoices", []))
	form.set_edit(draft.edit, draft.editable)
	show_section(_section)
	_valid = true
	_pending = false
	_used_by = document.get("usedBy", [])
	_uses_offset = 0
	_render_uses_count(int(document.get("usedByCount", 0)))
	_outgoing = document.get("references", [])
	_render_references()
	_draft_changed()
	_restore_selection()
	document_applied.emit({"rule": selected_definition(), "revision": draft.revision})
	selection_changed.emit(selected_definition())

func begin_allocation(value: Dictionary, revision: int, author_id: int = -1) -> void:
	set_catalog_source("scenario")
	%RuleSources.show_context({"notice": "New scenario definition · Apply commits the reviewed allocation."})
	show_submission({"ok": true})
	draft.stage(value, revision, true, author_id)
	form.set_edit(draft.edit, true)
	_used_by.clear(); _outgoing.clear(); _render_references()
	_uses_offset = 0; _render_uses_count(0)
	_valid = true
	draft_edited.emit(); selection_changed.emit(selected_definition())

func stage_clear(value: Dictionary) -> void:
	show_submission({"ok": true})
	draft.stage(value, draft.revision, false)
	form.set_edit(draft.edit, true)
	draft_edited.emit(); selection_changed.emit(selected_definition())

func _draft_changed() -> void:
	var definition: Dictionary = draft.definition()
	var name := str(definition.get("name", ""))
	if name.is_empty(): name = str(draft.document.get("displayName", "Select a rule"))
	%RecordIdentity.text = "%s %02d · %s · %s" % [rule_kind.to_upper(), draft.author_id, name, "SCENARIO" if draft.editable else str(draft.document.get("ownership", "")).to_upper()]
	%ApplyRule.disabled = not can_apply_draft()
	%DiscardRule.disabled = _locked or not draft.dirty()
	%NewRule.disabled = _locked
	%DuplicateRule.disabled = _locked or definition.is_empty() or draft.document.get("ownership") == "vacant" or draft.document.get("copySource") == null
	%ClearRule.disabled = _locked or not draft.editable or draft.allocation
	%FindAllUses.disabled = _locked or definition.is_empty() or draft.allocation or not draft.document.get("discoveryRecordPresent", false)
	%FindAllUses.tooltip_text = "Scenario links are available after this rule family is created or imported. The direct references above remain available." if not draft.document.get("discoveryRecordPresent", false) else "Follow every scenario use of this exact rule identity."
	%TraceCallers.disabled = %FindAllUses.disabled
	%TraceCallers.tooltip_text = %FindAllUses.tooltip_text
	%DraftStatus.text = "Unapplied changes" if draft.dirty() else "" if draft.editable else "Empty slot" if draft.document.get("ownership") == "vacant" else "Stock · read-only" if not definition.is_empty() else "No rule selected."
	if _pending: %DraftStatus.text = "Result uncertain · draft retained and editing locked. Use the recovery action."

func _select_row(index: int) -> void:
	if _locked or index < 0 or index >= _rows.size(): return
	var identity := str(_rows[index].identity)
	_restore_selection()
	if identity == current_selection(): return
	if has_unapplied_changes(): navigation_requested.emit(open_identity.bind(identity))
	else: open_requested.emit(identity)

func _record(action: String) -> void:
	if _locked: return
	if has_unapplied_changes(): navigation_requested.emit(func(): record_requested.emit(action))
	else: record_requested.emit(action)

func open_identity(identity: String) -> Dictionary:
	if identity == current_selection(): return {"ok": true, "unchanged": true}
	return await open_handler.call(identity) if open_handler.is_valid() else {"ok": false, "error": "The rule controller is unavailable."}

func open_classic_id(classic_id: int) -> Dictionary:
	return await open_identity("classic.%s.%d" % [rule_kind, classic_id])

func commit_selected() -> Dictionary:
	if not can_apply_draft(): return {"ok": false, "error": "Edit an available scenario rule before applying."}
	return await commit_handler.call() if commit_handler.is_valid() else {"ok": false, "error": "The rule controller is unavailable."}

func discard_draft() -> void:
	if _locked: return
	if draft.allocation: set_catalog_source(str(draft.document.get("ruleSource", {}).get("requested", "scenario")))
	draft.discard()
	%RuleSources.show_context(draft.document.get("ruleSource", {}))
	form.set_edit(draft.edit, draft.editable)
	_valid = true
	show_submission({"ok": true})
	draft_edited.emit(); selection_changed.emit(selected_definition())

func show_catalog(page: Dictionary) -> void:
	%RuleSources.show_context(page.get("ruleSource", {}))
	_rows = page.get("items", [])
	%RecordList.clear()
	for row in _rows:
		var status := str(row.get("recordContent", "populated"))
		var label := "Empty slot" if status == "empty" else str(row.get("displayName", row.name))
		if status == "template-only": label = "Unused template"
		if status == "eligibility-only": label += " · eligibility only"
		if status == "populated" and row.get("custom", false) and not row.get("creationReady", false): label += " · no age ranges" if rule_kind == "race" else " · no stamina growth"
		var entry := "%02d · %s · %s" % [int(row.authorId), label, str(row.ownership).capitalize()]
		%RecordList.add_item(entry)
		%RecordList.set_item_tooltip(%RecordList.item_count - 1, "%s\n%d uses" % [entry, int(row.get("usedBy", 0))])
	var populated := 0; var empty := 0
	for row in _rows:
		if not row.get("custom", false): continue
		if row.get("recordContent") == "populated" and row.get("creationReady", false): populated += 1
		else: empty += 1
	%RecordStatus.text = "%d matches · %d custom with creation stats\n%d partial / template / empty" % [int(page.get("total", 0)), populated, empty]
	_restore_selection()
	catalog_applied.emit(_rows.duplicate(true), int(page.get("revision", draft.revision)))

func show_catalog_portrait(identity: String, texture: Texture2D) -> void:
	for index in _rows.size():
		if str(_rows[index].identity) == identity:
			%RecordList.set_item_icon(index, texture)
			_restore_selection()
			return

func _restore_selection() -> void:
	%RecordList.deselect_all()
	for index in _rows.size():
		if str(_rows[index].identity) == current_selection():
			%RecordList.select(index); %RecordList.ensure_current_is_visible.call_deferred(); return

func show_catalog_loading() -> void:
	%RecordStatus.text = "Loading catalog · current draft kept" if has_unapplied_changes() else "Loading catalog…"

func show_catalog_failure(response: Dictionary) -> void:
	%RecordStatus.text = str(response.get("error", "The rule catalog could not be loaded."))
	if response.get("outcomeUnknown", false): show_submission(response)

func _render_references() -> void:
	%Uses.clear(); %Outgoing.clear()
	for row in _used_by: %Uses.add_item("%s · %s" % [row.get("sourceLabel", str(row.source)), row.get("fieldLabel", str(row.field))])
	for row in _outgoing: %Outgoing.add_item("%s · %s" % [row.get("targetLabel", str(row.targetId)), row.get("fieldLabel", str(row.field))])

func show_uses_page(page: Dictionary) -> void:
	_used_by = page.get("items", []); _uses_offset = int(page.get("offset", 0))
	_render_references(); _render_uses_count(int(page.get("total", 0)))

func _render_uses_count(total: int) -> void:
	_uses_total = total
	%UsesCount.text = "%d uses · %d–%d shown" % [total, _uses_offset + 1 if total > 0 else 0, _uses_offset + _used_by.size()]
	%PreviousUses.disabled = _locked or _uses_offset == 0
	%NextUses.disabled = _locked or _uses_offset + _used_by.size() >= total

func set_locked(locked: bool) -> void:
	_locked = locked
	%RuleSources.set_locked(locked)
	form.set_locked(locked)
	%RecordSearch.editable = not locked
	%OwnershipFilter.disabled = locked
	$Catalog/Routes.set_locked(locked)
	%RecordList.mouse_filter = Control.MOUSE_FILTER_IGNORE if locked else Control.MOUSE_FILTER_STOP
	for button in %SectionTabs.get_children(): button.disabled = locked
	_render_uses_count(_uses_total)
	_draft_changed()

func show_submission(response: Dictionary) -> void:
	%SubmissionNotice.text = "" if response.get("ok", false) else str(response.get("error", "Your draft was retained."))
	%SubmissionNotice.visible = not %SubmissionNotice.text.is_empty()
	_pending = bool(response.get("outcomeUnknown", false))
	%CheckOriginalResult.visible = _pending
	%CheckOriginalResult.text = "Check original result" if response.get("pendingMutation", false) else "Reconnect keeping draft"
	%ReviewSavedVersion.visible = bool(response.get("revisionConflict", false))
	set_locked(_pending)

func show_validation(result: Dictionary) -> void:
	_valid = bool(result.get("valid", false))
	%SubmissionNotice.text = "\n".join(result.get("issues", []))
	%SubmissionNotice.visible = not %SubmissionNotice.text.is_empty()
	_draft_changed()

func read_state() -> Dictionary:
	return {"generation": draft.generation, "editSequence": draft.edit_sequence, "draft": draft.submitted() if not draft.edit.is_empty() else {}}

func read_navigation_state() -> Dictionary:
	var focus := get_viewport().gui_get_focus_owner()
	return {"identity": current_selection(), "query": catalog_query(), "section": _section, "scroll": %RuleDetailScroll.scroll_vertical,
		"draft": read_state(), "document": draft.document.duplicate(true), "editable": draft.editable,
		"catalogScroll": %RecordList.get_v_scroll_bar().value, "focus": str(get_path_to(focus)) if is_instance_valid(focus) and is_ancestor_of(focus) else "", "caret": focus.caret_column if focus is LineEdit else 0}

func restore_navigation_state(state: Dictionary) -> bool:
	_query = state.get("query", _query).duplicate(true)
	%RecordSearch.text = str(_query.query)
	%OwnershipFilter.select(["all", "stock", "scenario", "vacant"].find(_query.scope))
	%RuleSources.set_source(str(_query.get("source", "selected")))
	var response: Dictionary = await restore_handler.call(str(state.get("identity", "")))
	if not response.get("ok", false): return false
	show_section(str(state.get("section", "Profile")))
	%RuleDetailScroll.set_deferred("scroll_vertical", int(state.get("scroll", 0)))
	%RecordList.get_v_scroll_bar().set_deferred("value", float(state.get("catalogScroll", 0)))
	var focus := get_node_or_null(str(state.get("focus", "")))
	if focus is Control:
		focus.grab_focus()
		if focus is LineEdit: focus.caret_column = int(state.get("caret", 0))
	return true

func discovery_selection() -> Dictionary:
	return {"kind": rule_kind, "identity": current_selection(), "nativeId": str(selected_definition().get("classicId", "")), "scope": str(draft.document.get("discoveryScope", "scenario"))}

func focus_source(identity: String, _slot: int, field: String) -> bool:
	if _query.source != "scenario":
		if not source_handler.is_valid() or not (await source_handler.call("scenario")).get("ok", false): return false
	if not (await open_identity(identity)).get("ok", false): return false
	var control: Control
	if field.begins_with("startingItemIds["):
		var logical := field.get_slice("[", 1).to_int()
		var occupied: Array = []
		for index in 20:
			if draft.edit.nativeFields.startingItems[index] != null: occupied.append(index)
		if logical >= occupied.size(): return false
		control = form.find_child("ChooseItem" + str(occupied[logical]), true, false)
		show_section("Equipment")
	elif field.begins_with("eligible"):
		var key := field.get_slice("[", 0)
		var index := field.get_slice("[", 1).to_int()
		var values: Array = selected_definition().get(key, [])
		if index >= values.size(): return false
		control = form.find_child("Eligible" + str(values[index]).get_slice(".", 2), true, false)
		show_section("Castes" if rule_kind == "race" else "Races")
	else: control = form.control_for(["definition", field])
	if control == null: return false
	%RuleDetailScroll.ensure_control_visible(control)
	if control is SpinBox: control = control.get_line_edit()
	control.grab_focus()
	return true

func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls = preload("res://src/item_theme.gd").new()
	controls.mode = mode; controls.density = density; theme = controls
	queue_redraw()

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), get_theme_stylebox("panel", "ItemPanel").bg_color)
