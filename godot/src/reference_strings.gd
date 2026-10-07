class_name ProvidenceReferenceStrings
extends HSplitContainer

signal scrolling_text_selection_changed(resource_id: int)

@onready var _search: LineEdit = %ReferenceSearch
@onready var _list: ItemList = %ReferenceGroupList
@onready var _status: Label = %ReferenceGroupStatus
@onready var _identity: Label = %ReferenceIdentity
@onready var _entries: Tree = %EntryTable
@onready var _text: TextEdit = %EditableText
@onready var _source: Label = %SourceProvenance
@onready var _style: Label = %StyleEvidence
@onready var _reason: Label = %DisabledReason

var _summaries: Array = []
var _selected_identity := ""
var _type_filter := ""
var _bridge
var open_handler: Callable


func route_identity() -> String:
	return "text.text-resources"


func reload(bridge, preferred_identity := "") -> Dictionary:
	_bridge = bridge
	var response := _bridge.request("reference-string.list", {"offset": 0, "limit": 128}) as Dictionary
	if not bool(response.get("ok", false)):
		clear()
		_reason.text = str(response.get("error", "Reference strings could not be listed."))
		return response
	set_catalog(response.get("result", {}) as Dictionary)
	var identity := preferred_identity if not preferred_identity.is_empty() else first_identity()
	if identity.is_empty():
		set_document({})
		return response
	return open_group(identity)


func open_group(identity: String) -> Dictionary:
	if _bridge == null or identity.is_empty():
		return {"ok": false, "error": "Select a source-backed reference group."}
	var response := _bridge.request("reference-string.open", {
		"identity": identity,
		"entryOffset": 0,
		"entryLimit": 128,
	}) as Dictionary
	if bool(response.get("ok", false)):
		set_document(response.get("result", {}) as Dictionary)
	else:
		_clear_document()
		_reason.text = str(response.get("error", "The reference group could not be opened."))
	return response


func clear() -> void:
	_bridge = null
	set_catalog({"items": [], "total": 0})
	set_document({})


func _ready() -> void:
	_entries.set_column_title(0, "Entry")
	_entries.set_column_title(1, "Text")
	_entries.set_column_expand(0, false)
	_entries.set_column_custom_minimum_width(0, 72)


func set_catalog(result: Dictionary) -> void:
	_summaries = (result.get("items", []) as Array).duplicate(true)
	_status.text = "%d REFERENCE GROUPS" % int(result.get("total", _summaries.size()))
	_render_list()


func set_document(result: Dictionary) -> void:
	var group := result.get("group", {}) as Dictionary
	if group.is_empty():
		_clear_document()
		return
	var same_group := _selected_identity == str(group.get("identity", ""))
	_selected_identity = str(group.get("identity", ""))
	_identity.text = "%s %d  ·  %s" % [
		str(group.get("resourceType", "RESOURCE")),
		int(group.get("resourceId", 0)),
		str(group.get("label", "Unnamed reference group")),
	]
	var rows := result.get("entries", []) as Array
	_render_entries(rows, same_group)
	var text := str((rows[0] as Dictionary).get("text", "")) if not rows.is_empty() else ""
	if _text.text != text: _text.text = text
	_text.editable = false
	_source.text = "SOURCE  ·  %s  ·  exact %s:%d  ·  %s" % [
		str(group.get("source", "unknown")),
		str(group.get("resourceType", "resource")),
		int(group.get("resourceId", 0)),
		str(group.get("ownership", "unknown ownership")),
	]
	_style.text = (
		"STYLE EVIDENCE  ·  same-ID styl remains compatibility-preserved"
		if str(group.get("resourceType", "")) == "TEXT"
		else "STYLE EVIDENCE  ·  not applicable to this reference group"
	)
	_reason.text = (
		"This exact scenario TEXT is selectable for Rebuilt preview. Text editing remains in its bounded resource workflow."
		if _is_project_text(group)
		else "This group is readable reference data and cannot become a scrolling-text preview target."
	)
	_select_visible_identity()
	scrolling_text_selection_changed.emit(int(group.get("resourceId", 0)) if _is_project_text(group) else 0)


func first_identity() -> String:
	return str((_summaries[0] as Dictionary).get("identity", "")) if not _summaries.is_empty() else ""


func read_state() -> Dictionary:
	return {"identity": _selected_identity, "search": _search.text, "type": _type_filter}


func read_navigation_state() -> Dictionary:
	var state := read_state()
	state["listScroll"] = _list.get_v_scroll_bar().value
	state["textScroll"] = _text.scroll_vertical
	return state


func prime_navigation_state(state: Dictionary) -> void:
	_search.text = str(state.get("search", ""))
	_type_filter = str(state.get("type", ""))
	_render_list()


func restore_navigation_state(state: Dictionary) -> bool:
	if str(state.get("identity", "")) != _selected_identity: return false
	prime_navigation_state(state)
	_list.get_v_scroll_bar().value = float(state.get("listScroll", 0.0))
	_text.scroll_vertical = int(state.get("textScroll", 0))
	return true


func catalog_identity(items: Array) -> String:
	for item: Dictionary in items:
		if str(item.get("identity", "")) == _selected_identity: return _selected_identity
	return str(items[0].get("identity", "")) if not items.is_empty() else ""


func restore_selection() -> void:
	_list.deselect_all()
	_select_visible_identity()


func show_failure(response: Dictionary) -> void:
	if not response.get("busy", false): _reason.text = str(response.get("error", "The reference group could not be opened."))


func capture_view_state() -> Dictionary:
	return {"identity": _selected_identity, "listScroll": _list.get_v_scroll_bar().value,
		"textScroll": _text.scroll_vertical,
		"focus": get_viewport().gui_get_focus_owner()}


func restore_view_state(state: Dictionary) -> void:
	if state.identity != _selected_identity: return
	_list.get_v_scroll_bar().value = state.listScroll
	_text.scroll_vertical = state.textScroll
	var focus: Control = state.focus
	if is_instance_valid(focus) and focus.is_visible_in_tree() and is_ancestor_of(focus): focus.grab_focus()


func project_text_id(group: Dictionary) -> int:
	return int(group.resourceId) if _is_project_text(group) else 0


func _render_entries(rows: Array, same_group: bool) -> void:
	# Update an existing group's rows in place to retain Tree selection and
	# scroll position; rebuilding the Tree discards both interaction states.
	if not same_group: _entries.clear()
	var root := _entries.get_root()
	if root == null: root = _entries.create_item()
	while root.get_child_count() > rows.size(): root.get_child(root.get_child_count() - 1).free()
	for index in range(rows.size()):
		var row := root.get_child(index) if index < root.get_child_count() else _entries.create_item(root)
		row.set_text(0, str(int(rows[index].get("index", 0))))
		row.set_text(1, str(rows[index].get("text", "")))


func _render_list() -> void:
	_list.clear()
	var query := _search.text.strip_edges().to_lower()
	for value in _summaries:
		var summary := value as Dictionary
		var resource_type := str(summary.get("resourceType", ""))
		var haystack := "%s %s %s %s" % [
			resource_type,
			str(summary.get("resourceId", "")),
			str(summary.get("label", "")),
			str(summary.get("preview", "")),
		]
		if (not _type_filter.is_empty() and resource_type != _type_filter) or (not query.is_empty() and not haystack.to_lower().contains(query)):
			continue
		_list.add_item("%s %d  ·  %s" % [resource_type, int(summary.get("resourceId", 0)), str(summary.get("label", "Unnamed"))])
		_list.set_item_metadata(_list.item_count - 1, str(summary.get("identity", "")))
	_select_visible_identity()


func _select_visible_identity() -> void:
	for index in range(_list.item_count):
		if str(_list.get_item_metadata(index)) == _selected_identity:
			_list.select(index)
			return


func _on_group_selected(index: int) -> void:
	if index >= 0:
		var identity := str(_list.get_item_metadata(index))
		if open_handler.is_valid(): await open_handler.call(identity)
		else: open_group(identity)


func _on_search_changed(_value: String) -> void:
	_render_list()


func _on_type_filter_pressed(resource_type: String) -> void:
	_type_filter = "" if _type_filter == resource_type else resource_type
	_render_list()


func _is_project_text(group: Dictionary) -> bool:
	return (
		str(group.get("resourceType", "")) == "TEXT"
		and str(group.get("ownership", "")) == "project-text"
		and (group.get("resourceId") is int or group.get("resourceId") is float)
		and group.get("resourceId") == int(group.get("resourceId", 0))
		and int(group.get("resourceId", 0)) != 0
	)


func _clear_document() -> void:
	_selected_identity = ""
	_identity.text = "Select a reference resource"
	_entries.clear()
	_text.text = ""
	_source.text = "SOURCE  ·  exact type and signed resource ID"
	_style.text = "STYLE EVIDENCE  ·  select a TEXT or styl resource"
	_reason.text = "No reference resource is selected."
	scrolling_text_selection_changed.emit(0)
