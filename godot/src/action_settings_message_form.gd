extends VBoxContainer

signal field_changed(field: String, value: String)
signal choose_requested(field: String)
signal read_requested(identity: String)
signal page_requested(offset: int)
signal editor_requested(identity: String)

var _range: Dictionary = {}
var _endpoints: Array[LineEdit] = []


func _ready() -> void:
	for entry: Array in [["First", "firstMessage"], ["Last", "lastMessage"]]:
		var path := "Endpoints/%s/Controls/" % entry[0]
		var input: LineEdit = get_node(path + "Value")
		_endpoints.append(input)
		input.text_changed.connect(func(value): field_changed.emit(entry[1], value))
		get_node(path + "Choose").pressed.connect(func(): choose_requested.emit(entry[1]))
		get_node(path + "Clear").pressed.connect(func(): field_changed.emit(entry[1], ""); input.grab_focus())
	for index in 4:
		get_node("Results/Result%d/Content/Read" % index).pressed.connect(func():
			var entries: Array = _range.get("entries", [])
			if index < entries.size() and entries[index].get("identity") != null:
				read_requested.emit(str(entries[index].identity)))
	$Pager/Previous.pressed.connect(func(): page_requested.emit(maxi(0, int(_range.get("offset", 0)) - 4)))
	$Pager/Next.pressed.connect(func(): page_requested.emit(int(_range.get("offset", 0)) + 4))
	$OpenMessages.pressed.connect(func():
		var unresolved: Dictionary = _range.get("firstUnresolved") if _range.get("firstUnresolved") is Dictionary else {}
		if not unresolved.is_empty(): editor_requested.emit("message:%d" % int(unresolved.nativeId)))


func endpoint(field: String) -> LineEdit:
	return _endpoints[0 if field == "firstMessage" else 1]


func apply_theme(next_theme: Theme) -> void:
	var style: StyleBoxFlat = next_theme.get_stylebox("normal", "LineEdit").duplicate()
	style.content_margin_top = 2
	style.content_margin_bottom = 2
	style.content_margin_left = 4
	style.content_margin_right = 4
	for index in 4: get_node("Results/Result%d" % index).add_theme_stylebox_override("panel", style)
	for control: Control in controls():
		if not control is Button: continue
		control.add_theme_font_size_override("font_size", 12)
		for state in ["normal", "hover", "pressed", "disabled"]:
			var button_style: StyleBox = next_theme.get_stylebox(state, "Button").duplicate()
			button_style.content_margin_left = 6 if control.name == "Read" else 8
			button_style.content_margin_right = button_style.content_margin_left
			control.add_theme_stylebox_override(state, button_style)
	$Summary.add_theme_color_override("font_color", next_theme.get_color("secondary", "Issues"))
	$Problem.add_theme_color_override("font_color", next_theme.get_color("problem", "Issues"))


func controls() -> Array[Control]:
	var result: Array[Control] = []
	for prefix in ["First", "Last"]:
		for key in ["Value", "Choose", "Clear"]: result.append(get_node("Endpoints/%s/Controls/%s" % [prefix, key]))
	for index in 4: result.append(get_node("Results/Result%d/Content/Read" % index))
	result.append_array([$Pager/Previous, $Pager/Next, $OpenMessages])
	return result


func render(view: Dictionary, state: Dictionary) -> void:
	var input: Dictionary = view.draft.input
	for field in ["firstMessage", "lastMessage"]:
		var value := str(input[field])
		for edit: Array in state.pending_edits:
			if edit[0] == field: value = str(edit[1])
		if endpoint(field).text != value: endpoint(field).text = value
	_range = view.get("range") if view.get("range") is Dictionary else {}
	var locked: bool = state.busy or state.phase == "stale-draft" or not state.pending_edits.is_empty()
	for control: Control in controls():
		if control is BaseButton: control.disabled = locked
		elif control is LineEdit: control.editable = not state.busy
	_render_range(locked)


func _render_range(locked: bool) -> void:
	var entries: Array = _range.get("entries", [])
	for index in 4:
		var row: Control = get_node("Results/Result%d" % index)
		row.visible = index < entries.size()
		if row.visible: _render_entry(row, entries[index], locked)
	var total := int(_range.get("total", 0))
	var offset := int(_range.get("offset", 0))
	var wait := str(_range.get("waitMode", "no-message"))
	var wait_label := {"always": "waits for a click", "never": "no wait", "mixed": "mixed wait", "no-message": "no message"}
	var messages := int(_range.get("uniqueMessages", 0))
	$Summary.text = "%d possible result%s · %d message%s · %s" % [total, "" if total == 1 else "s", messages, "" if messages == 1 else "s", wait_label[wait]] if not _range.is_empty() else "Enter both endpoints to preview possible results."
	$Pager/Status.text = "Results %d–%d of %d" % [offset + 1, offset + entries.size(), total] if total > 0 else "No results to preview"
	$Pager/Previous.disabled = locked or offset == 0
	$Pager/Next.disabled = locked or offset + entries.size() >= total
	var unresolved: Dictionary = _range.get("firstUnresolved") if _range.get("firstUnresolved") is Dictionary else {}
	$Problem.visible = not unresolved.is_empty()
	$OpenMessages.visible = not unresolved.is_empty()
	if not unresolved.is_empty():
		$Problem.text = "Message %d is %s. Resolve every target before applying." % [int(unresolved.nativeId), str(unresolved.status)]
		$OpenMessages.text = "Open Messages · Message %d…" % int(unresolved.nativeId)


func _render_entry(row: Control, entry: Dictionary, locked: bool) -> void:
	var blank := str(entry.status) == "no-message"
	row.get_node("Content/Text/Identity").text = "No message" if blank else "Message %d · %s" % [int(entry.nativeId), "wait for click" if entry.waitsForClick else "no wait"]
	if not blank and str(entry.status) != "ready": row.get_node("Content/Text/Identity").text = "Message %d · %s" % [int(entry.nativeId), str(entry.status)]
	row.get_node("Content/Text/Excerpt").text = "Zero displays no message." if blank else (str(entry.textPreview) if str(entry.status) == "ready" else str(entry.status).capitalize())
	row.get_node("Content/Read").disabled = locked or str(entry.status) != "ready"
