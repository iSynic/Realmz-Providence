extends "res://tools/validate_map_paint_resources.gd"

class BehaviorBridge extends ResourceBridge:
	var behavior_writes := 0
	var drop_behavior := false
	var reject_behavior := false
	func _request(method: String, params: Dictionary) -> Dictionary:
		if method == "tile-behavior.apply" and reject_behavior:
			reject_behavior = false; return {"ok":false,"error":"Controlled behavior rejection"}
		var response: Dictionary = super._request(method, params)
		if method == "map.render-atlas" and response.get("ok", false):
			var opened: Dictionary = super._request("map.open", {"identity":params.identity})
			if opened.get("ok", false) and opened.result.map.levelType == "land":
				response.result.tilesetId = opened.result.map.runtime.tilesetId
				response.result.landlook = int(opened.result.map.runtime.landlook)
		if method == "tile-behavior.apply" and response.get("ok", false):
			behavior_writes += 1
			if drop_behavior: drop_behavior = false; return {"ok":false,"outcomeUnknown":true,"error":"Controlled behavior reply loss"}
		return response


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1 or not args[0].get_file().begins_with("providence-ui-paint-"): push_error("A disposable behavior output root is required"); quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH"); OS.set_environment("PROVIDENCE_PROJECT_PATH", "")
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	var shell: Control = load("res://src/editor_shell.tscn").instantiate(); shell.set_script(CheckedShell); root.add_child(shell)
	await _frames(3); shell._bridge.stop(); shell._bridge = BehaviorBridge.new(args[0].path_join("behavior-settings.cfg"))
	var created: Dictionary = shell._bridge.create_project("tile-behavior", args[0].path_join("behavior-project"))
	if _check(created.get("ok", false), "Behavior project creation failed"):
		await shell._activate_session(created)
		if await _setup(shell) and await _custom_behavior(shell, args[0]):
			await _sound_reference(shell,args[0])
			await _edit_behavior(shell)
			await _behavior_failures(shell)
			await _behavior_reopen(shell, args[0].path_join("behavior-project"))
	shell.free(); await _frames(2); OS.set_environment("PROVIDENCE_PROJECT_PATH", prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_BEHAVIOR_OK atomic named-fields nested-clear-picker sound-playback signed-accept exact-edit-return retained-draft cancel same-value impact history rejected retained original-result no-replay save-reopen stale teardown")
	quit(1 if _failed else 0)


func _custom_behavior(shell, output: String) -> bool:
	var bytes := PackedByteArray(); bytes.resize(8104); bytes.fill(0)
	bytes[58] = 0x82; bytes[59] = 0x17; bytes[79] = 7
	var path := output.path_join("Data Custom 1 BD")
	var file := FileAccess.open(path, FileAccess.WRITE); file.store_buffer(bytes); file.close()
	if not _mutate(shell, "custom-landlook.metadata.import", {"landlook":6,"path":path}): return false
	var opened: Dictionary = shell._bridge.request("map.open", {"identity":"land:1"})
	var runtime: Dictionary = opened.result.map.runtime.duplicate(true); runtime.landlook = 6; runtime.tilesetId = "classic.landlook.6"
	if not _mutate(shell, "map-runtime.set", {"identity":"land:1","metadata":_integer_fields(runtime)}): return false
	await shell._maps.document.load_map("land:1"); await _settle(shell)
	return true


func _integer_fields(value: Variant) -> Variant:
	if value is float: return int(value)
	if value is Array: return value.map(_integer_fields)
	if value is Dictionary:
		var result := {}
		for key in value: result[key] = _integer_fields(value[key])
		return result
	return value


func _sound_reference(shell, output: String) -> void:
	var wav := AudioStreamWAV.new(); wav.format = AudioStreamWAV.FORMAT_8_BITS; wav.mix_rate = 11025
	var pcm := PackedByteArray()
	for _index in 200: pcm.append_array(PackedByteArray([0,15,30,15,0,241,226,241]))
	wav.data = pcm; var path := output.path_join("movement.wav"); wav.save_to_wav(path)
	if not _mutate(shell,"sound.import",{"path":path,"label":"Movement bell","resourceId":200}): return
	var controller = shell._maps.tile_behavior; var window = controller.view
	await controller.open(1); window.get_node("%MoveTime").value = 18
	var before: Dictionary = window.draft(); var revision: int = shell._session_view.revision
	window.get_node("%ChooseMovementSound").pressed.emit(); await _settle(shell)
	var picker = window.get_node("%BehaviorSoundPicker")
	var index: int = picker._rows.find_custom(func(row): return int(row.value) == -200)
	if not _check(index >= 0,"Sound catalog omitted the signed scenario sound"): picker.cancel(); window.dismiss(); return
	picker._preview(index); await _settle(shell)
	_check(not picker.get_node("%PlaySound").disabled and picker.get_node("%SoundWaveform").texture != null and window.draft() == before,"Browsing movement sound changed the draft or lacked playback")
	picker.get_node("%PlaySound").pressed.emit()
	_check(picker.get_node("%ReferenceAudio").playing,"Movement sound did not start playback")
	picker.cancel(); await _frames(2)
	_check(not picker.get_node("%ReferenceAudio").playing and window.draft() == before and window.get_node("%ChooseMovementSound").has_focus(),"Sound Cancel did not stop playback and restore the unchanged draft/focus")
	window.get_node("%ChooseMovementSound").pressed.emit(); await _settle(shell)
	index = picker._rows.find_custom(func(row): return int(row.value) == -200); picker._preview(index); await _settle(shell)
	picker.get_node("%UseSelection").pressed.emit()
	_check(int(window.draft().movementSound) == -200 and shell._session_view.revision == revision,"Accepting a signed sound wrote early or normalized its identity")
	window.get_node("%ChooseMovementSound").pressed.emit(); await _settle(shell)
	picker.get_node("%OpenReference").pressed.emit(); await _settle(shell)
	_check(not window.visible and not shell._unapplied_dialog.visible and shell._documents.identity_for_tab(shell._document_tabs.current_tab) == "assets.sounds","Sound edit did not open the exact target with its draft suspended")
	var sound = shell._documents.view("assets.sounds")
	sound._name_field.text = "Renamed movement bell"; sound._apply.pressed.emit(); await _settle(shell)
	await shell._navigation.navigate_back(); await _settle(shell)
	_check(window.visible and int(window.draft().movementTime) == 18 and int(window.draft().movementSound) == -200 and window.get_node("%ChooseMovementSound").has_focus(),"Exact sound return lost the originating tile draft/focus")
	await controller.review(); await controller.apply_review(); await _settle(shell)
	await controller.open(1)
	_check(int(window.draft().movementSound)==-200,"Movement sound Apply lost its signed scenario identity")
	window.dismiss()


func _edit_behavior(shell) -> void:
	var controller = shell._maps.tile_behavior; var window = controller.view
	shell._maps.paint.workspace.tiles_dock.select_tile(1)
	await controller.open(1); await _settle(shell)
	_check(window.visible and window.get_node("%BehaviorTile").texture != null and int(window.draft().clearTile) == 7, "Custom behavior did not retain source Clear To or artwork")
	await _behavior_bounds(window)
	var original: Dictionary = window.draft(); var revision: int = shell._session_view.revision
	window.get_node("%ChooseClearTile").pressed.emit(); await _frames(2)
	var picker = window.get_node("%BehaviorTilePicker")
	picker.get_node("%EraseAtlas").select_tile(151); picker.cancel()
	_check(window.draft() == original, "Cancelling Clear To selection changed the draft")
	window.get_node("%ChooseClearTile").pressed.emit(); await _frames(2)
	picker.get_node("%UseEraseTile").pressed.emit()
	_check(not window.has_unapplied_changes(), "Accepting the current Clear To made a change")
	window.get_node("%ChooseClearTile").pressed.emit(); await _frames(2)
	picker.get_node("%NoTile").pressed.emit(); picker.get_node("%UseEraseTile").pressed.emit()
	_check(int(window.draft().clearTile) == 0, "Explicit empty Clear To was not selectable")
	window.get_node("%MoveTime").value = 12; window.get_node("%Path").button_pressed = true
	window.get_node("%ChooseCombat4").pressed.emit(); await _frames(2)
	_check(picker.visible and not window.get_node("%ChooseCombat4").disabled, "The exact battle atlas did not enable combat tile selection")
	picker.get_node("%EraseAtlas").select_tile(400); picker.get_node("%UseEraseTile").pressed.emit()
	_check(window.get_node("%CombatPreview4").texture != null and int(window.draft().combatBuild[1][1]) == 400, "Explicit combat tile acceptance lost its identity or preview")
	await controller.review()
	_check(window.review_is_current() and window.get_node("%BehaviorImpact").item_count == 1 and shell._session_view.revision == revision, "Behavior impact wrote early or omitted the owning map")
	await controller.apply_review(); await _settle(shell)
	_check(not window.visible and shell._session_view.revision == revision + 1, "Behavior Apply was not one atomic acknowledged edit")
	await controller.open(1); _check(int(window.draft().movementTime) == 12 and int(window.draft().combatBuild[1][1]) == 400 and int(window.draft().clearTile) == 0, "Behavior Apply lost a named field")
	window.dismiss(); await shell._undo(); await controller.open(1)
	_check(window.draft() == original, "Behavior Undo did not restore the original record")
	window.dismiss(); await shell._redo(); await controller.open(1)
	_check(int(window.draft().movementTime) == 12, "Behavior Redo did not restore its edit")
	window.dismiss()


func _behavior_failures(shell) -> void:
	var controller = shell._maps.tile_behavior; var window = controller.view
	await controller.open(1); window.get_node("%MoveTime").value = -1
	var invalid: Dictionary = await controller.review()
	_check(not invalid.get("ok", false) and int(window.draft().movementTime) == -1, "Invalid behavior lost its draft")
	window.get_node("%MoveTime").value = 14; await controller.review()
	shell._bridge.reject_behavior = true; var rejected: Dictionary = await controller.apply_review()
	_check(not rejected.get("ok", false) and window.has_unapplied_changes() and not window.get_node("%ReviewBehavior").disabled, "Known behavior rejection froze or discarded the draft")
	await controller.review(); shell._bridge.drop_behavior = true; var writes: int = shell._bridge.behavior_writes
	await controller.apply_review()
	_check(not controller._pending.is_empty() and window.get_node("%ReviewBehavior").disabled and window.get_node("%CheckBehavior").visible, "Unknown behavior outcome lost its recovery state")
	await controller.check_original(); await _settle(shell)
	_check(controller._pending.is_empty() and shell._bridge.behavior_writes == writes + 1 and not window.visible, "Original behavior result recovery replayed the write")
	await controller.open(1); window.get_node("%Forest").value = 3
	await shell._maps.document.load_map("land:0"); await _settle(shell)
	var stale: Dictionary = await controller.apply_review()
	_check(not stale.get("ok", false) and not window.visible, "A stale map accepted tile behavior")


func _behavior_reopen(shell, path: String) -> void:
	await shell._maps.document.load_map("land:1"); await _settle(shell)
	await shell._project_session.save(); shell._bridge.stop()
	var reopened: Dictionary = shell._bridge.start_project(path)
	_check(reopened.get("ok", false), "Behavior project did not reopen")
	await shell._activate_session(reopened); await shell._maps.document.load_map("land:1"); await _settle(shell)
	await shell._maps.tile_behavior.open(1)
	_check(int(shell._maps.tile_behavior.view.draft().movementTime) == 14 and int(shell._maps.tile_behavior.view.draft().movementSound)==-200 and int(shell._maps.tile_behavior.view.draft().clearTile) == 0, "Behavior fields did not survive Save/reopen")
	shell._maps.tile_behavior.view.dismiss()


func _behavior_bounds(window: Window) -> void:
	for size in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size = size; window.popup_centered(Vector2i(880,680)); await _frames(3)
		for name in ["ReviewBehavior","ApplyBehavior","CancelBehavior","ChooseClearTile","BehaviorStatus"]:
			var control: Control = window.get_node("%" + name)
			_check(Rect2(Vector2.ZERO, Vector2(window.size)).encloses(control.get_global_rect()), "Behavior control exceeds its window at " + str(size) + ": " + name)
