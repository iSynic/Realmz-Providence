class_name ProvidencePlayerMapsEditor
extends VBoxContainer

signal record_open_requested(identity: String)
signal record_update_requested(player_map: Dictionary, names: Dictionary)
signal map_open_requested(identity: String)
signal text_open_requested(resource_id: int)
signal picture_preview_requested(native_id: int)
signal source_open_requested(reference: Dictionary)
signal resource_open_requested(identity: String, scope: String, kind: String)
signal uses_page_requested(offset: int)

var controller: RefCounted
var commit_handler: Callable
var _document: Dictionary = {}
var _names: Dictionary = {}
var _summaries: Array = []
var _markers: Array = []
var _revision := 0
var _binding := false
var _locked := false
var _recovery := false
var _valid := false
var _preview_current := false
var _preview_geometry: Dictionary = {}
var _selected_slot := 0
var _pending_mode := -1
var _new_available := false
var _document_generation := 0
var _selectors := preload("res://src/player_map_selectors.gd").new()

const NUMBER_FIELDS := {"startX": "StartX", "startY": "StartY", "level": "PlayerMapLevel", "pictureId": "PlayerMapPictureId", "iconSize": "PlayerMapIconSize", "show": "PlayerMapShow"}
const RECT_FIELDS := {"top": "RectTop", "left": "RectLeft", "bottom": "RectBottom", "right": "RectRight"}


func _ready() -> void:
	for label in ["Terrain crop", "Picture", "Scrolling TEXT"]: %DisplayMode.add_item(label)
	for index in 10: %MarkerSlot.add_item("Slot %d" % (index + 1))
	for name in NUMBER_FIELDS.values() + RECT_FIELDS.values(): get_node("%" + name).value_changed.connect(func(_value: float): draft_changed())
	for field in [%AvailableName, %UnavailableName]: field.text_changed.connect(func(_text: String): draft_changed())
	%PlayerMapNote.text_changed.connect(draft_changed)
	%PlayerMapDungeon.toggled.connect(func(_value: bool): draft_changed())
	%PlayerMapSearch.text_changed.connect(func(_query: String): _render_list())
	%PlayerMapRecordList.item_selected.connect(func(index: int): record_open_requested.emit(str(%PlayerMapRecordList.get_item_metadata(index))))
	%NewPlayerMap.pressed.connect(func(): if controller != null: await controller.create_record())
	%ApplyPlayerMap.pressed.connect(commit_selected)
	%DiscardPlayerMap.pressed.connect(discard_draft)
	%ResolvePlayerMap.pressed.connect(func(): if controller != null: await controller.resolve_original_result())
	%CopyPlayerMapDraft.pressed.connect(func(): DisplayServer.clipboard_set(preload("res://src/native_json.gd").stringify(draft_params())))
	%MarkerSlot.item_selected.connect(_select_marker)
	for field in [%MarkerIcon, %MarkerX, %MarkerY]: field.value_changed.connect(_change_marker)
	%ClearMarker.pressed.connect(_clear_marker)
	%PlaceMarker.toggled.connect(func(_value: bool): _refresh_marker_paint())
	%PlayerMapPreview.marker_placed.connect(_place_marker)
	%PlayerMapPreview.painting_stopped.connect(stop_marker_paint)
	%DisplayMode.item_selected.connect(_request_mode)
	$ModeConfirmation.confirmed.connect(_accept_mode)
	$ModeConfirmation.canceled.connect(_cancel_mode)
	%RefreshPreview.pressed.connect(func(): if controller != null: await controller.refresh_preview())
	%ZoomIn.pressed.connect(func(): _zoom(0.25)); %ZoomOut.pressed.connect(func(): _zoom(-0.25))
	$DraftDelay.timeout.connect(func(): if controller != null: await controller.validate_and_preview())
	%OpenPlayerMapTarget.pressed.connect(func(): map_open_requested.emit(target_identity()))
	%OpenPlayerMapText.pressed.connect(func(): if int(_document.get("show", 0)) < 0: text_open_requested.emit(int(_document.show)))
	%PreviewPlayerMapPicture.pressed.connect(func(): picture_preview_requested.emit(int(%PlayerMapPictureId.value)))
	%Links.meta_clicked.connect(func(index: Variant):
		if str(index) == "retry-uses" and controller != null: await controller.load_uses(0)
		elif int(index) >= 0 and int(index) < _references.size(): source_open_requested.emit(_references[int(index)].duplicate(true)))
	%UsesPrevious.pressed.connect(func(): uses_page_requested.emit(maxi(0, _uses_offset - 64)))
	%UsesNext.pressed.connect(func(): uses_page_requested.emit(_uses_offset + 64))
	_selectors.initialize(self, $ResourcePicker, $TargetPicker)
	visibility_changed.connect(func(): if not is_visible_in_tree(): _selectors.cancel(); $ModeConfirmation.hide(); stop_marker_paint())


func set_catalog(result: Dictionary) -> void:
	_summaries = result.get("records", []).duplicate(true)
	_new_available = result.get("canCreate", false)
	%PlayerMapCount.text = "%d records · %s" % [int(result.get("total", 0)), "free slots available" if _new_available else "no free runtime slots"]
	%NewPlayerMap.tooltip_text = "Create the lowest free runtime slot." if _new_available else "All slots 0–19 are occupied. Imported empty rows also own their slots."
	_render_list(); _refresh_actions()


func set_document(result: Dictionary) -> void:
	_document_generation += 1
	stop_marker_paint(); _preview_geometry.clear()
	_selectors.cancel()
	_binding = true
	_document = _typed_record(result.get("playerMap", {}))
	_names = result.get("names", {}).duplicate(true)
	_revision = int(result.get("revision", _revision))
	_recovery = false; _valid = not _document.is_empty()
	_markers = _document.get("markers", []).duplicate(true)
	%PlayerMapIdentity.text = "PLAYER MAP %03d · %s" % [int(_document.get("nativeId", 0)), str(_names.get("effectiveName", "Unnamed"))] if not _document.is_empty() else "No Player Map selected"
	%AvailableName.text = str(_names.get("availableName", "")); %UnavailableName.text = str(_names.get("unavailableName", ""))
	for field in NUMBER_FIELDS: get_node("%" + NUMBER_FIELDS[field]).value = int(_document.get(field, 0))
	for field in RECT_FIELDS: get_node("%" + RECT_FIELDS[field]).value = int(_document.get("pictureRect", {}).get(field, 0))
	%PlayerMapDungeon.set_pressed_no_signal(_document.get("isDungeon", false))
	%PlayerMapNote.text = str(_document.get("note", ""))
	%DisplayMode.select(_mode())
	_selected_slot = 0; %MarkerSlot.select(0); _bind_marker()
	_binding = false
	%PlayerMapPreview.clear(); %TextPreview.text = ""; %PreviewReason.text = ""
	_preview_current = false; %TextByteCounts.text = "Checking current text…"
	%PlayerMapIdentity.tooltip_text = %PlayerMapIdentity.text
	%PlayerMapStatus.text = "Saved Player Map" if _valid else "No Player Map."
	_render_links(result); restore_catalog_selection(); set_interaction(false)


func _typed_record(source: Dictionary) -> Dictionary:
	var record := source.duplicate(true)
	for field in ["nativeId"] + NUMBER_FIELDS.keys():
		if record.has(field): record[field] = int(record[field])
	for marker: Dictionary in record.get("markers", []):
		for field in ["iconId", "x", "y"]: marker[field] = int(marker.get(field, 0))
	for field in record.get("pictureRect", {}): record.pictureRect[field] = int(record.pictureRect[field])
	return record


func draft_record() -> Dictionary:
	if _document.is_empty(): return {}
	var record := _document.duplicate(true)
	for field in NUMBER_FIELDS: record[field] = int(get_node("%" + NUMBER_FIELDS[field]).value)
	record["isDungeon"] = %PlayerMapDungeon.button_pressed
	record["note"] = %PlayerMapNote.text
	record["markers"] = _markers.duplicate(true)
	var rect := {}
	for field in RECT_FIELDS: rect[field] = int(get_node("%" + RECT_FIELDS[field]).value)
	record["pictureRect"] = rect
	return record


func draft_names() -> Dictionary:
	return {"availableName": %AvailableName.text, "unavailableName": %UnavailableName.text}


func draft_params() -> Dictionary:
	var params := {"expectedRevision": _revision, "playerMap": draft_record()}
	if int(_document.get("nativeId", 20)) < 20: params["names"] = draft_names()
	return params


func draft_token() -> Dictionary:
	return {"generation": _document_generation, "identity": _document.get("identity", ""), "slot": _selected_slot, "revision": _revision, "record": draft_record(), "names": draft_names()}


func has_unapplied_changes() -> bool:
	if _document.is_empty(): return false
	var equal = preload("res://src/document_value_equality.gd")
	return not equal.equal(draft_record(), _document) or (int(_document.nativeId) < 20 and not equal.equal(draft_names(), {"availableName": _names.get("availableName", ""), "unavailableName": _names.get("unavailableName", "")}))


func draft_changed() -> void:
	if _binding or _locked or _document.is_empty(): return
	_valid = false
	_preview_current = false
	%PlayerMapStatus.text = "Draft · checking fields…"
	%DisplayMode.select(_mode())
	_selectors.cancel(); %PreviewReason.text = "Draft preview refreshing…"
	$DraftDelay.start(); _refresh_actions()


func accept_validation(result: Dictionary) -> void:
	_valid = result.get("valid", false)
	%PlayerMapStatus.text = str(result.get("error", "")) if not _valid else "Unapplied changes" if has_unapplied_changes() else "Saved Player Map"
	var counts: Array = []
	for key in ["noteBytes", "availableNameBytes", "unavailableNameBytes"]:
		var value: Variant = result.get(key)
		counts.append("unrepresentable" if value == null else "%d / 255" % int(value))
	%TextByteCounts.text = "MacRoman bytes · Note %s · Names %s, %s" % counts
	_refresh_actions()


func accept_preview(response: Dictionary) -> void:
	_preview_current = response.get("ok", false)
	_preview_geometry = _marker_geometry() if _preview_current else {}
	%PreviewReason.text = %PlayerMapPreview.receive(response)
	var is_text: bool = response.get("ok", false) and response.result.get("mode") == "scrolling-text"
	%TextPreview.visible = is_text
	%TextPreview.text = str(response.result.resource.get("text", "")) if is_text else ""
	%PlayerMapPreview.get_parent().visible = not is_text
	_refresh_actions()


func set_interaction(locked: bool) -> void:
	_locked = locked
	for name in NUMBER_FIELDS.values() + RECT_FIELDS.values() + ["MarkerIcon", "MarkerX", "MarkerY"]: get_node("%" + name).editable = not locked and not _recovery and not _document.is_empty()
	for field in [%AvailableName, %UnavailableName]: field.editable = not locked and not _recovery and int(_document.get("nativeId", 20)) < 20
	%PlayerMapNote.editable = not locked and not _recovery and not _document.is_empty()
	%PlayerMapDungeon.disabled = locked or _recovery or _document.is_empty()
	_refresh_actions()


func _refresh_actions() -> void:
	if not is_node_ready(): return
	var disabled := _locked or _recovery or _document.is_empty()
	%NewPlayerMap.disabled = _locked or _recovery or has_unapplied_changes() or not _new_available
	for field in [%DisplayMode, %MarkerSlot, %ChooseMarker, %ChooseTarget, %ChoosePicture, %ChooseText, %ClearMarker, %RefreshPreview]: field.disabled = disabled
	%ApplyPlayerMap.disabled = disabled or not _valid or not has_unapplied_changes()
	%DiscardPlayerMap.disabled = disabled or not has_unapplied_changes()
	%ResolvePlayerMap.visible = _recovery; %ResolvePlayerMap.disabled = _locked
	_refresh_marker_paint()
	%OpenPlayerMapTarget.disabled = disabled or _mode() == 2
	%OpenPlayerMapText.disabled = disabled or has_unapplied_changes() or int(_document.get("show", 0)) >= 0
	%PreviewPlayerMapPicture.disabled = disabled or int(%PlayerMapPictureId.value) == 0
	for field in [%AvailableName, %UnavailableName]: field.tooltip_text = "Menu names are unavailable for imported extra rows outside slots 0–19." if int(_document.get("nativeId", 20)) >= 20 else "255 MacRoman bytes maximum."


func show_result(response: Dictionary) -> void:
	if response.get("outcomeUnknown", false) or response.has("viewRefreshError"):
		_recovery = true
		set_interaction(false)
	%PlayerMapStatus.text = str(response.get("viewRefreshError", response.get("error", "Player Map saved.")))


func acknowledge_saved(record: Dictionary, names: Dictionary, revision: int) -> void:
	_document = _typed_record(record); _document["authored"] = true
	_names.merge(names, true); _revision = revision


func unlock_recovery() -> void:
	_recovery = false; set_interaction(false)


func restore_draft_token(token: Dictionary) -> void:
	var saved := _document.duplicate(true); var names := _names.duplicate(true)
	set_document({"playerMap": token.record, "names": token.names, "revision": _revision})
	_document = saved; _names = names
	draft_changed()


func commit_selected() -> void:
	if not %ApplyPlayerMap.disabled and commit_handler.is_valid(): await commit_handler.call(draft_record(), draft_names())


func discard_draft() -> void:
	if _locked or _recovery: return
	set_document({"playerMap": _document, "names": _names, "revision": _revision})
	$DraftDelay.start()


func current_player_map() -> Dictionary: return _document.duplicate(true)
func applied_scrolling_text_resource_id() -> int: return int(_document.get("show", 0)) if int(_document.get("show", 0)) < 0 else 0
func read_state() -> Dictionary: return {"identity": _document.get("identity", ""), "query": %PlayerMapSearch.text}
func applied_revision() -> int: return _revision
func can_edit() -> bool: return not _locked and not _recovery and not _document.is_empty()
func target_identity() -> String: return ("dungeon:" if %PlayerMapDungeon.button_pressed else "land:") + str(int(%PlayerMapLevel.value))
func _mode() -> int: return 2 if int(%PlayerMapShow.value) < 0 else 1 if int(%PlayerMapPictureId.value) != 0 else 0


func _select_marker(slot: int) -> void:
	_selected_slot = slot; _selectors.cancel(); _bind_marker()
	%PlayerMapPreview.cancel_pointer(); _refresh_marker_paint()
	if can_edit(): $DraftDelay.start()


func _bind_marker() -> void:
	var marker: Dictionary = _markers[_selected_slot] if _selected_slot < _markers.size() else {}
	_binding = true
	%MarkerIcon.value = int(marker.get("iconId", 0)); %MarkerX.value = int(marker.get("x", 0)); %MarkerY.value = int(marker.get("y", 0))
	_binding = false


func _change_marker(_value: float) -> void:
	if _binding or not can_edit() or _selected_slot >= _markers.size(): return
	_markers[_selected_slot] = {"iconId": int(%MarkerIcon.value), "x": int(%MarkerX.value), "y": int(%MarkerY.value)}
	draft_changed()


func _clear_marker() -> void:
	if not can_edit() or _selected_slot >= _markers.size(): return
	stop_marker_paint()
	_markers[_selected_slot] = {"iconId": 0, "x": 0, "y": 0}; _bind_marker(); draft_changed()


func _place_marker(cell: Vector2i) -> void:
	if not %PlayerMapPreview.placing or _selected_slot >= _markers.size(): return
	if int(_markers[_selected_slot].x) == cell.x and int(_markers[_selected_slot].y) == cell.y: return
	_markers[_selected_slot]["x"] = cell.x; _markers[_selected_slot]["y"] = cell.y
	%PlayerMapPreview.move_marker(_selected_slot, cell)
	_bind_marker(); draft_changed()


func arm_marker_paint() -> void:
	if not can_edit() or _mode() != 0 or int(%MarkerIcon.value) == 0: return
	%PlaceMarker.set_pressed_no_signal(true)
	_refresh_marker_paint()


func stop_marker_paint() -> void:
	%PlaceMarker.set_pressed_no_signal(false)
	%PlayerMapPreview.placing = false
	%PlayerMapPreview.cancel_pointer()


func _marker_geometry() -> Dictionary:
	var record := draft_record()
	var geometry := {"generation": _document_generation, "revision": _revision}
	for key in ["startX", "startY", "level", "isDungeon", "iconSize", "pictureId", "show"]: geometry[key] = record.get(key)
	return geometry


func _refresh_marker_paint() -> void:
	var available := can_edit() and _mode() == 0 and int(%MarkerIcon.value) != 0
	if not available: stop_marker_paint()
	var current: bool = not _preview_geometry.is_empty() and _preview_geometry == _marker_geometry() and not %PlayerMapPreview.projection.is_empty()
	%PlaceMarker.disabled = not available or not current
	%PlayerMapPreview.placing = available and current and %PlaceMarker.button_pressed
	if not %PlayerMapPreview.placing: %PlayerMapPreview.cancel_pointer()
	%PlaceMarker.tooltip_text = "Choose a nonempty icon for this marker first." if int(%MarkerIcon.value) == 0 else "Painting is available on a current terrain crop."


func _request_mode(mode: int) -> void:
	if not can_edit(): return
	_pending_mode = mode
	%DisplayMode.select(_mode())
	$ModeConfirmation.dialog_text = ["Terrain sets Picture ID to 0 and Show to 1.", "Picture sets Show to 1. Choose an exact nonzero PICT before applying.", "Scrolling TEXT requires an exact negative TEXT ID. Choose it after confirmation."][mode] + " Other crop, marker and note values remain retained."
	$ModeConfirmation.popup_centered()


func _accept_mode() -> void:
	if not can_edit(): return
	if _pending_mode == 0: %PlayerMapPictureId.value = 0; %PlayerMapShow.value = 1
	elif _pending_mode == 1: %PlayerMapShow.value = 1; _selectors.choose_resource("picture", %ChoosePicture)
	else: _selectors.choose_resource("scrollingText", %ChooseText)
	_pending_mode = -1


func _cancel_mode() -> void:
	_pending_mode = -1; %DisplayMode.grab_focus()


func _zoom(delta: float) -> void:
	%PlayerMapPreview.set_zoom(%PlayerMapPreview.zoom + delta)
	%ZoomLabel.text = "%d%%" % int(%PlayerMapPreview.zoom * 100)


func catalog_identity(records: Array, preferred := "") -> String:
	var selected := preferred if not preferred.is_empty() else str(_document.get("identity", ""))
	if records.any(func(record): return str(record.identity) == selected): return selected
	return str(records[0].identity) if not records.is_empty() else ""


func restore_catalog_selection() -> void:
	for index in %PlayerMapRecordList.item_count:
		if str(%PlayerMapRecordList.get_item_metadata(index)) == str(_document.get("identity", "")): %PlayerMapRecordList.select(index); return


func _render_list() -> void:
	var scroll: float = %PlayerMapRecordList.get_v_scroll_bar().value
	%PlayerMapRecordList.clear()
	var needle: String = %PlayerMapSearch.text.strip_edges().to_lower()
	for row: Dictionary in _summaries:
		var search := "%s %s %s %s %s %s" % [row.get("nativeId", 0), row.get("name", ""), row.get("unavailableName", ""), row.get("note", ""), row.get("mode", ""), row.get("target", "")]
		if not needle.is_empty() and not search.to_lower().contains(needle): continue
		%PlayerMapRecordList.add_item("%02d  %s" % [int(row.get("nativeId", 0)), str(row.get("name", "Unnamed"))])
		var index: int = %PlayerMapRecordList.item_count - 1
		%PlayerMapRecordList.set_item_metadata(index, str(row.identity)); %PlayerMapRecordList.set_item_tooltip(index, search)
	restore_catalog_selection(); %PlayerMapRecordList.get_v_scroll_bar().set_deferred("value", scroll)


var _references: Array = []
var _uses_offset := 0

func _render_links(result: Dictionary) -> void:
	set_uses(result.get("usedBy", {}))


func set_uses(page: Dictionary) -> void:
	_references = page.get("items", []).duplicate(true)
	_uses_offset = int(page.get("offset", 0))
	%UsesPrevious.disabled = _uses_offset == 0
	%UsesNext.disabled = not page.get("truncated", false)
	%Links.clear()
	if page.has("unavailableReason"):
		%UsesPrevious.disabled = true; %UsesNext.disabled = true
		%Links.append_text("Used By unavailable · " + str(page.unavailableReason) + "\n[url=retry-uses]Retry caller lookup[/url]\n")
		return
	%Links.append_text("Used By · %d callers\n" % int(page.get("total", 0)))
	for index in _references.size():
		var row: Dictionary = _references[index]
		%Links.append_text("[url=%d]%s · %s[/url]\n" % [index, row.get("source", "Caller"), row.get("field", "")])


func focus_media_field(field: String) -> void:
	var target: Control = %ChoosePicture if field == "picture" else %ChooseText if field == "scrollingText" else %ChooseMarker
	target.grab_focus()


func focus_source(_identity: String, _slot: int, field: String) -> bool:
	if field.begins_with("markers["):
		_select_marker(clampi(int(field.get_slice("[", 1).get_slice("]", 0)), 0, 9)); %MarkerSlot.select(_selected_slot)
		focus_media_field(field); return true
	if field == "level": %ChooseTarget.grab_focus(); return true
	if field in ["picture", "scrollingText"]: focus_media_field(field); return true
	return false


func read_navigation_state() -> Dictionary:
	var focus := get_viewport().gui_get_focus_owner()
	return {"identity": _document.get("identity", ""), "query": %PlayerMapSearch.text, "slot": _selected_slot,
		"listScroll": %PlayerMapRecordList.get_v_scroll_bar().value, "scroll": %PlayerMapDetailScroll.scroll_vertical,
		"focus": str(get_path_to(focus)) if focus != null and is_ancestor_of(focus) else ""}


func restore_navigation_state(state: Dictionary) -> bool:
	if str(state.get("identity", "")) != str(_document.get("identity", "")) and controller != null:
		var response: Dictionary = await controller.open_record(str(state.identity))
		if not response.get("ok", false): return false
	%PlayerMapSearch.text = str(state.get("query", "")); _select_marker(int(state.get("slot", 0))); %MarkerSlot.select(_selected_slot)
	%PlayerMapRecordList.get_v_scroll_bar().set_deferred("value", float(state.get("listScroll", 0)))
	%PlayerMapDetailScroll.set_deferred("scroll_vertical", int(state.get("scroll", 0)))
	var focus := get_node_or_null(str(state.get("focus", ""))) as Control
	if focus != null and focus.is_visible_in_tree(): focus.call_deferred("grab_focus")
	return true
