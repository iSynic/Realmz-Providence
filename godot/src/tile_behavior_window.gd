extends Window

signal review_requested
signal apply_requested
signal recovery_requested
signal sound_requested
signal tile_requested(field: String)
signal canceled
signal combat_artwork_requested

var context: Dictionary = {}
var _original: Dictionary = {}
var _draft: Dictionary = {}
var _origin: WeakRef
var _binding := false
var _busy := false
var _unknown := false
var _reviewed := false
var _atlas: Dictionary = {}
var _combat_artwork: Dictionary = {}


func _ready() -> void:
	%ReviewBehavior.pressed.connect(func(): review_requested.emit())
	%ApplyBehavior.pressed.connect(func(): apply_requested.emit())
	%CheckBehavior.pressed.connect(func(): recovery_requested.emit())
	%ChooseMovementSound.pressed.connect(func(): sound_requested.emit())
	%ChooseClearTile.pressed.connect(func(): tile_requested.emit("clearTile"))
	%RetryCombatArtwork.pressed.connect(combat_artwork_requested.emit)
	%CancelBehavior.pressed.connect(cancel)
	%DiscardBehavior.pressed.connect(func(): restore_draft(_original))
	close_requested.connect(cancel)
	%DiscardConfirmation.confirmed.connect(func(): dismiss(); canceled.emit())
	for name in ["Solid", "Path", "Shore", "Boat", "Fly", "Los"]:
		get_node("%" + name).toggled.connect(func(_value): _changed())
	for name in ["MoveTime", "Forest", "ClearTile", "MovementSound"]:
		get_node("%" + name).value_changed.connect(func(_value): _changed())
	for index in 9:
		get_node("%Combat" + str(index)).value_changed.connect(func(_value): _changed())
		get_node("%ChooseCombat" + str(index)).pressed.connect(tile_requested.emit.bind("combat:" + str(index)))


func open(data: Dictionary, atlas: Dictionary, origin: Control) -> void:
	context = {"identity":str(data.identity),"tile":int(data.tile),"landlook":int(data.landlook),"revision":int(data.revision)}
	_original = _integers(data.edit); _atlas = atlas.duplicate(true); _origin = weakref(origin) if origin != null else null
	%BehaviorDestination.text = "Custom %d · Scenario · Tile %d · %s" % [int(data.landlook) - 5, int(data.tile), str(data.identity)]
	var atlas_control = %BehaviorTilePicker.get_node("%EraseAtlas")
	atlas_control.set_atlas(atlas)
	%BehaviorTile.texture = atlas_control.tile_texture(int(data.tile))
	%BehaviorTileName.text = "Tile %d\nScenario customization" % int(data.tile)
	set_busy(false); restore_draft(_original)
	set_combat_artwork({})
	popup_centered(Vector2i(880, 680)); %Solid.grab_focus()


func _integers(value: Dictionary) -> Dictionary:
	var result := value.duplicate(true)
	for name in ["movementSound", "movementTime", "forestType", "clearTile"]: result[name] = int(result[name])
	for row in 3:
		for column in 3: result.combatBuild[row][column] = int(result.combatBuild[row][column])
	return result


func restore_draft(value: Dictionary) -> void:
	_draft = _integers(value); _binding = true
	for pair in [["Solid","solid"],["Path","path"],["Shore","shore"],["Boat","boatRequired"],["Fly","flyFloat"],["Los","blocksLos"]]:
		get_node("%" + pair[0]).set_pressed_no_signal(bool(_draft[pair[1]]))
	for pair in [["MoveTime","movementTime"],["Forest","forestType"],["ClearTile","clearTile"],["MovementSound","movementSound"]]:
		get_node("%" + pair[0]).set_value_no_signal(int(_draft[pair[1]]))
	for index in 9: get_node("%Combat" + str(index)).set_value_no_signal(int(_draft.combatBuild[index / 3][index % 3]))
	_binding = false; _reviewed = false; %BehaviorImpact.clear(); %BehaviorStatus.text = "Review every affected map before Apply."
	_buttons()
	_update_combat_previews()


func _changed() -> void:
	if _binding or _busy: return
	for pair in [["Solid","solid"],["Path","path"],["Shore","shore"],["Boat","boatRequired"],["Fly","flyFloat"],["Los","blocksLos"]]:
		_draft[pair[1]] = get_node("%" + pair[0]).button_pressed
	for pair in [["MoveTime","movementTime"],["Forest","forestType"],["ClearTile","clearTile"],["MovementSound","movementSound"]]:
		_draft[pair[1]] = int(get_node("%" + pair[0]).value)
	for index in 9: _draft.combatBuild[index / 3][index % 3] = int(get_node("%Combat" + str(index)).value)
	_reviewed = false; %BehaviorImpact.clear(); %BehaviorStatus.text = "Draft changed · review its impact before applying."
	_buttons()
	_update_combat_previews()


func draft() -> Dictionary:
	return _draft.duplicate(true)


func baseline() -> Dictionary:
	return _original.duplicate(true)


func suspend_reference() -> void:
	hide(); %BehaviorSoundPicker.cancel(false)


func has_unapplied_changes() -> bool:
	return not _draft.is_empty() and _draft != _original


func review_is_current() -> bool:
	return _reviewed and not _busy


func set_combat_artwork(artwork: Dictionary) -> void:
	_combat_artwork = preload("res://src/combat_tile_artwork.gd").compose(_atlas, artwork)
	var available: bool = %CombatArtAtlas.set_atlas(_combat_artwork, 400)
	%RetryCombatArtwork.visible = not available
	%RetryCombatArtwork.disabled = _busy
	for index in 9:
		var button: Button = get_node("%ChooseCombat" + str(index))
		button.disabled = _busy or not available
		button.tooltip_text = "Choose an exact combat tile." if available else str(_combat_artwork.get("reason", "Combat tile artwork is unavailable."))
	if available and %BehaviorStatus.text.ends_with("Tile values are retained."): %BehaviorStatus.text = "Review every affected map before Apply."
	if not available: %BehaviorStatus.text = str(_combat_artwork.get("reason", "Combat tile artwork is unavailable.")) + " Tile values are retained."
	_update_combat_previews()


func combat_artwork() -> Dictionary:
	return _combat_artwork.duplicate(true)


func _update_combat_previews() -> void:
	if _draft.is_empty(): return
	for index in 9:
		var preview: TextureRect = get_node("%CombatPreview" + str(index))
		preview.texture = %CombatArtAtlas.tile_texture(int(_draft.combatBuild[index / 3][index % 3]))
		preview.visible = preview.texture != null
		get_node("%CombatUnavailable" + str(index)).visible = preview.texture == null


func stage_reference(field: String, value: int) -> void:
	if _busy: return
	if field == "soundId": %MovementSound.value = value
	elif field == "clearTile": %ClearTile.value = value
	elif field.begins_with("combat:"): get_node("%Combat" + field.trim_prefix("combat:")).value = value


func present_review(review: Dictionary) -> void:
	%BehaviorImpact.clear()
	for map in review.affectedMaps: %BehaviorImpact.add_item("Land %d · %s · %d cells use this tile" % [int(map.nativeIndex), str(map.name), int(map.tileUses)])
	%BehaviorStatus.text = "%d changed fields · shared by %d maps. Clear To belongs to this tile; the shared erase tile is preserved." % [review.changedFields.size(), review.affectedMaps.size()]
	_reviewed = bool(review.canApply); _buttons()


func set_busy(busy: bool, unknown := false) -> void:
	_busy = busy; _unknown = unknown; %CheckBehavior.visible = unknown
	%RetryCombatArtwork.disabled = busy or unknown
	for name in ["Solid","Path","Shore","Boat","Fly","Los"]: get_node("%" + name).disabled = busy
	for name in ["MoveTime","Forest","ClearTile","MovementSound"]: get_node("%" + name).editable = not busy
	for index in 9:
		get_node("%Combat" + str(index)).editable = not busy
		get_node("%ChooseCombat" + str(index)).disabled = busy or %CombatArtAtlas.atlas_texture == null
	%ChooseMovementSound.disabled = busy; %ChooseClearTile.disabled = busy; _buttons()


func _buttons() -> void:
	%ReviewBehavior.disabled = _busy or not has_unapplied_changes()
	%ApplyBehavior.disabled = _busy or not _reviewed
	%DiscardBehavior.disabled = _busy or not has_unapplied_changes()
	%CancelBehavior.disabled = _busy


func show_failure(message: String) -> void:
	%BehaviorStatus.text = message + " Your draft is kept."
	_reviewed = false; _buttons()


func cancel() -> void:
	if _busy: return
	if has_unapplied_changes(): %DiscardConfirmation.popup_centered(); return
	dismiss(); canceled.emit()


func dismiss() -> void:
	hide(); %BehaviorSoundPicker.cancel(false); %BehaviorTilePicker.cancel(); %DiscardConfirmation.hide()
	context.clear(); _draft.clear(); _original.clear()
	if _origin != null:
		var origin: Control = _origin.get_ref()
		if origin != null and origin.is_visible_in_tree(): origin.grab_focus()


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): cancel(); get_viewport().set_input_as_handled()
