extends MarginContainer

signal set_requested(set_id: int)
signal field_edited(path: String, value: Variant)
signal description_edited(text: String)
signal bestiary_edited(hidden: bool)
signal action_requested(action: String)
signal reference_requested(path: String)
signal reference_open_requested(path: String)
signal apply_requested
signal discard_requested
signal preferred_id_edited(value: Variant)

const SETS := {"Normal": 0, "Monster": 1, "Mega": -1}
var _fields: Array[Node] = []
var _set_group := ButtonGroup.new()
var _section_group := ButtonGroup.new()
var _binding := false
var _editing := false
var _issues: Array = []
var _description_scope := ""


func _ready() -> void:
	var controls = preload("res://theme/scenario_control_theme.gd").new()
	(%Description as TextEdit).add_theme_color_override("font_readonly_color", controls.get_color("font_readonly_color", "TextEdit"))
	(%Description as TextEdit).add_theme_stylebox_override("read_only", controls.get_stylebox("read_only", "TextEdit"))
	for child in find_children("*", "", true, false):
		if child.has_method("bind_record"):
			_fields.append(child)
			child.field_edited.connect(func(path: String, value: Variant): field_edited.emit(path, value))
			child.reference_requested.connect(func(path: String): reference_requested.emit(path))
			child.reference_open_requested.connect(func(path: String): reference_open_requested.emit(path))
	for node_name in SETS:
		var button := get_node("Content/SetPanel/MonsterSetToolbar/Sets/" + str(node_name)) as Button
		button.button_group = _set_group
		button.pressed.connect(func(): set_requested.emit(int(SETS[node_name])))
	for button: Button in %Sections.get_children():
		button.button_group = _section_group
		button.pressed.connect(show_section.bind(str(button.name)))
	%Sections/Overview.set_pressed_no_signal(true)
	%Description.text_changed.connect(func():
		if _editing and not _binding: description_edited.emit(%Description.text))
	%HideFromBestiary.toggled.connect(func(value: bool):
		if _editing and not _binding: bestiary_edited.emit(value))
	%LibraryBestiary.toggled.connect(func(value: bool):
		if _editing and not _binding: bestiary_edited.emit(value))
	%ApplyDraft.pressed.connect(func(): apply_requested.emit())
	%DiscardDraft.pressed.connect(func(): discard_requested.emit())
	%FirstError.pressed.connect(focus_first_error)
	%PreferredScenarioId.text_changed.connect(func(text: String):
		if _editing and not _binding: preferred_id_edited.emit(int(text) if text.is_valid_int() else text))
	for button_name in ["CopyToLibrary", "Duplicate", "ClearSelection"]:
		get_node("Content/MonsterRecordActions/" + button_name).pressed.connect(func(): action_requested.emit(button_name))
	for button_name in ["Customize", "Transfer", "Restore"]:
		get_node("Content/MonsterRecordActions/" + button_name).pressed.connect(func(): action_requested.emit(button_name))
	%Variants.pressed.connect(func(): action_requested.emit("Variants"))
	%Switch.pressed.connect(func(): action_requested.emit("Switch"))
	%UsedBy.pressed.connect(func(): action_requested.emit("UsedBy"))
	%ChooseIcon.pressed.connect(func(): reference_requested.emit("iconId"))
	%OpenIcon.pressed.connect(func(): reference_open_requested.emit("iconId"))
	clear_projection()


func set_projection(result: Dictionary, normal_not_on_menu: Variant = null) -> void:
	clear_projection()
	_binding = true
	var record: Dictionary = result.get("monster", {})
	if record.is_empty():
		_binding = false
		return
	for button: Button in %Sections.get_children(): button.disabled = false
	for field in _fields:
		field.bind_record(record)
		if field.field_path.begins_with("spells.") or field.field_path.begins_with("items."):
			field.bind_slot_preview(result.get("slotPreview", {}).get(field.field_path.get_slice(".", 0)))
	var description: Variant = result.get("description")
	(%Description as TextEdit).text = str(description.get("text", "")) if description is Dictionary else ""
	var set_id := int(result.get("setId", 0))
	var names := {0: "Normal", 1: "Monster", -1: "Mega"}
	(%RecordStatus as Label).text = "Monster %d · %s · Read-only inspection; authoring not connected" % [int(record.get("nativeId", -1)), names.get(set_id, "Unknown set")]
	for node_name in SETS:
		var button := get_node("Content/SetPanel/MonsterSetToolbar/Sets/" + str(node_name)) as Button
		button.set_pressed_no_signal(int(SETS[node_name]) == set_id)
		button.disabled = set_requested.get_connections().is_empty()
	(%HideFromBestiary as CheckBox).set_pressed_no_signal(normal_not_on_menu != null and bool(normal_not_on_menu))
	%LibraryBestiary.set_pressed_no_signal(normal_not_on_menu != null and bool(normal_not_on_menu))
	(%HideFromBestiary as CheckBox).tooltip_text = "Normal set value; read-only." if normal_not_on_menu != null else "Normal bestiary flag unavailable."
	(%AppearanceStatus as Label).text = "Icon %d · appearance not loaded" % int(record.get("iconId", 0))
	(%ChooseIcon as Button).text = "Icon %d" % int(record.get("iconId", 0))
	_binding = false


func set_library_template(record: Dictionary, description: String) -> void:
	clear_projection()
	$Content/MonsterRecordActions.hide()
	$Content/SetPanel.hide()
	%RecordStatus.hide()
	for field in _fields:
		field.bind_record(record)
	(%Description as TextEdit).text = description


func show_missing(set_id: int, native_id: int, message: String) -> void:
	clear_projection()
	(%RecordStatus as Label).text = message
	for node_name in SETS:
		var button := get_node("Content/SetPanel/MonsterSetToolbar/Sets/" + str(node_name)) as Button
		button.disabled = native_id < 0 or set_requested.get_connections().is_empty()
		button.set_pressed_no_signal(int(SETS[node_name]) == set_id)


func clear_projection() -> void:
	show_validation([])
	_binding = true
	configure_editing(false)
	for action in ["Customize", "Transfer", "Restore"]:
		get_node("Content/MonsterRecordActions/" + action).disabled = true
		get_node("Content/MonsterRecordActions/" + action).hide()
	set_reward_art([])
	$Content/MonsterRecordActions/ClearSelection.disabled = true
	for field in _fields:
		field.clear_value()
	(%Description as TextEdit).text = ""
	(%Portrait as TextureRect).texture = null
	%FacingPortrait.texture = null
	(%AppearanceStatus as Label).text = "No artwork"
	(%ChooseIcon as Button).text = "Search icon"
	(%RecordStatus as Label).text = "No scenario monster selected."
	(%HideFromBestiary as CheckBox).set_pressed_no_signal(false)
	for node_name in SETS:
		var button := get_node("Content/SetPanel/MonsterSetToolbar/Sets/" + str(node_name)) as Button
		button.disabled = true
		button.set_pressed_no_signal(false)
	%DraftStatus.text = "No record selected."
	%ApplyDraft.disabled = true
	%DiscardDraft.disabled = true
	for button: Button in %Sections.get_children(): button.disabled = true
	_binding = false


func set_appearance(appearance: Dictionary) -> void:
	(%Portrait as TextureRect).texture = appearance.get("texture")
	%FacingPortrait.texture = appearance.get("facingTexture")
	var status := str(appearance.get("status", "Appearance unavailable."))
	(%AppearanceStatus as Label).text = status if appearance.get("texture") != null else "Art unavailable"
	%AppearanceStatus.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	(%AppearanceStatus as Label).tooltip_text = status


func field_count() -> int:
	return _fields.size()


func focus_reference(path: String) -> bool:
	path = path.replace("[", ".").replace("]", "")
	if path == "iconId": show_section("Overview"); %ChooseIcon.grab_focus(); return true
	for field in _fields:
		if field.field_path == path and field.has_node("Reference"):
			var page: Node = field
			while page.get_parent() != $Content/BodyScroll/Pages: page = page.get_parent()
			show_section(str(page.name))
			$Content/BodyScroll.ensure_control_visible(field)
			field.get_node("Reference").grab_focus()
			return true
	return false


func set_reward_art(art: Array) -> void:
	for field in _fields:
		if not field.field_path.begins_with("money."):
			continue
		var slot := int(field.field_path.get_slice(".", 1))
		var icon := field.get_node("Icon") as TextureRect
		icon.texture = art[slot].get("texture") if art.size() == 3 else null
		icon.tooltip_text = "%s · %s" % [field.field_label, str(art[slot].get("status", "Artwork unavailable")) if art.size() == 3 else "Artwork unavailable"]


func configure_editing(enabled: bool, normal_available := false) -> void:
	_editing = enabled
	for field in _fields: field.configure_editing(enabled)
	%Description.editable = enabled
	%PreferredScenarioId.editable = enabled
	%HideFromBestiary.disabled = not enabled or not normal_available
	%LibraryBestiary.disabled = not enabled or not normal_available
	%HideFromBestiary.tooltip_text = "Normal owns this setting." if normal_available else "Create an active Normal record to change its bestiary setting."
	for button_name in ["CopyToLibrary", "Duplicate", "ClearSelection"]:
		get_node("Content/MonsterRecordActions/" + button_name).disabled = not enabled
	%Variants.disabled = not enabled
	%Switch.disabled = not enabled
	%UsedBy.disabled = not enabled
	%ChooseIcon.disabled = not enabled
	%OpenIcon.disabled = not enabled
	if enabled: %RecordStatus.text = %RecordStatus.text.replace("Read-only inspection; authoring not connected", "Scenario")


func show_section(section: String) -> void:
	for page: Control in $Content/BodyScroll/Pages.get_children(): page.visible = str(page.name) == section
	%BodyScroll.scroll_vertical = 0


func current_section() -> String:
	for page: Control in $Content/BodyScroll/Pages.get_children():
		if page.visible: return str(page.name)
	return "Overview"


func show_draft_state(dirty: bool, message: String, locked := false) -> void:
	%DraftStatus.text = message
	%ApplyDraft.disabled = not dirty or locked or not _editing
	%DiscardDraft.disabled = not dirty or locked


func configure_context(result: Dictionary, library_context: bool, protected := false, operations_allowed := true, scenario_available := true) -> void:
	%UsedBy.visible = not library_context
	for field in _fields: field.configure_reference_access(operations_allowed and scenario_available)
	%ChooseIcon.disabled = not _editing or not scenario_available
	%OpenIcon.disabled = not operations_allowed or not scenario_available or int(result.get("monster", {}).get("iconId", 0)) == 0
	%ReferenceContext.visible = library_context and not scenario_available
	$Content/SetPanel.visible = not library_context
	%LibraryIdentity.visible = library_context
	$Content/MonsterRecordActions/CopyToLibrary.visible = not library_context
	$Content/MonsterRecordActions/ClearSelection.text = "Remove…" if library_context else "Clear…"
	$Content/MonsterRecordActions/Customize.visible = library_context and protected
	$Content/MonsterRecordActions/Transfer.visible = library_context
	$Content/MonsterRecordActions/Restore.visible = library_context and result.get("entry", {}).get("origin", {}).get("kind") == "built-in-override"
	for action in ["Customize", "Transfer", "Restore"]: get_node("Content/MonsterRecordActions/" + action).disabled = not operations_allowed
	$Content/MonsterRecordActions/Transfer.disabled = not operations_allowed or not scenario_available
	if library_context:
		$Content/MonsterRecordActions/Duplicate.disabled = not operations_allowed
		$Content/MonsterRecordActions/ClearSelection.disabled = protected or not operations_allowed
	_binding = true
	var preferred: Variant = result.get("preferredScenarioMonsterId")
	%PreferredScenarioId.text = preferred if preferred is String else (str(int(preferred)) if preferred != null else "")
	_description_scope = "Template description · copied during scenario transfers" if library_context else "Shared by Monster %d across all difficulty sets" % int(result.get("monster", {}).get("nativeId", 0))
	%DescriptionScope.text = _description_scope
	_binding = false
	if library_context: %RecordStatus.text = "%s · %s" % [result.get("entry", {}).get("label", ""), "Protected source" if protected else "Custom Library Entry"]
	else: %RecordStatus.text = "%s · Monster %d · %s" % [result.get("monster", {}).get("displayName", ""), int(result.get("monster", {}).get("nativeId", 0)), {0: "Normal", 1: "Monster", -1: "Mega"}.get(int(result.get("setId", 0)), "Unknown set")]


func show_validation(issues: Array) -> void:
	_issues = issues.duplicate(true)
	%FirstError.visible = not issues.is_empty()
	%FirstError.disabled = issues.is_empty()
	for field in _fields:
		if not field.has_method("show_validation"): continue
		var matching: Array = issues.filter(func(issue): return issue.field == field.field_path)
		field.show_validation(str(matching[0].message) if not matching.is_empty() else "")
	var descriptions: Array = issues.filter(func(issue): return issue.field == "description")
	%DescriptionScope.text = str(descriptions[0].message) if not descriptions.is_empty() else _description_scope
	var preferred: Array = issues.filter(func(issue): return issue.field == "preferredScenarioMonsterId")
	%Hint.text = str(preferred[0].message) if not preferred.is_empty() else "Allocation reviews occupied IDs before a scenario copy."


func focus_first_error() -> void:
	if _issues.is_empty(): return
	var path: String = _issues[0].field
	if path == "description": show_section("Overview"); %Description.grab_focus(); return
	if path == "preferredScenarioMonsterId": %PreferredScenarioId.grab_focus(); return
	for field in _fields:
		if field.field_path != path: continue
		var page: Node = field
		while page.get_parent() != $Content/BodyScroll/Pages: page = page.get_parent()
		show_section(str(page.name))
		field.get_node("Value").grab_focus()
		return

func supports_source_field(path: String) -> bool:
	path=path.replace("[",".").replace("]","")
	return path in ["iconId","description","sharedDescription"] or _fields.any(func(field): return field.field_path==path)

func focus_source_field(path: String) -> bool:
	path=path.replace("[",".").replace("]","")
	if path=="iconId": show_section("Overview"); %ChooseIcon.grab_focus(); return true
	if path in ["description","sharedDescription"]: show_section("Overview"); %Description.grab_focus(); return true
	for field in _fields:
		if field.field_path!=path: continue
		var page:Node=field
		while page.get_parent()!=$Content/BodyScroll/Pages: page=page.get_parent()
		show_section(str(page.name)); $Content/BodyScroll.ensure_control_visible(field)
		var control:Control=field.get_node("Reference" if field.has_node("Reference") else "Value")
		if control is SpinBox: control=control.get_line_edit()
		control.grab_focus(); return true
	return false
