extends Window

signal layout_requested(identity: String)
signal accept_requested
signal recovery_requested
signal retry_requested

var context: Dictionary = {}
var _edit: Dictionary = {}
var _original: Dictionary = {}
var _focus: WeakRef
var _atlas: Texture2D
var _tile := 1
var _loading := false
var _busy := false
var _locked := false
const FAMILIES := ["water", "mountains", "forest"]


func _ready() -> void:
	%Layout.item_selected.connect(func(index): layout_requested.emit(str(%Layout.get_item_metadata(index))))
	%SampleFamily.item_selected.connect(func(_index): _samples())
	%Samples.tile_selected.connect(_select_tile)
	%Search.text_changed.connect(func(_text): _filter())
	%Tiles.item_selected.connect(func(index): _select_tile(int(%Tiles.get_item_metadata(index))))
	for field in [%TileName, %Material, %CategoryName]: field.text_changed.connect(_labels_changed)
	%Exclude.toggled.connect(_exclude_changed)
	for family: String in FAMILIES: get_node("%" + family.capitalize()).toggled.connect(_family_changed.bind(family))
	%Accept.pressed.connect(accept_requested.emit)
	%Recovery.pressed.connect(recovery_requested.emit)
	%Retry.pressed.connect(retry_requested.emit)
	%Cancel.pressed.connect(cancel); close_requested.connect(cancel)


func open(data: Dictionary, artwork: Dictionary, origin: Control) -> void:
	%Retry.hide(); %Families.show(); %Columns.show(); %Layout.show()
	_focus = weakref(origin); _loading = true; _locked = false
	context = data.duplicate(true); _edit = initial_edit(data); _original = _edit.duplicate(true)
	_atlas = preload("res://src/map_atlas_artwork.gd").decode(artwork).get("texture")
	%Heading.text = "TERRAIN MAPPING · %s" % str(data.mapIdentity)
	%Layout.clear()
	for row in data.layouts:
		%Layout.add_item(row.name); %Layout.set_item_metadata(%Layout.item_count - 1, row.identity)
		if row.identity == data.layoutIdentity: %Layout.select(%Layout.item_count - 1)
	%Search.text = ""; _loading = false
	present_review(data, false); set_busy(false)
	popup_centered(Vector2i(1100,700)); %Layout.grab_focus()


func open_failure(message: String, identity: String, origin: Control) -> void:
	_focus = weakref(origin); context.clear(); _edit.clear(); _original.clear()
	_busy = false; _locked = false; _atlas = null
	%Heading.text = "TERRAIN MAPPING · %s" % identity
	%Families.hide(); %Columns.hide(); %Layout.hide(); %Recovery.hide()
	%Status.text = message + "\nRestore this map's artwork or choose another map, then retry. A layout cannot be reviewed without its tiles."
	%Accept.disabled = true; %Cancel.disabled = false; %Retry.show()
	popup_centered(Vector2i(1100,700)); %Retry.grab_focus()


func initial_edit(data: Dictionary) -> Dictionary:
	var current: Dictionary = data.get("current") if data.get("current") is Dictionary else {}
	return {"expectedMappingRevision":data.mappingRevision,"layoutIdentity":data.layoutIdentity,
		"layoutRevision":data.layoutRevision,"reviewedFamilies":current.get("reviewedFamilies", []).duplicate(),
		"excludedTiles":current.get("excludedTiles", []).map(func(tile): return int(tile)),"tileLabels":current.get("tileLabels", {}).duplicate(true),
		"categoryLabels":current.get("categoryLabels", {}).duplicate(true)}


func present_review(data: Dictionary, changed_layout := true) -> void:
	context = data.duplicate(true); _edit.layoutIdentity = data.layoutIdentity; _edit.layoutRevision = data.layoutRevision
	if changed_layout: _edit.reviewedFamilies.clear()
	_loading = true
	for row in data.families:
		var button: CheckBox = get_node("%" + str(row.identity).capitalize())
		button.text = "%s · %s" % [str(row.identity).capitalize(), "exact match" if row.exact else str(row.state)]
		button.tooltip_text = row.reason
		if row.exact and row.state != "unavailable" and not _edit.reviewedFamilies.has(row.identity): _edit.reviewedFamilies.append(row.identity)
		button.set_pressed_no_signal(_edit.reviewedFamilies.has(row.identity)); button.disabled = row.state == "unavailable"
	_loading = false; _filter(); _select_tile(_tile); _status()


func draft() -> Dictionary:
	var result := _edit.duplicate(true)
	result.expectedMappingRevision = int(result.expectedMappingRevision)
	result.layoutRevision = int(result.layoutRevision)
	result.excludedTiles = result.excludedTiles.map(func(tile): return int(tile))
	return result


func restore_draft(edit: Dictionary) -> void:
	_edit = edit.duplicate(true); _edit.expectedMappingRevision = context.mappingRevision
	for family: String in FAMILIES: get_node("%" + family.capitalize()).set_pressed_no_signal(_edit.reviewedFamilies.has(family))
	_filter(); _select_tile(_tile); _status()


func has_unapplied_changes() -> bool:
	return visible and (_locked or _edit != _original)


func _filter() -> void:
	%Tiles.clear()
	var query: String = %Search.text.to_lower().strip_edges()
	for row in context.get("tileCatalog", {}).get("items", []):
		var tile := int(row.tile)
		var label := _label_text(_edit.tileLabels.get(str(tile), {}).get("name"), row.name)
		var text := "%d · %s" % [tile,label]
		if not query.is_empty() and not (text + " " + str(row.get("material", ""))).to_lower().contains(query): continue
		%Tiles.add_item(text); %Tiles.set_item_metadata(%Tiles.item_count - 1,tile)
		if tile == _tile: %Tiles.select(%Tiles.item_count - 1)


func _select_tile(tile: int) -> void:
	_tile = tile; _loading = true
	var rows: Array = context.get("tileCatalog", {}).get("items", [])
	if rows.size() < tile: _loading = false; return
	var row: Dictionary = rows[tile - 1]
	var label: Dictionary = _edit.tileLabels.get(str(tile), {})
	%TileName.text = _label_text(label.get("name"), row.name); %Material.text = _label_text(label.get("material"), row.get("material"))
	%CategoryName.text = str(_edit.categoryLabels.get(row.category, row.categoryLabel))
	%Exclude.set_pressed_no_signal(_edit.excludedTiles.has(tile))
	%TileHelp.text = preload("res://src/land_tile_description.gd").tooltip(tile,row)
	for index in %Tiles.item_count:
		if int(%Tiles.get_item_metadata(index)) == tile: %Tiles.select(index); %Tiles.ensure_current_is_visible()
	_loading = false; _samples()


func _samples() -> void:
	var family: String = FAMILIES[%SampleFamily.selected]
	var rows: Array = context.get("samples", []).filter(func(row): return row.family == family)
	%Samples.present(rows,_atlas,_tile)


func _labels_changed(_text: String) -> void:
	if _loading or _locked: return
	var label := {}
	if not %TileName.text.strip_edges().is_empty(): label.name = %TileName.text
	if not %Material.text.strip_edges().is_empty(): label.material = %Material.text
	_edit.tileLabels[str(_tile)] = label
	var category: String = context.tileCatalog.items[_tile - 1].category
	if not %CategoryName.text.strip_edges().is_empty(): _edit.categoryLabels[category] = %CategoryName.text
	_filter(); _status()


func _exclude_changed(value: bool) -> void:
	if _loading or _locked: return
	_edit.excludedTiles.erase(_tile)
	if value: _edit.excludedTiles.append(_tile)
	_edit.excludedTiles.sort(); _status()


func _family_changed(value: bool, family: String) -> void:
	if _loading or _locked: return
	_edit.reviewedFamilies.erase(family)
	if value: _edit.reviewedFamilies.append(family)
	_edit.reviewedFamilies.sort(); _status()


func _status() -> void:
	var excluded := PackedStringArray()
	for row in context.get("families", []):
		if row.tileIds.any(func(tile): return _edit.excludedTiles.has(int(tile))): excluded.append(str(row.identity).capitalize())
	%Status.text = "Family review required."
	if not excluded.is_empty(): %Status.text = "Excluded required slots disable %s. Other compatible families remain available." % ", ".join(excluded)


func set_busy(value: bool, unknown := false) -> void:
	_busy = value; _locked = unknown
	for control in [%Layout,%SampleFamily,%Accept,%Cancel,%Exclude]: control.disabled = value
	for field in [%Search,%TileName,%Material,%CategoryName]: field.editable = not value
	%Tiles.mouse_filter = Control.MOUSE_FILTER_IGNORE if value else Control.MOUSE_FILTER_STOP
	for row in context.get("families", []): get_node("%" + str(row.identity).capitalize()).disabled = value or row.state == "unavailable"
	%Recovery.visible = unknown; %Recovery.disabled = false


func show_failure(message: String) -> void:
	%Status.text = message
	for index in %Layout.item_count:
		if %Layout.get_item_metadata(index) == _edit.layoutIdentity: %Layout.select(index)


func cancel() -> void:
	if not _busy and not _locked: dismiss()


func dismiss() -> void:
	hide()
	if _focus != null and is_instance_valid(_focus.get_ref()) and _focus.get_ref().is_inside_tree(): _focus.get_ref().grab_focus()


func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE: cancel(); set_input_as_handled()


func _label_text(value: Variant, fallback: Variant = null) -> String:
	return str(value) if value != null else str(fallback) if fallback != null else ""
