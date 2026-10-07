extends RefCounted

var _shell: Control
var _tree: SceneTree
var _regions
var _view: Control


func run(shell: Control) -> void:
	_shell = shell; _tree = shell.get_tree(); _regions = shell._maps.regions; _view = _regions.view
	await _seed_references()
	await _seed_sound_and_battle()
	await shell._navigation.open_map("land:0")
	await _regions.open(3)
	await _settled()
	var revision: int = shell._session_view.revision
	assert(_view.visible and _view.get_node("%RegionSlots").item_count == 20)
	assert(_view.get_node("%RegionSlots").get_item_id(0) == 19)
	assert(_view.get_node("%ApplyRegion").text == "Create region")
	await _spatial_draft()
	_visibility_filters()
	assert(shell._session_view.revision == revision and _view.has_unapplied_changes())
	await _choose("textId", "123", 123)
	await _choose("door0", "3", 3)
	await _choose("soundId", "-200", -200)
	await _choose("battleLow", "0", 0); await _choose("battleHigh", "0", 0)
	_view.get_node("%DoorPercent0").value = -35
	_view.get_node("%DoorPercent1").value = 80
	_view.get_node("%RegionChance").value = -1
	_view.get_node("%RegionOnly").button_pressed = true
	await _settled()
	assert(_view.draft.randomDoorPercent == [-35,80,0])
	await _cancel_and_same_selection()
	await _linked_reference_return()
	await _navigation_cancel()
	var applied: Dictionary = await _regions.commit_selected()
	assert(applied.ok and shell._session_view.revision == revision + 1)
	await _settled()
	assert(not _regions.has_unapplied_changes() and _view.draft.randomDoorPercent[0] == -35)
	await shell._undo(); await _settled()
	assert(_view.get_node("%ApplyRegion").text == "Create region")
	await shell._redo(); await _settled()
	assert(_view.draft.textId == 123 and _view.draft.randomDoors[0] == 3)
	await _clear_and_undo()
	await _recovery()
	_regions.close()
	var overlay: Control = _shell._documents.view("maps.land").get_node("%RandomRegionOverlay")
	assert(overlay.draft.is_empty() and not overlay.regions.is_empty())
	await shell._navigation.open_map("dungeon:0")
	await _regions.open(19); await _settled()
	_view.stage_bounds(Rect2i(20,20,4,5))
	_view.get_node("%RegionChance").value = -1
	_view.get_node("%DoorPercent2").value = -100
	await _settled()
	assert((await _regions.commit_selected()).ok)
	await _settled()
	assert(_view.draft.bottom == 25 and _view.draft.randomDoorPercent[2] == -100)
	_regions.close()
	assert(not _regions.has_unapplied_changes())


func _visibility_filters() -> void:
	var land: Control = _shell._documents.view("maps.land")
	var overlay: Control = land.get_node("%RandomRegionOverlay")
	var filter: Button = land.get_node("%MapViewFilters").get_node("%RandomAreasFilter")
	var draft: Dictionary = _view.draft.duplicate(true)
	var revision: int = _shell._session_view.revision
	_view.get_node("%DrawRegion").button_pressed = true
	filter.button_pressed = false
	assert(not overlay.visible and not overlay.drawing and not _view.get_node("%DrawRegion").button_pressed)
	assert(_regions.active and _view.draft == draft and _shell._session_view.revision == revision)
	filter.button_pressed = true
	assert(overlay.visible and not overlay.drawing and _view.draft == draft)


func _seed_references() -> void:
	for pair in [["message.create", {"nativeId":123,"text":"Region text preview"}], ["extra-action-point.create", {"nativeId":3}]]:
		var params: Dictionary = pair[1].duplicate(true)
		params.expectedRevision = _shell._session_view.revision
		var response: Dictionary = await _shell._operations.run_workflow(_shell._bridge, "Seed region references", func(operation): return await operation.request(pair[0], params))
		assert(response.ok)
		_shell._session_view.apply(response.result)


func _seed_sound_and_battle() -> void:
	var wav:=AudioStreamWAV.new(); wav.format=AudioStreamWAV.FORMAT_8_BITS; wav.mix_rate=11025
	var pcm:=PackedByteArray()
	for _index in 200: pcm.append_array(PackedByteArray([0,15,30,15,0,241,226,241]))
	wav.data=pcm; var path:=OS.get_cmdline_user_args()[0].path_join("region.wav"); assert(wav.save_to_wav(path)==OK)
	var response: Dictionary=await _shell._operations.run_workflow(_shell._bridge,"Seed region sound",func(operation):
		return await operation.request("sound.import",{"path":path,"label":"Region bell","resourceId":200,"expectedRevision":_shell._session_view.revision}))
	assert(response.ok); _shell._session_view.apply(response.result)
	await _shell._navigation.select_route("combat.battles"); await _settled()
	var battle: Control=_shell._workbenches.battle
	battle.get_node("%NewBattle").pressed.emit(); await _settled()
	battle.get_node("%Impact").confirmed.emit(); await _settled()
	assert((await _shell._workbenches.battle_commands.commit()).ok); await _settled()


func _spatial_draft() -> void:
	_view.get_node("%DrawRegion").button_pressed = true
	var overlay: Control = _shell._documents.view("maps.land").get_node("%RandomRegionOverlay")
	var canvas: ProvidenceMapCanvas = overlay.get_parent()
	var first := InputEventMouseButton.new()
	first.button_index = MOUSE_BUTTON_LEFT; first.pressed = true
	first.position = canvas.cell_rect(Vector2i(12,18)).get_center()
	overlay._gui_input(first)
	var motion := InputEventMouseMotion.new()
	motion.position = canvas.cell_rect(Vector2i(23,25)).get_center()
	motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	overlay._gui_input(motion)
	assert(_view.draft.left == 0)
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT; release.position = motion.position
	overlay._gui_input(release)
	assert(_view.draft.left == 12 and _view.draft.top == 18 and _view.draft.right == 24 and _view.draft.bottom == 26)
	first.position = canvas.cell_rect(Vector2i(3,3)).get_center()
	overlay._gui_input(first)
	var cancel := InputEventKey.new(); cancel.keycode = KEY_ESCAPE; cancel.pressed = true
	overlay._gui_input(cancel)
	assert(not overlay.drawing and _view.draft.left == 12)


func _choose(field: String, search: String, value: int) -> void:
	_view.get_node("%" + _view.REFERENCE_FIELDS[field]).pressed.emit()
	var picker: Window = _view.get_node("%RegionReferencePicker")
	await _settled()
	assert(picker.visible and picker.context.destination.contains("Region 3"))
	picker.get_node("%Search").text = search
	picker.get_node("%Search").text_changed.emit(search)
	await _tree.create_timer(0.3).timeout; await _settled()
	var choices: ItemList = picker.get_node("%Choices")
	assert(choices.item_count > 0)
	choices.select(0); choices.item_selected.emit(0)
	assert(picker.selected.value == value and (_view.reference_value(field) != value or field.begins_with("battle")))
	await _settled()
	if field=="soundId": assert(not picker.get_node("%PlaySound").disabled and picker.get_node("%SoundWaveform").texture!=null)
	if field.begins_with("battle"): assert(picker.get_node("%Details").text.contains("occupied grid cells"))
	choices.item_activated.emit(0)
	await _settled()
	assert(not picker.visible and _view.reference_value(field) == value)


func _cancel_and_same_selection() -> void:
	var before: Dictionary = _view.draft.duplicate(true)
	_view.get_node("%Door0").pressed.emit()
	var picker: Window = _view.get_node("%RegionReferencePicker")
	await _settled()
	assert(picker.selected.value == 3)
	picker.get_node("%Search").text_submitted.emit("")
	await _settled()
	assert(_view.draft == before)
	_view.get_node("%SoundId").pressed.emit(); await _settled()
	picker.get_node("%Search").text = "no-such-region-resource"
	picker.get_node("%Search").text_changed.emit("no-such-region-resource")
	await _tree.create_timer(0.3).timeout; await _settled()
	assert(picker.get_node("%Choices").item_count == 0 and picker.get_node("%UseSelection").disabled)
	assert(picker.selected.is_empty() and picker.get_node("%Name").text.is_empty())
	picker.close_requested.emit(); await _tree.process_frame
	assert(_view.draft == before and _view.get_node("%SoundId").has_focus())


func _navigation_cancel() -> void:
	var before: Dictionary = _view.draft.duplicate(true)
	_view.get_node("%RegionSlots").item_selected.emit(0)
	await _tree.process_frame
	assert(_shell._unapplied_dialog.visible and _view.slot == 3)
	_shell._unapplied_dialog.canceled.emit(); _shell._unapplied_dialog.hide()
	await _tree.process_frame
	assert(_view.draft == before and _view.get_node("%RegionSlots").selected == 16)


func _linked_reference_return() -> void:
	var before: Dictionary=_view.draft.duplicate(true); var revision: int=_shell._session_view.revision
	_view.get_node("%SoundId").pressed.emit(); await _settled()
	var picker: Window=_view.get_node("%RegionReferencePicker")
	picker.get_node("%PlaySound").pressed.emit(); assert(picker.get_node("%ReferenceAudio").playing)
	picker.get_node("%OpenReference").pressed.emit(); await _settled()
	assert(not picker.visible and not picker.get_node("%ReferenceAudio").playing and not _shell._unapplied_dialog.visible)
	assert(_shell._documents.identity_for_tab(_shell._document_tabs.current_tab)=="assets.sounds")
	await _shell._navigation.navigate_back()
	for _frame in 3: await _tree.process_frame
	await _settled()
	assert(_regions.active and _view.visible and _view.draft==before and _view.get_node("%SoundId").has_focus())
	assert(_shell._session_view.revision==revision)


func _clear_and_undo() -> void:
	_view.get_node("%ClearRegion").pressed.emit()
	var confirmation: ConfirmationDialog = _view.get_node("%ClearConfirmation")
	assert(confirmation.visible)
	confirmation.canceled.emit(); confirmation.hide()
	assert(_view.draft.textId == 123)
	_view.get_node("%ClearRegion").pressed.emit(); confirmation.confirmed.emit()
	await _settled()
	assert(_view.get_node("%ApplyRegion").text == "Create region")
	await _shell._undo(); await _settled()
	assert(_view.draft.textId == 123 and _view.draft.randomDoorPercent[0] == -35)


func _recovery() -> void:
	var writes: int = _shell._bridge.region_writes
	_view.get_node("%RegionChance").value = 0; await _settled()
	_shell._bridge.reject_method = "random-region.apply"
	var rejected: Dictionary = await _regions.commit_selected()
	assert(not rejected.ok and _regions.has_unapplied_changes() and _shell._bridge.region_writes == writes)
	await _settled()
	_shell._bridge.drop_method = "random-region.apply"
	var unknown: Dictionary = await _regions.commit_selected()
	assert(unknown.outcomeUnknown and _view.get_node("%ReconcileRegion").visible)
	await _regions.check_original(); await _settled()
	assert(not _regions.has_unapplied_changes() and _view.draft.chanceTenThousand == 0)
	assert(_shell._bridge.region_writes == writes + 1 and not _shell._operations.requires_reopen)
	_view.get_node("%RegionChance").value = -1; await _settled()
	_shell._bridge.drop_method = "random-region.apply"; _shell._bridge.advance_before_apply = true
	var not_committed: Dictionary = await _regions.commit_selected()
	assert(not_committed.outcomeUnknown)
	await _regions.check_original(); await _settled()
	assert(_regions.has_unapplied_changes() and _view.draft.chanceTenThousand == -1)
	assert(_shell._bridge.region_writes == writes + 1)
	assert((await _regions.commit_selected()).ok)
	await _settled()


func _settled() -> void:
	for _frame in 360:
		await _tree.process_frame
		if not _shell._operations.busy and not _regions._preview_reading and not _regions._refreshing and not _regions._submitting: return
	assert(false, "The region interaction did not settle.")


func verify_reopened(shell: Control) -> void:
	_shell = shell; _tree = shell.get_tree(); _regions = shell._maps.regions; _view = _regions.view
	print("WORLD_REGION_REOPEN land · map=%s busy=%s dungeonDraft=%s settingsDraft=%s regionDraft=%s" % [shell._maps.document.identity, shell._operations.busy, shell._workbenches.dungeon.has_unapplied_changes(), shell._maps.settings.has_unapplied_changes(), _regions.has_unapplied_changes()])
	await shell._navigation.open_map("land:0")
	print("WORLD_REGION_REOPEN land loaded")
	await _regions.open(3); await _settled()
	print("WORLD_REGION_REOPEN land region loaded")
	assert(_view.draft.textId == 123 and _view.draft.randomDoorPercent[0] == -35 and _view.draft.chanceTenThousand == -1)
	_regions.close()
	await shell._navigation.open_map("dungeon:0")
	print("WORLD_REGION_REOPEN dungeon loaded")
	await _regions.open(19); await _settled()
	print("WORLD_REGION_REOPEN dungeon region loaded")
	assert(_view.draft.left == 20 and _view.draft.bottom == 25 and _view.draft.randomDoorPercent[2] == -100)
	_regions.close()
