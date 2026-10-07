extends Window

signal source_requested(look: int)
signal review_requested
signal apply_requested
signal recovery_requested
signal canceled
signal behavior_requested
signal behavior_decided(choice: String)

var context: Dictionary = {}
var _original: Dictionary = {}
var _review: Dictionary = {}
var _busy := false
var _loading := false
var _focus: WeakRef


func _ready() -> void:
	%SourceTemplate.item_selected.connect(func(_index): _changed(); _read_source())
	%Operation.item_selected.connect(func(_index): _changed(); _read_source())
	for look in range(6, 9): get_node("%Custom" + str(look)).pressed.connect(_select_destination.bind(look))
	%ImportMode.item_selected.connect(func(_index): _changed())
	%TargetTile.value_changed.connect(func(_value): _changed())
	%SourcePath.text_changed.connect(func(_value): _changed())
	%ReplaceCustom.toggled.connect(func(_value): _changed())
	%AssignMap.toggled.connect(func(_value): _changed())
	%ChooseImage.pressed.connect(func(): %ImageFile.popup_centered(Vector2i(800, 560)))
	%ImageFile.file_selected.connect(func(path): %SourcePath.text = path; _changed())
	%ReviewCustom.pressed.connect(review_requested.emit)
	%ApplyCustom.pressed.connect(apply_requested.emit)
	%RecoverCustom.pressed.connect(recovery_requested.emit)
	%CancelCustom.pressed.connect(cancel); close_requested.connect(cancel)
	%DiscardCustom.pressed.connect(func(): restore_draft(_original))
	%DiscardCustomPrompt.confirmed.connect(func(): canceled.emit(); dismiss())
	%EditCustomBehavior.pressed.connect(behavior_requested.emit)
	%BehaviorNavigation.add_button("Discard & Edit", true, "discard")
	%BehaviorNavigation.confirmed.connect(func(): behavior_decided.emit("apply"))
	%BehaviorNavigation.custom_action.connect(func(choice): %BehaviorNavigation.hide(); behavior_decided.emit(str(choice)))


func choose_behavior_navigation() -> void:
	%BehaviorNavigation.popup_centered(Vector2i(620,180))
	%BehaviorNavigation.get_cancel_button().grab_focus()


func open(data: Dictionary, origin: Control, read_source := true) -> void:
	_loading = true; context = data.duplicate(true); _focus = weakref(origin)
	%CustomDestination.text = "%s · %s · Custom Landlooks" % [data.name, data.identity]
	%SourceTemplate.clear()
	for row in data.sources:
		%SourceTemplate.add_item("%s · %s%s" % [row.name, row.ownership, "" if row.available else " · unavailable"], int(row.landlook))
		%SourceTemplate.set_item_metadata(%SourceTemplate.item_count - 1, row)
	var preferred: int = %SourceTemplate.get_item_index(int(data.get("landlook", 0)))
	%SourceTemplate.select(maxi(preferred, 0))
	for look in range(6, 9):
		var row: Dictionary = data.slots[look - 6]
		get_node("%Custom" + str(look)).text = row.name + (" · occupied" if row.occupied else " · available")
	%Operation.select(0); %ImportMode.select(0); %SourcePath.text = ""; %TargetTile.set_value_no_signal(1)
	%AssignMap.set_pressed_no_signal(true); %ReplaceCustom.set_pressed_no_signal(false)
	_select_destination(6)
	%EditCustomBehavior.disabled = int(data.get("landlook", -1)) < 6 or int(data.get("landlook", -1)) > 8
	_loading = false; _original = draft(); _review.clear(); set_busy(false); _changed()
	popup_centered(Vector2i(880, 680)); %SourceTemplate.grab_focus()
	if read_source: _read_source()


func _select_destination(look: int) -> void:
	context.destination = look
	for candidate in range(6, 9): get_node("%Custom" + str(candidate)).set_pressed_no_signal(candidate == look)
	if not _loading: _changed(); _read_source()


func draft() -> Dictionary:
	return {"operation":"clone" if %Operation.selected == 0 else "import","sourceLook":%SourceTemplate.get_selected_id(),"destination":int(context.get("destination", 6)),"replace":%ReplaceCustom.button_pressed,"assignMap":%AssignMap.button_pressed,"mode":["full","block","tile"][%ImportMode.selected],"tile":int(%TargetTile.value),"path":%SourcePath.text.strip_edges()}


func restore_draft(value: Dictionary, read_source := true) -> void:
	_loading = true
	%Operation.select(0 if value.operation == "clone" else 1)
	%SourceTemplate.select(%SourceTemplate.get_item_index(int(value.sourceLook)))
	%ImportMode.select(["full","block","tile"].find(value.mode)); %SourcePath.text = value.path; %TargetTile.set_value_no_signal(int(value.tile))
	%ReplaceCustom.set_pressed_no_signal(value.replace); %AssignMap.set_pressed_no_signal(value.assignMap)
	_select_destination(int(value.destination)); _loading = false; _changed()
	if read_source: _read_source()


func _changed() -> void:
	if _loading: return
	_review.clear(); %AffectedMaps.clear()
	var importing: bool = %Operation.selected == 1
	%ImportFields.visible = importing; %SourceFields.visible = not importing
	%TargetTile.editable = not _busy and %ImportMode.selected != 0
	%CustomStatus.text = "Destination review required."
	_buttons()


func _read_source() -> void:
	if _loading or _busy: return
	var look: int = int(context.destination) if %Operation.selected == 1 else %SourceTemplate.get_selected_id()
	%CustomAtlas.texture = null
	if %Operation.selected == 0:
		var row: Dictionary = %SourceTemplate.get_selected_metadata()
		%CustomStatus.text = str(row.get("reason", "")) if not row.available else "Template artwork and behavior will be copied together."
	source_requested.emit(look)


func set_source(data: Dictionary) -> void:
	if not %CustomAtlasSource.set_atlas(data): %CustomStatus.text = str(data.get("reason", "Artwork is unavailable.")); %CustomAtlas.texture = null
	else: %CustomAtlas.texture = %CustomAtlasSource.atlas_texture


func show_review(data: Dictionary, maps: Array) -> void:
	_review = {"draft":draft(),"data":data.duplicate(true)}; set_source(data.atlas)
	%AffectedMaps.clear()
	for map in maps: %AffectedMaps.add_item("%s · %s" % [map.name, map.identity])
	%CustomStatus.text = "%s · %d tiles · %d affected maps. Tiles 60 and 61 are retained during artwork import." % ["Replace occupied slot" if data.replacing else "Create available slot",data.changedTiles.size(),data.total]
	_buttons()


func has_unapplied_changes() -> bool:
	return visible and not context.is_empty() and (draft() != _original or review_is_current())


func review_is_current() -> bool:
	return not _review.is_empty() and _review.draft == draft() and _review.data.canApply


func set_busy(busy: bool, recovery := false) -> void:
	_busy = busy; %RecoverCustom.visible = recovery
	for node in [%Operation,%SourceTemplate,%ImportMode,%ChooseImage,%ReplaceCustom,%AssignMap]: node.disabled = busy
	for look in range(6, 9): get_node("%Custom" + str(look)).disabled = busy
	%SourcePath.editable = not busy; %TargetTile.editable = not busy and %ImportMode.selected != 0; _buttons()


func _buttons() -> void:
	var unavailable: bool = %Operation.selected == 0 and %SourceTemplate.item_count > 0 and not %SourceTemplate.get_selected_metadata().available
	%ReviewCustom.disabled = _busy or unavailable
	%ApplyCustom.disabled = _busy or not review_is_current()
	%DiscardCustom.disabled = _busy or not has_unapplied_changes(); %CancelCustom.disabled = _busy


func show_failure(message: String) -> void:
	_review.clear(); %CustomStatus.text = message + " Your draft is kept."; _buttons()


func cancel() -> void:
	if _busy: return
	if has_unapplied_changes(): %DiscardCustomPrompt.popup_centered(); return
	canceled.emit(); dismiss()


func dismiss() -> void:
	hide(); %ImageFile.hide(); %DiscardCustomPrompt.hide(); context.clear(); _original.clear(); _review.clear()
	if _focus != null:
		var origin: Control = _focus.get_ref()
		if origin != null and origin.is_visible_in_tree(): origin.grab_focus()


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): cancel(); get_viewport().set_input_as_handled()
