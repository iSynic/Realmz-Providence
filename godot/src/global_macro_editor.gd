class_name ProvidenceGlobalMacroEditor
extends VBoxContainer

signal hooks_update_requested(hooks: Dictionary)
signal extra_action_point_open_requested(native_id: int)
signal compile_requested
signal selection_changed(hook_row: Dictionary)
signal reference_requested(hook: String, context: Dictionary)
signal preview_requested(identity: String, generation: int)
signal discovery_requested(direction: String)
signal apply_state_changed

const HOOK_ORDER := ["start", "death", "quit", "shop", "temple"]
var commit_handler: Callable
var _draft: Dictionary = {}
var _baseline: Dictionary = {}
var _scripts: Dictionary = {}
var _missing_targets: Dictionary = {}
var _cards: Dictionary = {}
var _selected_hook := "start"
var _revision := 0
var _generation := 0
var _busy := false
var _unknown := false
var _loaded := false
var picker: Window:
	get: return %GlobalMacroPicker

func _ready() -> void:
	for card in %GlobalMacroAssignments.get_children():
		if not card.has_signal("choose_requested"): continue
		_cards[card.hook] = card
		card.selected.connect(select_hook.bind(card.hook))
		card.choose_requested.connect(_choose.bind(card.hook))
		card.clear_requested.connect(set_draft_target.bind(card.hook, null))
		card.open_requested.connect(_open_hook.bind(card.hook))
	%ApplyHooks.pressed.connect(commit_selected)
	%DiscardHooks.pressed.connect(discard_draft)
	%OpenSelectedXAP.pressed.connect(_open_hook.bind(""))
	%TraceSelectedXAP.pressed.connect(func(): discovery_requested.emit("incoming"))
	%CompileGlobalMacroSlice.pressed.connect(func(): compile_requested.emit())
	visibility_changed.connect(func(): if not is_visible_in_tree(): _generation += 1; picker.cancel(false))
	set_document({})

func route_identity() -> String:
	return "scripts.global-macros"

func focus_source(_source: String, _slot: int, field: String) -> bool:
	if not supports_source_field(field): return false
	var key := str({"startGame":"start", "partyDeath":"death", "endAdventure":"quit", "shop":"shop", "temple":"temple"}.get(field.get_slice(".", 2), "start"))
	select_hook(key)
	_cards[key].choice_focus().grab_focus()
	return true

func set_document(result: Dictionary, preserve_drafts := false) -> void:
	_generation += 1
	picker.cancel(false)
	_revision = int(result.get("revision", _revision))
	_loaded = not result.get("hooks", []).is_empty()
	_baseline.clear()
	for hook in HOOK_ORDER: _baseline[hook] = null
	for row in result.get("hooks", []): _baseline[str(row.hook)] = null if row.get("targetNativeId") == null else int(row.targetNativeId)
	if not preserve_drafts: _draft = _baseline.duplicate(true)
	_scripts.clear()
	for script in result.get("assignedScripts", []): _scripts[int(script.nativeId)] = script
	_missing_targets.clear()
	for target in _baseline.values():
		if target != null and not _scripts.has(int(target)): _missing_targets[int(target)] = true
	%GlobalMacroSourceEvidence.text = "" if result.get("source") != null else "Unassigned events run no script."
	%GlobalMacroDraftValidation.text = ""
	_render()

func read_state() -> Dictionary:
	return _draft.duplicate(true)

func accept_saved_hooks(hooks: Dictionary) -> void:
	for hook in HOOK_ORDER:
		_baseline[hook] = null if hooks[hook] == null else str(hooks[hook]).get_slice(":", 1).to_int()
	_render()

func has_unapplied_changes() -> bool:
	return _draft != _baseline

func can_apply_draft() -> bool:
	return _loaded and not _busy and not _unknown and has_unapplied_changes()

func discard_draft() -> void:
	if _unknown or _busy: return
	_draft = _baseline.duplicate(true)
	_generation += 1
	picker.cancel()
	%GlobalMacroDraftValidation.text = ""
	_render()

func commit_selected() -> void:
	if not _loaded or _busy or _unknown or not has_unapplied_changes(): return
	var hooks := {}
	for hook in HOOK_ORDER: hooks[hook] = null if _draft[hook] == null else "extra-action-point:%d" % int(_draft[hook])
	if commit_handler.is_valid(): await commit_handler.call(hooks)
	else: hooks_update_requested.emit(hooks)

func set_draft_target(hook: String, target: Variant) -> void:
	if not _draft.has(hook) or _unknown or _draft[hook] == target: return
	_draft[hook] = target
	_generation += 1
	_render()
	_request_preview()

func accept_choice(choice: Dictionary, destination: Dictionary) -> void:
	if not context_matches(destination) or not choice.get("available", false): return
	var target: Variant = null if choice.get("identity") == "none" else int(choice.value)
	set_draft_target(str(destination.hook), target)

func context_matches(destination: Dictionary) -> bool:
	return _loaded and not _unknown and destination.get("generation", -1) == _generation and destination.get("revision", -1) == _revision and _draft.get(destination.get("hook")) == destination.get("target")

func select_hook(hook: String) -> void:
	if not _draft.has(hook): return
	_selected_hook = hook
	selection_changed.emit({"hook": hook, "targetNativeId": _draft[hook]})
	_render()
	_request_preview()

func _choose(hook: String) -> void:
	if not _loaded or _busy or _unknown: return
	var destination := {"field":"globalHook", "label":"Extra Action Point", "hook":hook,
		"destination":"Global Macros · %s hook" % hook.capitalize(), "currentValue":0 if _draft[hook] == null else int(_draft[hook]),
		"target":_draft[hook], "generation":_generation, "revision":_revision, "allowNone":true}
	reference_requested.emit(hook, destination)

func _request_preview() -> void:
	var identity := current_selection()
	if not identity.is_empty() and not _scripts.has(int(_draft[_selected_hook])):
		preview_requested.emit.call_deferred(identity, _generation)

func receive_preview(response: Dictionary, identity: String, generation: int) -> void:
	if generation != _generation or identity != current_selection(): return
	if response.get("ok", false):
		var script: Dictionary = response.result.extraActionPoint.duplicate(true)
		script["steps"] = response.result.get("steps", [])
		_scripts[int(script.nativeId)] = script
		_render()
	else: %GlobalMacroDraftValidation.text = str(response.get("error", "This XAP cannot be previewed."))

func current_selection() -> String:
	var target: Variant = _draft.get(_selected_hook)
	return "" if target == null else "extra-action-point:%d" % int(target)

func discovery_selection() -> Dictionary:
	return {"kind":"extra-action-point", "nativeId":str(_draft.get(_selected_hook, "")), "identity":current_selection(), "scope":"scenario"}

func _open_hook(hook: String) -> void:
	if not hook.is_empty(): select_hook(hook)
	var target: Variant = _draft.get(_selected_hook)
	if target != null and _scripts.has(int(target)): extra_action_point_open_requested.emit(int(target))

func _render() -> void:
	for hook in HOOK_ORDER:
		var target: Variant = _draft.get(hook)
		var script: Dictionary = _scripts.get(int(target), {}) if target != null else {}
		var description := str(script.get("descriptor", "")) if not script.is_empty() else ("Missing imported assignment" if target != null and _missing_targets.has(int(target)) else "Preview pending · select this hook")
		if description.is_empty(): description = "Extra Action Point"
		_cards[hook].present(target, description, not script.is_empty(), hook == _selected_hook, _busy or _unknown or not _loaded)
	_render_preview()
	var dirty := has_unapplied_changes()
	%ApplyHooks.disabled = not can_apply_draft()
	%DiscardHooks.disabled = not dirty or _busy or _unknown
	%DraftSummary.text = "%d unapplied hook change(s)" % _dirty_count() if dirty else "No unapplied hook changes"
	apply_state_changed.emit()

func _dirty_count() -> int:
	var count := 0
	for hook in HOOK_ORDER: if _draft.get(hook) != _baseline.get(hook): count += 1
	return count

func _render_preview() -> void:
	%PreviewTitle.text = "%s · SCRIPT PREVIEW" % _selected_hook.to_upper()
	%PreviewSteps.clear()
	var target: Variant = _draft.get(_selected_hook)
	var script: Dictionary = _scripts.get(int(target), {}) if target != null else {}
	%OpenSelectedXAP.disabled = script.is_empty() or _busy or _unknown
	%TraceSelectedXAP.disabled = target == null or _busy or _unknown
	if script.is_empty():
		%PreviewSteps.add_item("Unassigned · Choose an XAP" if target == null else ("Missing XAP · preserve or choose a replacement" if _missing_targets.has(int(target)) else "Reading assigned XAP…"))
		return
	for slot in 8:
		var rows: Array = script.get("steps", []).filter(func(step): return int(step.get("slot", -1)) == slot)
		var step: Dictionary = rows[0] if not rows.is_empty() else {}
		var definition: Dictionary = step.get("definition", {})
		%PreviewSteps.add_item("%d  %s\n    %s" % [slot + 1, str(definition.get("label", "Empty step")),preload("res://src/action_step_presentation.gd").step_detail(step,definition)])

func set_operation_state(busy: bool, unknown: bool) -> void:
	_busy = busy
	_unknown = unknown
	_render()
	if unknown: picker.cancel(false); %GlobalMacroDraftValidation.text = "The write outcome is uncertain. Reopen this project before making further changes. Your draft is retained."

func show_failure(response: Dictionary) -> void:
	%GlobalMacroDraftValidation.text = ("Write outcome uncertain · reopen this project. Your draft is retained. " if _unknown else "") + str(response.get("error", "The Global Macro form could not be applied. Your draft is retained."))

func set_compile_available(available: bool, reason := "") -> void:
	%CompileGlobalMacroSlice.disabled = not available
	%CompileGlobalMacroSlice.tooltip_text = reason

func read_navigation_state() -> Dictionary:
	var focus := get_viewport().gui_get_focus_owner()
	return {"hook":_selected_hook,"previewScroll":%PreviewSteps.get_v_scroll_bar().value,"hookScroll":%HookScroll.scroll_vertical,"focus":str(get_path_to(focus)) if focus != null and is_ancestor_of(focus) else ""}

func restore_navigation_state(state: Dictionary) -> bool:
	select_hook(str(state.get("hook","start")))
	%PreviewSteps.get_v_scroll_bar().value = float(state.get("previewScroll",0))
	%HookScroll.scroll_vertical = int(state.get("hookScroll",0))
	var focus := get_node_or_null(NodePath(str(state.get("focus","")))) as Control
	if focus != null: focus.grab_focus()
	else: _cards[_selected_hook].choice_focus().grab_focus()
	return true

func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls := preload("res://src/story_text_theme.gd").new()
	controls.mode = mode; controls.density = density; theme = controls
	picker.theme = controls

func supports_source_field(field: String) -> bool:
	return field.begins_with("scenarioApplication.hooks.") and field.get_slice(".",2) in ["startGame","partyDeath","endAdventure","shop","temple"]
