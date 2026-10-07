class_name ProvidenceItemArtworkPicker
extends PanelContainer

signal search_requested(query: String, offset: int, request_id: int)
signal current_picture_requested(item: Dictionary, request_id: int)
signal apply_requested(artwork_identity: String, record_index: int, revision: int)
signal cancelled

const PAGE_SIZE := 32
var _request_id := 0
var _preview_id := 0
var _offset := 0
var _total := 0
var _revision := 0
var _rows: Array = []
var _selected: Dictionary = {}
var _artwork_identity := ""
var _pending := false
var _requires_review := false
var _apply_failed := false
var _proposal_unavailable := false
var _current_ready := false
@onready var _search: LineEdit = %DestinationSearch
@onready var _list: ItemList = %DestinationItems
@onready var _apply: Button = %ApplyArtwork


func begin(artwork_identity: String, picture: Texture2D) -> void:
	_search.clear_button_enabled = true
	_apply.add_theme_stylebox_override("normal", _apply.get_theme_stylebox("pressed"))
	_artwork_identity = artwork_identity
	%ProposedPicture.texture = picture
	_search.text = ""
	_pending = false
	_apply_failed = false
	_proposal_unavailable = false
	%CancelArtwork.text = "Cancel"
	_search.editable = true
	_list.mouse_filter = Control.MOUSE_FILTER_STOP
	_list.focus_mode = Control.FOCUS_ALL
	%CancelArtwork.disabled = false
	_load_page(0)
	_search.grab_focus()


func receive_items(result: Dictionary, request_id: int) -> void:
	if request_id != _request_id or _pending:
		return
	_rows = (result.get("items", []) as Array).slice(0, PAGE_SIZE)
	_revision = int(result.get("revision", 0))
	_total = int(result.get("total", 0))
	_list.clear()
	for row: Dictionary in _rows:
		var label := str(row.get("name", ""))
		if label.is_empty():
			label = "Unnamed item"
		_list.add_item("%s · Item %d" % [label, int(row.get("classicId", 0))])
		_list.set_item_tooltip(_list.item_count - 1, label)
	%ResultCount.text = "1 matching item" if _total == 1 else "%d matching items" % _total
	%PickerStatus.text = "No scenario items match your search." if _rows.is_empty() else "No item selected."
	%PreviousItems.disabled = _offset == 0
	%NextItems.disabled = _offset + PAGE_SIZE >= _total
	%PreviousItems.visible = _total > PAGE_SIZE
	%NextItems.visible = _total > PAGE_SIZE
	_update_apply()


func receive_current_picture(picture: Texture2D, request_id: int) -> void:
	if request_id != _preview_id or _selected.is_empty():
		return
	%CurrentPicture.texture = picture
	_current_ready = true
	%CurrentPictureState.text = "" if picture != null else ("No picture" if int(_selected.get("iconId", 0)) == 0 else "Current picture unavailable. You can replace it.")
	_update_apply()


func receive_failure(message: String, request_id: int) -> void:
	if request_id == _request_id:
		%PickerStatus.text = message


func is_pending() -> bool:
	return _pending


func accepts_search(request_id: int) -> bool:
	return request_id == _request_id and not _pending


func accepts_preview(request_id: int) -> bool:
	return request_id == _preview_id and not _selected.is_empty()


func close_selection() -> void:
	_request_id += 1
	_preview_id += 1
	_selected.clear()


func apply_unknown(message: String) -> void:
	_pending = false
	_requires_review = true
	%CancelArtwork.disabled = false
	%PickerStatus.text = "Outcome unknown. " + message + " Reopen the project before applying again."
	%ReviewCurrentItem.hide()
	_update_apply()


func apply_failed(message: String, requires_review: bool = false) -> void:
	_pending = false
	_apply_failed = true
	_proposal_unavailable = message.to_lower().contains("choose another picture")
	%CancelArtwork.text = "Choose another picture" if _proposal_unavailable else "Cancel"
	_search.editable = true
	_list.mouse_filter = Control.MOUSE_FILTER_STOP
	_list.focus_mode = Control.FOCUS_ALL
	%CancelArtwork.disabled = false
	%PickerStatus.text = "Not applied. " + message
	%ReviewCurrentItem.visible = requires_review
	_requires_review = requires_review
	if requires_review:
		_preview_id += 1
		_current_ready = false
		%CurrentPicture.texture = null
		%CurrentPictureState.text = "The item changed. Review its current picture."
	_update_apply()


func _load_page(offset: int) -> void:
	_request_id += 1
	_preview_id += 1
	_offset = offset
	_selected = {}
	_requires_review = false
	_rows = []
	_current_ready = false
	_list.clear()
	%SelectedItemName.text = "No item selected."
	%CurrentPicture.texture = null
	%CurrentPictureState.text = ""
	%ReviewCurrentItem.hide()
	%ResultCount.text = ""
	%PickerStatus.text = "Searching items…"
	%PreviousItems.disabled = true
	%NextItems.disabled = true
	_update_apply()
	search_requested.emit(_search.text, _offset, _request_id)


func _select_item(index: int) -> void:
	if _pending or index < 0 or index >= _rows.size():
		return
	_selected = (_rows[index] as Dictionary).duplicate(true)
	_preview_id += 1
	var label := str(_selected.get("name", "")).strip_edges()
	%SelectedItemName.text = "%s · Item %d" % [label if not label.is_empty() else "Unnamed item", int(_selected.get("classicId", 0))]
	%CurrentPicture.texture = null
	_current_ready = int(_selected.get("iconId", 0)) == 0
	%CurrentPictureState.text = "No picture" if _current_ready else "Loading picture…"
	%PickerStatus.text = "Only this item’s picture will change."
	_update_apply()
	if not _current_ready:
		current_picture_requested.emit(_selected.duplicate(true), _preview_id)


func _update_apply() -> void:
	_apply.disabled = _pending or _requires_review or _proposal_unavailable or _selected.is_empty() or not _current_ready or %ProposedPicture.texture == null or not bool(_selected.get("editable", false))
	_apply.text = "Retry Apply" if _apply_failed and not _proposal_unavailable else "Apply Artwork"
	%ProposedCaption.text = "Selected artwork — not applied" if _apply.disabled or _apply_failed else "After applying"


func _on_apply() -> void:
	if _apply.disabled:
		return
	_pending = true
	_search.editable = false
	_list.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_list.focus_mode = Control.FOCUS_NONE
	_list.release_focus()
	%CancelArtwork.disabled = true
	%PreviousItems.disabled = true
	%NextItems.disabled = true
	%PickerStatus.text = "Applying artwork…"
	_update_apply()
	apply_requested.emit(_artwork_identity, int(_selected["recordIndex"]), _revision)


func _on_cancel() -> void:
	if not _pending:
		cancelled.emit()


func _on_search(_text: String) -> void:
	if not _pending:
		_load_page(0)


func _on_previous() -> void:
	_load_page(maxi(0, _offset - PAGE_SIZE))


func _on_next() -> void:
	_load_page(_offset + PAGE_SIZE)


func _on_review() -> void:
	_load_page(_offset)


func _on_search_submitted(_text: String) -> void:
	_list.grab_focus()


func _unhandled_key_input(event: InputEvent) -> void:
	if is_visible_in_tree() and event.is_action_pressed("ui_cancel"):
		_on_cancel()
		get_viewport().set_input_as_handled()
