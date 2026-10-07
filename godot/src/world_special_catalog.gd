extends VBoxContainer

signal query_requested(offset: int)
signal preview_requested(choice: Dictionary)
signal placement_requested(choice: Dictionary)
signal reference_requested(choice: Dictionary)
signal uses_requested(offset: int)
signal use_open_requested(use: Dictionary)
signal import_requested
signal recovery_requested

var _rows: Array = []
var _selected: Dictionary = {}
var _offset := 0
var _next := -1
var _uses_offset := 0
var _uses_next := -1
var _destination_available := false
var _verified := false
var _restore: Dictionary = {}


func _ready() -> void:
	for label in ["All sources", "Scenario", "Stock"]: %SpecialSource.add_item(label)
	%SpecialSearch.text_changed.connect(func(_text): query_requested.emit(0))
	%SpecialSource.item_selected.connect(func(_index): query_requested.emit(0))
	%SpecialUnavailable.toggled.connect(func(_value): query_requested.emit(0))
	%SpecialGallery.item_selected.connect(_select)
	%SpecialGallery.item_activated.connect(_activate)
	%SpecialPlace.pressed.connect(func(): placement_requested.emit(selected_choice()))
	%SpecialOpen.pressed.connect(func(): reference_requested.emit(selected_choice()))
	%SpecialImport.pressed.connect(import_requested.emit)
	%SpecialPrevious.pressed.connect(func(): query_requested.emit(maxi(0, _offset-64)))
	%SpecialNext.pressed.connect(func(): query_requested.emit(_next))
	%SpecialUses.item_activated.connect(func(index): use_open_requested.emit(%SpecialUses.get_item_metadata(index)))
	%SpecialUsesPrevious.pressed.connect(func(): uses_requested.emit(maxi(0, _uses_offset-128)))
	%SpecialUsesNext.pressed.connect(func(): uses_requested.emit(_uses_next))
	%SpecialRecover.pressed.connect(recovery_requested.emit)


func selected_choice() -> Dictionary:
	return _selected.duplicate(true)


func query(offset: int) -> Dictionary:
	return {"field":"specialLand", "currentValue":int(_selected.get("value",0)),
		"search":%SpecialSearch.text, "ownership":["all","scenario","stock"][%SpecialSource.selected],
		"showUnavailable":%SpecialUnavailable.button_pressed, "offset":offset, "seekCurrent":false, "limit":64}


func set_destination(identity: String, name: String, enabled: bool) -> void:
	_destination_available = enabled
	%SpecialDestination.text = "Place on %s · %s" % [identity,name] if enabled else "Open a Land map to choose a placement destination."
	%SpecialPlace.disabled = not enabled or not _verified


func set_loading() -> void:
	%SpecialCount.text = "Loading artwork…"
	%SpecialPlace.disabled = true
	%SpecialOpen.disabled = true


func present_page(result: Dictionary) -> void:
	var identity: String = str(_selected.get("identity",""))
	_rows = result.page.items
	clear_preview()
	%SpecialGallery.clear()
	var thumbnails: Dictionary = {}
	for row: Dictionary in result.get("specialThumbnails",[]): thumbnails[int(row.value)] = row.response
	var current := -1
	for index in _rows.size():
		var row: Dictionary = _rows[index]
		var texture: Texture2D = preload("res://src/item_artwork_lookup.gd").decode_texture(thumbnails.get(int(row.value),{}))
		%SpecialGallery.add_item("%d\n%s" % [int(row.value),row.label], texture)
		%SpecialGallery.set_item_tooltip(index, "%s · %s" % [row.ownership,row.label] if row.available else row.reason)
		if row.identity == identity: current = index
	_offset = int(result.page.offset)
	_next = _offset+_rows.size() if _offset+_rows.size()<int(result.page.total) else -1
	%SpecialCount.text = "%d matching artwork resources" % int(result.page.total)
	%SpecialPrevious.disabled = _offset==0
	%SpecialNext.disabled = _next<0
	if current>=0:
		%SpecialGallery.select(current)
		_select(current)
	elif _rows.is_empty(): %SpecialDetails.text = "No artwork matches this search. Change the source or search."
	if not _restore.is_empty():
		%SpecialGallery.get_v_scroll_bar().set_deferred("value", float(_restore.get("scroll",0)))
		%SpecialSearch.grab_focus()
		_restore.clear()


func _select(index: int) -> void:
	clear_preview()
	_selected = _rows[index].duplicate(true)
	%SpecialGallery.ensure_current_is_visible()
	%SpecialName.text = "%d · %s" % [int(_selected.value), _selected.label]
	%SpecialDetails.text = str(_selected.detail) if _selected.available else str(_selected.reason)
	if _selected.available: preview_requested.emit(selected_choice())


func _activate(index: int) -> void:
	if _rows[index].get("identity") != _selected.get("identity"): _select(index)
	elif not %SpecialPlace.disabled: placement_requested.emit(selected_choice())


func clear_preview() -> void:
	_selected.clear()
	_verified = false
	%SpecialArtwork.texture = null
	%SpecialUses.clear()
	%SpecialName.text = "Choose artwork to preview it"
	%SpecialDetails.text = ""
	%SpecialPlace.disabled = true
	%SpecialOpen.disabled = true
	%SpecialUsesCount.text = "No artwork selected"
	%SpecialUsesPrevious.disabled = true
	%SpecialUsesNext.disabled = true


func present_preview(choice: Dictionary, response: Dictionary, uses: Dictionary) -> void:
	if _selected.get("identity") != choice.identity: return
	%SpecialArtwork.texture = preload("res://src/item_artwork_lookup.gd").decode_texture(response)
	_verified = %SpecialArtwork.texture!=null and bool(choice.available)
	%SpecialPlace.disabled = not _destination_available or not _verified
	%SpecialOpen.disabled = choice.get("targetIdentity")==null or not _verified
	%SpecialDetails.text = "%s artwork · exact signed ID %d · 32 × 32 overlay" % [str(choice.ownership).capitalize(),int(choice.value)] if response.get("ok",false) else str(response.get("error",choice.reason))
	if response.get("ok",false):
		var artwork: Dictionary = response.result
		%SpecialDetails.text += "\nLandlook: %s · Base tile: %s\nTransparency reveals the base." % [
			str(artwork.landlook) if artwork.get("landlook")!=null else "use map",
			str(artwork.baseTile) if artwork.get("baseTile")!=null else "use map"]
	present_uses(uses)


func present_uses(result: Dictionary) -> void:
	%SpecialUses.clear()
	for row: Dictionary in result.get("items",[]):
		var index: int = %SpecialUses.add_item("%s · %d placements · %d,%d" % [row.name,int(row.cells),int(row.first.x),int(row.first.y)])
		%SpecialUses.set_item_metadata(index,row)
	_uses_offset = int(result.get("offset",0))
	var total := int(result.get("total",0))
	_uses_next = _uses_offset+%SpecialUses.item_count if _uses_offset+%SpecialUses.item_count<total else -1
	%SpecialUsesCount.text = "%d maps" % total if total>0 else "No placed uses"
	%SpecialUsesPrevious.disabled = _uses_offset==0
	%SpecialUsesNext.disabled = _uses_next<0


func present_failure(message: String, uncertain: bool) -> void:
	%SpecialCount.text = message
	%SpecialRecover.visible = uncertain
	%SpecialPlace.disabled = true
	%SpecialOpen.disabled = true
	_verified = false


func read_navigation_state() -> Dictionary:
	return {"query":%SpecialSearch.text, "source":%SpecialSource.selected, "unavailable":%SpecialUnavailable.button_pressed,
		"choice":selected_choice(), "offset":_offset, "scroll":%SpecialGallery.get_v_scroll_bar().value}


func restore_navigation_state(state: Dictionary) -> bool:
	%SpecialSearch.text = state.get("query","")
	%SpecialSource.select(int(state.get("source",0)))
	%SpecialUnavailable.set_pressed_no_signal(bool(state.get("unavailable",false)))
	_selected = state.get("choice",{}).duplicate(true)
	_restore = state.duplicate(true)
	query_requested.emit(int(state.get("offset",0)))
	return true
