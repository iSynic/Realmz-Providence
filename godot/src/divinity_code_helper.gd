class_name ProvidenceDivinityCodeHelper
extends Window

signal manual_requested(page: int)
signal action_selected(identity: String)
signal selection_cancelled

var _catalog := ProvidenceDivinityHelpCatalog.new()
var _actions := ProvidenceDivinityActionCatalog.new()
var _visible_entries: Array = []
var _origin: Control
var _manual_page := 5
var _selection_mode := false
var _script_kind := ""
var _current_identity := ""
var _reference_availability: Variant = null
var _reference_code := 0
@onready var _search: LineEdit = %CodeSearch
@onready var _list: ProvidenceDivinityActionList = %CodeEntries
@onready var _title: Label = %CodeTitle
@onready var _availability: Label = %Availability
@onready var _details: RichTextLabel = %CodeDetails
@onready var _category: OptionButton = %ActionCategory
@onready var _manual: ProvidenceDivinityManualReader = %PickerManualReader


func _ready() -> void:
	close_requested.connect(close_helper)
	_search.text_changed.connect(_filter)
	_search.text_submitted.connect(func(_text): _accept_selection())
	_list.item_selected.connect(_select)
	_list.item_activated.connect(func(_index): _accept_selection())
	_category.item_selected.connect(func(_index): _filter(_search.text))
	%ShowUnavailable.toggled.connect(func(_pressed): _filter(_search.text))
	%OpenManual.pressed.connect(_open_manual)
	%CancelAction.pressed.connect(close_helper)
	%UseAction.pressed.connect(_accept_selection)
	%ClearSearch.pressed.connect(func(): _search.text = ""; _filter(""); _search.grab_focus())
	var error := _catalog.load_bundled()
	if not error.is_empty(): _details.text = error
	else: _filter("")


func open_for_code(code: int, origin: Control = null, context_available: Variant = null) -> void:
	_selection_mode = false
	_reference_availability = context_available
	_reference_code = abs(code)
	title = "Divinity Code Helper"
	_origin = origin
	%PickerDestination.text = "Reference help · no destination"
	%PickerFilters.hide()
	%UseAction.hide()
	%CancelAction.text = "Close"
	%Heading.text = "DIVINITY MANUAL · CODE HELPER"
	exclusive = false
	_search.text = ""
	_filter("")
	_open_window(Vector2i(1060, 720))
	var entry := _catalog.entry_for_code(code)
	for index in range(_visible_entries.size()):
		if _visible_entries[index].get("primaryCode") == entry.get("primaryCode", -1):
			_select(index)
			_reveal_entry.call_deferred(index)
			break


func open_for_selection(definitions: Array, script_kind: String, current_identity: String,
		destination: String, origin: Control) -> void:
	_selection_mode = true
	_script_kind = script_kind
	_current_identity = current_identity
	_origin = origin
	_actions.configure(definitions, _catalog)
	_category.clear()
	_category.add_item("All categories")
	_category.set_item_metadata(0, "")
	for category in _actions.categories():
		_category.add_item(category)
		_category.set_item_metadata(_category.item_count - 1, category)
	%PickerFilters.show()
	%ShowUnavailable.set_pressed_no_signal(false)
	var current := _actions.entry_for_identity(current_identity)
	if not current.is_empty() and not _actions.availability(current, script_kind).get("available", false):
		%ShowUnavailable.set_pressed_no_signal(true)
	%PickerDestination.text = destination
	%Heading.text = "DIVINITY MANUAL · CHOOSE ACTION"
	%UseAction.show()
	%CancelAction.text = "Cancel"
	title = "Divinity Code Helper · Choose action"
	exclusive = true
	_search.text = ""
	_filter("")
	_open_window(Vector2i(1060, 640 if script_kind.ends_with("encounter") else 720))
	for index in range(_visible_entries.size()):
		if str(_visible_entries[index].get("identity", "")) == current_identity:
			_select(index)
			_reveal_entry.call_deferred(index)
			break
	_search.grab_focus.call_deferred()


func _open_window(dimensions: Vector2i) -> void:
	var usable := DisplayServer.screen_get_usable_rect()
	if usable.size.x <= 0: usable = Rect2i(Vector2i.ZERO, get_tree().root.size)
	dimensions = dimensions.min(usable.size - Vector2i(40, 40))
	popup_centered(dimensions)
	position.x = clampi(position.x, usable.position.x, usable.end.x - size.x)
	position.y = clampi(position.y, usable.position.y, usable.end.y - size.y)


func _reveal_entry(index: int) -> void:
	if not visible or index < 0 or index >= _list.item_count: return
	_list.reveal_current_after_layout()


func close_helper(restore_focus := true) -> void:
	var cancelled := visible and _selection_mode and restore_focus
	_manual.hide()
	hide()
	if cancelled: selection_cancelled.emit()
	if restore_focus and is_instance_valid(_origin) and _origin.is_visible_in_tree():
		_origin.get_window().grab_focus()
		_origin.grab_focus()


func _filter(value: String) -> void:
	var selected := _selected_identity()
	if _selection_mode:
		var category := str(_category.get_item_metadata(_category.selected))
		_visible_entries = _actions.matching(value, category, %ShowUnavailable.button_pressed, _script_kind)
	else: _visible_entries = _catalog.matching_entries(value)
	_list.clear()
	var reveal := 0
	for item in _visible_entries:
		var entry := item as Dictionary
		var label := "%s  %s" % [str(entry.get("codes", [])), str(entry.get("title", ""))]
		if _selection_mode:
			var state := " · current action" if str(entry.get("identity", "")) == _current_identity else ""
			if not str(entry.get("identity", "")).is_empty() and not _actions.availability(entry, _script_kind).get("available", false): state += " · unavailable"
			label = "%d  %s\n     %s%s" % [int(entry.opcode), str(entry.label), str(entry.category),
				state]
			if str(entry.get("identity", "")) == selected: reveal = _list.item_count
		var index := _list.add_item(label)
		_list.set_item_metadata(index, entry)
	%ActionCount.text = "%d matching actions" % _visible_entries.size()
	if _visible_entries.is_empty(): _clear_preview()
	else:
		_select(reveal)
		_list.reveal_current_after_layout()


func _select(index: int) -> void:
	if index < 0 or index >= _visible_entries.size(): return
	_list.select(index)
	%ClearSearch.hide()
	var entry := _visible_entries[index] as Dictionary
	var manual := entry.get("manual", {}) as Dictionary if _selection_mode else entry
	var code := int(entry.get("opcode", entry.get("primaryCode", 0)))
	_manual_page = 5 if abs(code) <= 29 else (6 if abs(code) <= 59 else (7 if abs(code) <= 89 else 8))
	_title.text = str(entry.get("label", entry.get("title", "")))
	%OriginalName.text = "%s · Code %d" % [manual.get("title", "No Divinity manual entry"), code]
	if code == 0: %OriginalName.text = "Empty Step · Code 0"
	var eligibility := _actions.availability(entry, _script_kind) if _selection_mode else {}
	var available := bool(eligibility.get("available", false))
	%UseAction.disabled = not available
	_availability.text = str(eligibility.get("reason", "")) if not available else "Available in this step"
	if not _selection_mode:
		_availability.text = "Reference help · no step selection" if _reference_availability == null or abs(code) != _reference_code else (
			"Available in supplied context" if _reference_availability else "Reference only · not available in this context")
	_availability.add_theme_color_override("font_color", Color("a7f3c3") if available else Color("9eb1c2"))
	%ActionEffect.text = str(entry.get("description", "")) if _selection_mode else ""
	%ActionEffect.visible = not %ActionEffect.text.is_empty()
	%OpenManual.disabled = manual.is_empty()
	_details.text = _documentation(manual, code)
	_details.scroll_to_line(0)
	%SelectionStatus.text = "Current action · existing settings will be kept." if _selection_mode and _selected_identity() == _current_identity else (
		"Choosing updates the step draft. Apply commits the record." if _selection_mode else "Browse the bundled Divinity documentation.")
	%KeyboardHint.text = "Enter / double-click chooses · Escape cancels" if available else "Browse documentation · Escape closes"


func _documentation(manual: Dictionary, code: int) -> String:
	if manual.is_empty() or code == 0:
		return "[b]USE[/b]\nLeave this step unused. Empty Step clears only this draft slot; later steps stay in place."
	var signed_note := ""
	if code == -23:
		signed_note = "[b]CODE -23 · DUNGEON REGION[/b]\nThe level field is Dungeon Level ID. This signed action changes dungeon random encounters; the shared original notes below use the positive code's Land Level wording.\n\n[b]ORIGINAL DIVINITY NOTES (SHARED WITH CODE 23)[/b]\n"
	return "[b]ID FIELD[/b]\n%s\n\n[b]USE[/b]\n%s\n\n[b]OPTIONS[/b]\n%s\n\n[b]E-CODES / NOTES[/b]\n%s%s%s" % [
		manual.get("idField", "Not documented"), manual.get("use", "Not documented"),
		manual.get("options", "Not documented"), signed_note, manual.get("extraCodes", manual.get("fullText", "")),
		"\n\nDistinct signed action · keep code %d. This does not enable GOSUB." % code if code < 0 else ""]


func _clear_preview() -> void:
	_title.text = "No matching actions"
	%OriginalName.text = ""
	_availability.text = ""
	%ActionEffect.hide()
	_details.text = "Try an action name, code, category, or words from the manual."
	%UseAction.disabled = true
	%OpenManual.disabled = true
	%ClearSearch.show()
	%SelectionStatus.text = "Nothing selected"
	%KeyboardHint.text = "Clear search to browse · Escape closes"


func _selected_identity() -> String:
	var selected := _list.get_selected_items() if is_instance_valid(_list) else PackedInt32Array()
	if selected.is_empty() or selected[0] >= _visible_entries.size(): return ""
	return str((_visible_entries[selected[0]] as Dictionary).get("identity", ""))


func _accept_selection() -> void:
	if not visible or not _selection_mode or %UseAction.disabled: return
	var identity := _selected_identity()
	var entry := _actions.entry_for_identity(identity)
	if identity.is_empty() or not _actions.availability(entry, _script_kind).get("available", false): return
	close_helper(false)
	action_selected.emit(identity)
	if is_instance_valid(_origin) and _origin.is_visible_in_tree():
		_origin.get_window().grab_focus()
		_origin.grab_focus()


func _open_manual() -> void:
	if %OpenManual.disabled: return
	if _selection_mode:
		_manual.exclusive = true
		_manual.open_page(_manual_page, _search)
	else: manual_requested.emit(_manual_page)


func _input(event: InputEvent) -> void:
	if not visible or _manual.visible or not event is InputEventKey or not event.pressed or event.echo: return
	if event.keycode == KEY_ESCAPE:
		close_helper()
		get_viewport().set_input_as_handled()
	elif _selection_mode and event.keycode in [KEY_ENTER, KEY_KP_ENTER] and (get_viewport().gui_get_focus_owner() == _search or _list.owns_focus()):
		_accept_selection()
		get_viewport().set_input_as_handled()
	elif _selection_mode and event.keycode in [KEY_UP, KEY_DOWN] and get_viewport().gui_get_focus_owner() == _search and not _visible_entries.is_empty():
		var selected := _list.get_selected_items()
		var index := selected[0] if not selected.is_empty() else 0
		_select(clampi(index + (1 if event.keycode == KEY_DOWN else -1), 0, _visible_entries.size() - 1))
		_list.ensure_current_is_visible()
		get_viewport().set_input_as_handled()

