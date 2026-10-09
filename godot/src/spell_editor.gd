class_name ProvidenceSpellEditor
extends HBoxContainer

signal document_applied(result: Dictionary)
signal route_requested(tab_index: int)
signal navigation_requested(action: Callable)
signal catalog_requested(query: Dictionary)
signal open_requested(identity: String)
signal record_requested(kind: String)
signal recovery_requested
signal saved_version_requested
signal draft_edited
signal selection_changed(definition: Dictionary)
signal used_by_requested(reference: Dictionary)
signal uses_page_requested(offset: int)

var draft := preload("res://src/spell_record_draft.gd").new()
var commit_handler: Callable
var open_handler: Callable
var _query := {"class": 1, "level": 0, "query": "", "offset": 0, "limit": 128, "showUnused": false}
var _rows: Array = []
var _total := 0
var _locked := false
var _pending := false
var _valid := true
var _uses: Array = []
var _uses_offset := 0
var form: HBoxContainer:
	get: return get_node("Main/SpellDetailScroll/SpellForm")


func _ready() -> void:
	resized.connect(queue_redraw)
	$Catalog/Routes.configure(route_identity())
	$Catalog/Routes.route_requested.connect(func(identity: String): route_requested.emit(ProvidenceRouteCatalog.tab_for_route(identity)))
	for text in ["All classes", "Sorcerer", "Priest", "Enchanter", "Special", "Custom"]: %SpellClassFilter.add_item(text)
	%SpellClassFilter.select(1)
	for level in 8: %SpellLevelFilter.add_item("All levels" if level == 0 else "Level %d" % level)
	%SpellClassFilter.item_selected.connect(_filter.bind("class"))
	%SpellLevelFilter.item_selected.connect(_filter.bind("level"))
	%ShowUnusedSpells.toggled.connect(func(enabled: bool):
		if _locked: return
		_query.showUnused = enabled; _query.offset = 0; catalog_requested.emit(catalog_query()))
	%SpellSearch.text_changed.connect(func(text: String):
		if _locked: return
		_query.query = text; _query.offset = 0; $SearchDelay.start())
	$SearchDelay.timeout.connect(func(): catalog_requested.emit(catalog_query()))
	%SpellRecordList.item_selected.connect(_select_row)
	%PreviousSpell.pressed.connect(_neighbor.bind(-1))
	%NextSpell.pressed.connect(_neighbor.bind(1))
	%NewCustomSpell.pressed.connect(_record.bind("new"))
	%CopyToCustomSpell.pressed.connect(_record.bind("copy"))
	%ClearScenarioCustom.pressed.connect(_record.bind("clear"))
	%CommitSpellEdit.pressed.connect(commit_selected)
	%DiscardSpell.pressed.connect(discard_draft)
	%CheckOriginalResult.pressed.connect(recovery_requested.emit)
	%ReviewSavedVersion.pressed.connect(saved_version_requested.emit)
	%Uses.item_activated.connect(func(index: int): if index < _uses.size(): used_by_requested.emit(_uses[index].duplicate(true)))
	%UsesPrevious.pressed.connect(func(): uses_page_requested.emit(maxi(0, _uses_offset - 64)))
	%UsesNext.pressed.connect(func(): uses_page_requested.emit(_uses_offset + 64))
	form.field_edited.connect(_field_edited)
	draft.changed.connect(_draft_changed)
	bind_document({})


func route_identity() -> String: return "rules.spells"
func workbench_title() -> String: return "CHARACTERS & MAGIC / SPELLS"
func apply_label() -> String: return "Apply Spell"
func has_unapplied_changes() -> bool: return draft.dirty() or _pending
func selected_definition() -> Dictionary: return draft.definition.duplicate(true)
func catalog_query() -> Dictionary: return _query.duplicate(true)


func set_catalog_query(query: Dictionary) -> void:
	_query = query.duplicate(true)
	%SpellClassFilter.select(int(_query.get("class", 1)))
	%SpellLevelFilter.select(int(_query.level))
	%SpellSearch.set_block_signals(true); %SpellSearch.text = str(_query.query); %SpellSearch.set_block_signals(false)
func current_applied_record_index() -> int: return int(draft.definition.get("recordIndex", -1))
func current_selection() -> int: return current_applied_record_index()
func command_state(command_id: String) -> String:
	return "working" if command_id in ["rules.spells", "rules.spells.edit", "rules.spells.create", "rules.spells.copy", "rules.spells.clear"] else "unavailable"
func can_apply_draft() -> bool: return not _locked and _valid and draft.dirty()


func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls = preload("res://src/item_theme.gd").new()
	controls.mode = mode; controls.density = density
	theme = controls
	queue_redraw()


func _draw() -> void:
	# Transparent form labels need their own theme surface, independent of shell chrome.
	draw_rect(Rect2(Vector2.ZERO, size), get_theme_stylebox("panel", "ItemPanel").bg_color)


func _filter(index: int, field: String) -> void:
	if _locked: return
	_query[field] = index; _query.offset = 0
	catalog_requested.emit(catalog_query())


func _neighbor(direction: int) -> void:
	if _locked: return
	var index := _rows.find_custom(func(row): return row.identity == draft.definition.get("id"))
	if index + direction >= 0 and index + direction < _rows.size(): _select_row(index + direction)


func _select_row(index: int) -> void:
	if _locked or index < 0 or index >= _rows.size(): return
	var identity := str(_rows[index].identity)
	if identity == draft.definition.get("id"): return
	_restore_selection()
	if has_unapplied_changes(): navigation_requested.emit(open_spell.bind(identity))
	else: open_requested.emit(identity)


func _restore_selection() -> void:
	%SpellRecordList.deselect_all()
	for index in _rows.size():
		if _rows[index].identity == draft.definition.get("id"):
			%SpellRecordList.select(index)
			%SpellRecordList.ensure_current_is_visible()


func _record(kind: String) -> void:
	if _locked: return
	if has_unapplied_changes(): navigation_requested.emit(func(): record_requested.emit(kind))
	else: record_requested.emit(kind)


func open_spell(identity: String) -> Dictionary:
	if identity == draft.definition.get("id"): return {"ok": true, "unchanged": true}
	if not open_handler.is_valid(): return {"ok": false, "error": "The spell controller is unavailable."}
	return await open_handler.call(identity)


func open_classic_id(classic_id: int) -> Dictionary:
	return await open_spell("classic.spell.%d" % classic_id)


func bind_document(document: Dictionary) -> void:
	draft.bind_document(document)
	form.set_definition(draft.definition, draft.editable)
	_reset_record_feedback()
	show_uses({"items": document.get("uses", []), "total": document.get("usedBy", 0), "offset": 0})
	_restore_selection()
	document_applied.emit({"spell": {"definition": draft.definition}, "revision": draft.revision})
	selection_changed.emit(selected_definition())


func begin_allocation(value: Dictionary, revision: int) -> void:
	draft.begin_allocation(value, revision)
	form.set_definition(draft.definition, true)
	_reset_record_feedback()
	show_uses({"items": [], "total": 0})
	selection_changed.emit(selected_definition())
	draft_edited.emit()


func discard_draft() -> void:
	if _locked: return
	draft.discard()
	form.set_definition(draft.definition, draft.editable)
	_reset_record_feedback()
	selection_changed.emit(selected_definition())


func _reset_record_feedback() -> void:
	_valid = true
	show_submission({"ok": true})
	# Baseline and copy-source names have already passed native MacRoman decoding.
	%NameFeedback.text = "255 MacRoman bytes maximum" if draft.definition.is_empty() else "%d / 255 MacRoman bytes" % str(draft.definition.name).length()


func commit_selected() -> Dictionary:
	if not draft.dirty(): return {"ok": true, "unchanged": true}
	return await commit_handler.call() if commit_handler.is_valid() else {"ok": false, "error": "The spell controller is unavailable."}


func _field_edited(field: String, value: Variant) -> void:
	if _locked: return
	var sequence: int = draft.edit_sequence
	draft.edit_field(field, value)
	if sequence == draft.edit_sequence: return
	if field in ["special", "size", "targetType", "rangeMin", "rangeMax"]: form.set_definition(draft.definition, draft.editable)
	draft_edited.emit()


func accept_reference(field: String, value: int) -> void:
	_field_edited(field, value)
	form.set_definition(draft.definition, draft.editable)
	selection_changed.emit(selected_definition())


func _draft_changed() -> void:
	var definition: Dictionary = draft.definition
	%SpellIdentity.text = "No spell selected" if definition.is_empty() else "%d · %s" % [int(definition.classicId), str(definition.name)]
	%SpellSource.text = "No spell selected" if definition.is_empty() else "Custom · Scenario-owned" if draft.editable else "Empty Custom slot · Create before editing" if draft.document.get("empty", false) else "Stock · Protected copy source"
	%CopyToCustomSpell.text = "Duplicate…" if draft.editable else "Copy to Custom…"
	%NewCustomSpell.disabled = _locked
	%CopyToCustomSpell.disabled = _locked or definition.is_empty() or draft.document.get("empty", false)
	%ClearScenarioCustom.disabled = _locked or not draft.editable or draft.allocation != null
	%CommitSpellEdit.disabled = _locked or not draft.dirty() or not _valid
	%DiscardSpell.disabled = _locked or not draft.dirty()
	%DraftStatus.text = "Unapplied changes" if draft.dirty() else "" if draft.editable else "Stock · read-only" if not definition.is_empty() and not draft.document.get("empty", false) else "No custom spell selected."


func show_catalog(page: Dictionary) -> void:
	if draft.definition.is_empty() and not _pending: set_locked(false)
	_rows = page.get("items", [])
	_total = int(page.get("total", 0))
	_query.offset = int(page.get("offset", 0))
	%SpellRecordList.clear()
	for row in _rows:
		%SpellRecordList.add_item("%d · %s%s" % [int(row.classicId), "Empty Custom slot" if row.get("empty", false) else str(row.name), " (Custom)" if row.scope == "scenario" and not row.get("empty", false) else ""])
	%SpellRecordStatus.text = "%d matches · 105 Custom slots" % _total
	%CatalogPage.text = "%d entries · scroll to browse" % _total
	%PreviousSpellsPage.hide(); %NextSpellsPage.hide()
	_restore_selection()


func show_catalog_loading() -> void:
	_rows.clear(); %SpellRecordList.clear()
	%SpellRecordStatus.text = "Loading…" if draft.definition.is_empty() else "Loading catalog · current spell kept"
	%CatalogPage.text = ""
	%PreviousSpellsPage.disabled = true; %NextSpellsPage.disabled = true
	if draft.definition.is_empty():
		set_locked(true)
		%DraftStatus.text = "Loading spell catalog…"


func show_catalog_failure(response: Dictionary) -> void:
	%SpellRecordStatus.text = str(response.get("error", "The spell catalog could not be read."))
	if draft.definition.is_empty():
		set_locked(false)
		%DraftStatus.text = "Catalog unavailable · refresh to try this read again."
	if response.get("outcomeUnknown", false): show_submission(response)


func show_uses(page: Dictionary) -> void:
	_uses = page.get("items", [])
	_uses_offset = int(page.get("offset", 0))
	%Uses.clear()
	%UsedByCount.text = "USED BY" if draft.definition.is_empty() else "USED BY · %d" % int(page.get("total", 0))
	for row in _uses: %Uses.add_item("%s · %s" % [preload("res://src/monster_review_labels.gd").owner(str(row.source)), preload("res://src/monster_review_labels.gd").field(str(row.field), str(row.source))])
	%UsesPrevious.disabled = _locked or _uses_offset == 0
	%UsesNext.disabled = _locked or _uses_offset + _uses.size() >= int(page.get("total", 0))


func set_locked(locked: bool) -> void:
	_locked = locked
	$Catalog/Routes.set_locked(locked)
	form.set_locked(locked)
	%SpellSearch.editable = not locked
	for control in [%SpellClassFilter, %SpellLevelFilter, %ShowUnusedSpells, %PreviousSpell, %NextSpell]: control.disabled = locked
	%PreviousSpellsPage.disabled = locked or int(_query.offset) == 0
	%NextSpellsPage.disabled = locked or int(_query.offset) + _rows.size() >= _total
	%UsesPrevious.disabled = locked or _uses_offset == 0
	%UsesNext.disabled = locked or _uses.size() < 64
	%SpellRecordList.mouse_filter = Control.MOUSE_FILTER_IGNORE if locked else Control.MOUSE_FILTER_STOP
	%Uses.mouse_filter = Control.MOUSE_FILTER_IGNORE if locked else Control.MOUSE_FILTER_STOP
	_draft_changed()


func show_submission(response: Dictionary) -> void:
	%SubmissionNotice.text = "" if response.get("ok", false) else str(response.get("error", "Your draft is kept."))
	%SubmissionNotice.visible = not %SubmissionNotice.text.is_empty()
	_pending = bool(response.get("outcomeUnknown", false))
	%CheckOriginalResult.visible = _pending
	%ReviewSavedVersion.visible = bool(response.get("revisionConflict", false))
	%CheckOriginalResult.text = "Check original result" if response.get("pendingMutation", false) else "Reconnect keeping draft"
	set_locked(_pending)


func show_validation(result: Dictionary) -> void:
	_valid = bool(result.get("valid", true))
	%SubmissionNotice.text = "\n".join(result.get("issues", []))
	%SubmissionNotice.visible = not %SubmissionNotice.text.is_empty()
	%NameFeedback.text = "%d / 255 MacRoman bytes" % int(result.get("nameBytes", 0))
	_draft_changed()


func read_state() -> Dictionary:
	return {"generation": draft.generation, "editSequence": draft.edit_sequence, "draft": draft.submitted() if not draft.definition.is_empty() else {}}


func discovery_selection() -> Dictionary:
	return {"kind": "spell", "identity": str(draft.definition.get("id", "")), "nativeId": str(draft.definition.get("classicId", "")), "scope": "stock" if draft.document.get("scope") == "standard" else "scenario"}


func read_navigation_state() -> Dictionary:
	var focus := get_viewport().gui_get_focus_owner()
	return {"identity": str(draft.definition.get("id", "")), "query": catalog_query(), "scroll": %SpellDetailScroll.scroll_vertical,
		"catalogScroll": %SpellRecordList.get_v_scroll_bar().value, "focus": str(get_path_to(focus)) if is_instance_valid(focus) and is_ancestor_of(focus) else "",
		"caret": focus.caret_column if focus is LineEdit else 0}


func restore_navigation_state(state: Dictionary) -> bool:
	_query = state.get("query", _query).duplicate(true)
	%SpellSearch.text = str(_query.query)
	%SpellClassFilter.select(int(_query.get("class", 0))); %SpellLevelFilter.select(int(_query.level))
	var response := await open_spell(str(state.get("identity", "")))
	if not response.get("ok", false): return false
	%SpellDetailScroll.set_deferred("scroll_vertical", int(state.get("scroll", 0)))
	%SpellRecordList.get_v_scroll_bar().set_deferred("value", float(state.get("catalogScroll", 0)))
	var control := get_node_or_null(str(state.get("focus", ""))) as Control
	if is_instance_valid(control) and control.is_visible_in_tree():
		control.grab_focus()
		if control is LineEdit: control.caret_column = int(state.get("caret", 0))
	return true


func focus_source(identity: String, _slot: int, field: String) -> bool:
	if not (await open_spell(identity)).get("ok", false): return false
	var key := field.get_slice(".", 0)
	var control: Control = form.control_for(key)
	if field.contains(".frames["):
		control = form.find_child(key + "Frame" + str(field.get_slice("[", 1).to_int()), true, false)
	elif control == null: control = form.find_child("Choose" + key, true, false)
	if control == null: return false
	%SpellDetailScroll.ensure_control_visible(control)
	if control is SpinBox: control = control.get_line_edit()
	control.grab_focus()
	return true


func clear_selection() -> void: bind_document({})
func teardown_session() -> void: clear_selection(); show_catalog({})
func present_selection() -> void: document_applied.emit({"spell": {"definition": draft.definition}, "revision": draft.revision})

func supports_source_field(field: String) -> bool:
	var key:=field.get_slice(".",0)
	if field.contains(".frames["): return form.find_child(key+"Frame"+str(field.get_slice("[",1).to_int()),true,false)!=null
	return form.control_for(key)!=null or form.find_child("Choose"+key,true,false)!=null
