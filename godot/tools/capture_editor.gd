extends SceneTree

const ActionCaptureData = preload("res://tools/action_authoring_capture_data.gd")
const SharedSettingsCapture = preload("res://tools/shared_settings_capture_data.gd")
const SimpleEncounterCapture = preload("res://tools/simple_encounter_capture.gd")
const ComplexEncounterCapture = preload("res://tools/complex_encounter_capture.gd")


const MapCapture = preload("res://tools/editor_capture/maps.gd")
const ScenarioCapture = preload("res://tools/editor_capture/scenario.gd")
const EncounterCapture = preload("res://tools/editor_capture/encounters.gd")


func _initialize() -> void:
	await process_frame
	root.content_scale_size = DisplayServer.window_get_size()
	print("PROVIDENCE_CAPTURE_LOGICAL_VIEWPORT %s" % root.content_scale_size)
	var scene := load("res://src/editor_shell.tscn") as PackedScene
	var editor := scene.instantiate()
	root.add_child(editor)
	for _frame in range(4):
		await process_frame
	await _open_capture_project(editor)
	if not await _prepare_capture_surface(editor):
		return
	await _publish_capture(editor)


func _prepare_capture_surface(editor: Control) -> bool:
	var surface := OS.get_environment("PROVIDENCE_CAPTURE_SURFACE")
	if await _prepare_catalog_surface(editor, surface):
		return true
	if surface.begins_with("scenario-"):
		return await ScenarioCapture.prepare(editor, self)
	match surface:
		"encounter-route-navigation":
			return await EncounterCapture.navigation(editor, self)
		"complex-encounter":
			await ComplexEncounterCapture.prepare(editor, self)
		"rogue-encounter":
			return await EncounterCapture.rogue(editor, self)
		"action-point-authoring", "extra-action-point-authoring":
			await _prepare_action_authoring_surface(editor, surface.begins_with("extra"))
		"global-macros":
			await _prepare_global_macro_surface(editor)
		"simple-encounter-authoring":
			await _prepare_simple_encounter_surface(editor)
		"command-palette":
			editor._commands.show_palette()
			for _frame in range(3):
				await process_frame
		"land-map-action-point":
			return await MapCapture.action_point(editor, self)
		"action-point-link":
			return await MapCapture.linked_target(editor, self)
		"land-map":
			return await MapCapture.land(editor, self)
		"dungeon-map":
			return await MapCapture.dungeon(editor, self)
	return true


func _prepare_catalog_surface(editor: Control, surface: String) -> bool:
	match surface:
		"scenario-pictures":
			_prepare_scenario_picture_surface(editor)
		"scenario-sounds":
			_prepare_scenario_sound_surface(editor)
		"scenario-icons":
			_prepare_scenario_icon_surface(editor)
		"special-land":
			_prepare_special_land_surface(editor)
		"special-land-world":
			_prepare_special_land_surface(editor)
			editor._navigation.special_land_world_context = true
			editor._presentation.select_document(10)
		"scenario-import":
			_prepare_scenario_import_surface(editor)
		"strings":
			editor._navigation.select_tab(0)
			await editor._strings.open_native(47)
		_:
			return false
	for _frame in range(3):
		await process_frame
	return true


func _publish_capture(editor: Control) -> void:
	var output_path := OS.get_environment("PROVIDENCE_CAPTURE_PATH")
	if output_path.is_empty():
		push_error("PROVIDENCE_CAPTURE_PATH is required")
		editor.queue_free()
		await process_frame
		quit(2)
		return
	var image := root.get_viewport().get_texture().get_image()
	if image == null:
		push_error("Providence editor capture requires a rendering display; do not use --headless.")
		editor.queue_free()
		await process_frame
		quit(2)
		return
	var error := image.save_png(output_path)
	if error != OK:
		push_error("Could not save Providence editor capture: %s" % error_string(error))
		editor.queue_free()
		await process_frame
		quit(1)
		return
	print("PROVIDENCE_UI_CAPTURE_OK %s" % output_path)
	editor.queue_free()
	await process_frame
	quit(0)


func _open_capture_project(editor: Control) -> void:
	var capture_project := OS.get_environment("PROVIDENCE_CAPTURE_PROJECT")
	if capture_project.is_empty(): return
	while editor._operations.busy:
		await editor._operations.completed
	await editor._project_session.open_project(capture_project)
	while editor._operations.busy:
		await editor._operations.completed
	for _frame in range(4): await process_frame


func _prepare_action_authoring_surface(editor: Control, extra: bool) -> void:
	editor._navigation.select_tab(3 if extra else 5)
	var view: Control = editor.find_child("Extra Action Points" if extra else "ActionPoints", true, false)
	if view == null:
		push_error("Action authoring capture could not find its route scene.")
		return
	view.set_block_signals(true)
	view.call("set_action_catalog", _capture_live_action_catalog(editor))
	var capture_state := OS.get_environment("PROVIDENCE_CAPTURE_ACTION_STATE")
	var steps := SharedSettingsCapture.steps(extra, ActionCaptureData.definition) if capture_state == "shared-impact" else ActionCaptureData.linked_steps(capture_state) if capture_state in ["linked-message", "linked-sound"] else ActionCaptureData.steps(extra)
	if capture_state == "conflict-missing":
		(steps[0] as Dictionary).primaryUsage = {"status": "conflict", "callerCount": 2}
	var capture_document := _capture_extra_action_document(view, steps, capture_state) if extra else _capture_ordinary_action_document(view, steps, capture_state)
	view.call("set_document", capture_document)
	if capture_state == "shared-impact": view._semantic_steps._select_slot(4 if extra else 1)
	elif capture_state in ["linked-message", "linked-sound"]: view._semantic_steps._select_slot(0)
	view.set_block_signals(false); view._semantic_steps._request_description()
	for _frame in range(120):
		if not view._semantic_steps._form_description.is_empty(): break
		await process_frame
	if capture_state in ["linked-message", "linked-sound"]:
		var described := view._semantic_steps._form_description.duplicate(true) as Dictionary
		var fields := described.get("fields", []) as Array
		if not fields.is_empty():
			var field := (fields[0] as Dictionary).duplicate(true)
			field["preview"] = {"label": "Sound 1015 · Moon Gate chime" if capture_state == "linked-sound" else "String 47",
				"detail": "Ready · 1.4 seconds · scenario audio" if capture_state == "linked-sound" else "Captain Veyra lowers her voice: the reliquary is empty."}
			fields[0] = field
			described["fields"] = fields
			view._semantic_steps.set_form_description(described, view._semantic_steps._describe_generation)


	print("PROVIDENCE_ACTION_FORM_CAPTURE fields=%d title=%s" % [
		(view._semantic_steps._form_description.get("fields", []) as Array).size(),
		str(view._semantic_steps._form_description.get("title", "none"))])
	editor._command_bar.set_project_identity("City of Bywater" if capture_state == "shared-impact" else "Moon Gate Scenario", false)
	editor._status.text = "Ready · revision 42 · native Rust session"
	editor.call("_show_script_inspector", "extra-action-point" if extra else "action-point",
		capture_document.get("extraActionPoint" if extra else "actionPoint", {}), capture_document.get("references", []))
	for _frame in range(3): await process_frame
	match capture_state:
		"chooser":
			view._semantic_steps.get_node("%ChooseAction").pressed.emit()
		"empty":
			view.call("set_summaries", {"items": [], "total": 0,
				"map": {"identity": "land:0", "name": "Moon Gate Expanse", "levelType": "land"}}, 42)
			editor.call("_show_script_inspector", "extra-action-point" if extra else "action-point", {}, [])
		"destructive":
			if extra: view._show_delete_confirmation()
			else: view._show_clear_confirmation()
		"saved":
			view._validation.text = "Saved · revision 43 · validation passed with no blocking problems"
			editor._status.text = "Saved · revision 43 · deterministic project snapshot"
		"shared-impact": SharedSettingsCapture.show_dialog(view, extra)
	for _frame in range(3): await process_frame


func _prepare_simple_encounter_surface(editor: Control) -> void:
	await SimpleEncounterCapture.prepare(editor, self)


func _prepare_global_macro_surface(editor: Control) -> void:
	editor._navigation.select_route("scripts.global-macros")
	var view: Control = editor.find_child("Global Macros", true, false)
	var scripts := [
		{"nativeId": 77, "descriptor": "Temple arrival and welcome", "populatedActions": 3, "steps": [
			{"opcode": 1, "definition": {"label": "Show Message"}}, {"opcode": 9, "definition": {"label": "Play Sound"}}, {"opcode": 24, "definition": {"label": "Continue Steps"}}]},
		{"nativeId": 118, "descriptor": "Shop entry offer", "populatedActions": 2, "steps": [
			{"opcode": 1, "definition": {"label": "Show Message"}}, {"opcode": 24, "definition": {"label": "Continue Steps"}}]},
	]
	var hooks := []
	for hook in ["start", "death", "quit", "shop", "temple"]:
		var target: Variant = 77 if hook == "start" else 118 if hook == "shop" else null
		hooks.append({"hook": hook, "targetNativeId": target, "runtimeConsumer": "%s lifecycle condition" % hook.capitalize(), "reference": {"resolution": "resolved" if target != null else "unassigned"}})
	view.set_document({"revision": 42, "hooks": hooks, "assignedScripts": scripts})
	editor._command_bar.set_project_identity("City of Bywater", false)
	editor._status.text = "Ready · revision 42 · native Rust session"
	for _frame in range(3): await process_frame


func _capture_extra_action_document(view: Control, steps: Array, state: String) -> Dictionary:
	if state == "shared-impact": return SharedSettingsCapture.document(view, true, steps)
	var summary := {"identity": "extra-action-point:17", "nativeId": 17, "descriptor": "Moon Gate battle", "reusable": true, "usedBy": 2, "problems": 0}
	var items := [summary,
		{"identity": "extra-action-point:18", "nativeId": 18, "descriptor": "Bell tower alarm", "usedBy": 3, "problems": 0},
		{"identity": "extra-action-point:19", "nativeId": 19, "descriptor": "Flooded chapel response", "usedBy": 1, "problems": 0},
		{"identity": "extra-action-point:20", "nativeId": 20, "descriptor": "Gatehouse retreat", "usedBy": 2, "problems": 0},
		{"identity": "extra-action-point:21", "nativeId": 21, "descriptor": "Unused staging macro", "usedBy": 0, "problems": 0}]
	view.call("set_summaries", {"items": items, "offset": 0, "limit": 5, "total": 241,
		"counts": {"all": 241, "macro": 72, "battle": 38, "monster": 24,
			"noKnownCaller": 15, "padding": 31, "residue": 9,
			"authoredWithoutKnownCaller": 12, "trace": 4, "warnings": 3}}, 42, summary.identity)
	var references := [_capture_reference(summary.identity, state == "conflict-missing", state)]
	return {"revision": 42, "references": references, "usedBy": [
		{"source": "Action Point 017 · Moon Gate Expanse", "field": "actions[2].targetNativeId"},
		{"source": "Extra Action Point 040 · Gatehouse Alarm", "field": "actions[0].targetNativeId"},
	], "steps": steps, "extraCodeAttachments": [], "extraActionPoint": {"identity": summary.identity,
		"descriptor": "Moon Gate battle",
		"nativeId": 17, "classicDoorId": 0, "postActionLevel": 0, "postActionX": 0,
		"postActionY": 0, "chancePercent": 100, "actions": ActionCaptureData.raw_actions(true)}}


func _capture_ordinary_action_document(view: Control, steps: Array, state: String) -> Dictionary:
	if state == "shared-impact": return SharedSettingsCapture.document(view, false, steps)
	var map := {"identity": "land:0", "name": "Moon Gate Expanse", "levelType": "land"}
	var identity := "action-point:land:0:17"
	view.call("set_maps", [map])
	var items := [
		{"identity": identity, "recordIndex": 17, "descriptor": "Moon Gate ambush", "coordinate": {"x": 18, "y": 23}, "chancePercent": 75, "populatedActions": 3, "active": true, "problems": 0},
		{"identity": "action-point:land:0:18", "recordIndex": 18, "descriptor": "East watch bell", "coordinate": {"x": 19, "y": 23}, "chancePercent": 100, "populatedActions": 2, "active": true, "problems": 0},
		{"identity": "action-point:land:0:19", "recordIndex": 19, "descriptor": "Reliquary choice", "coordinate": {"x": 22, "y": 29}, "chancePercent": 100, "populatedActions": 4, "active": true, "problems": 0},
		{"identity": "action-point:land:0:20", "recordIndex": 20, "descriptor": "Guard challenge", "coordinate": {"x": 31, "y": 14}, "chancePercent": 80, "populatedActions": 3, "active": true, "problems": 0},
		{"identity": "action-point:land:0:21", "recordIndex": 21, "descriptor": "Empty reusable slot", "coordinate": null, "chancePercent": 0, "populatedActions": 0, "active": false, "problems": 0}]
	view.call("set_summaries", {"items": items, "offset": 0, "limit": 5, "total": 100, "map": map,
		"counts": {"all": 320, "current-map": 100, "active": 95, "reusable": 5, "warnings": 2}}, 42, identity)
	var references := [_capture_reference(identity, state == "conflict-missing", state)]
	return {"revision": 42, "references": references, "usedBy": [
		{"source": "Extra Action Point 040 · Gatehouse Alarm", "field": "actions[3].targetNativeId"},
	], "steps": steps, "map": map, "actionPoint": {"identity": identity, "descriptor": "Moon Gate ambush", "recordIndex": 17, "levelIndex": 0,
		"coordinate": {"x": 18, "y": 23}, "chancePercent": 75, "postActionLevel": 0,
		"postActionX": 21, "postActionY": 24, "actions": ActionCaptureData.raw_actions(false)}}
func _capture_live_action_catalog(editor: Control) -> Dictionary:
	var catalog := _capture_action_catalog()
	if not editor._bridge.connection_alive():
		var started: Dictionary = editor._bridge.start_demo()
		if not bool(started.get("ok", false)):
			push_warning("Action catalog capture is using its bounded fallback: %s" % str(started.get("error", "adapter unavailable")))
	if not editor._bridge.connection_alive(): return catalog
	editor._scripts.attach_session(editor._bridge)
	var response: Dictionary = editor._bridge.request("action-definition.list", {"cursor": "0", "limit": 128})
	return (response.get("result", {}) as Dictionary).duplicate(true) if bool(response.get("ok", false)) else catalog


func _capture_reference(source: String, missing: bool, state := "") -> Dictionary:
	var sound := state == "linked-sound"
	return {"source": source, "field": "actions[0].target" if state.begins_with("linked-") else "actions[1].targetNativeId",
		"targetId": "sound:1015" if sound else "message:47",
		"targetKind": "sound" if sound else "message", "resolution": "missing" if missing else "resolved"}


func _capture_action_catalog() -> Dictionary:
	return ActionCaptureData.catalog()


func _prepare_scenario_import_surface(editor: Control) -> void:
	var scenario_source := OS.get_environment("PROVIDENCE_CAPTURE_SCENARIO_SOURCE")
	var application_data := OS.get_environment("PROVIDENCE_CAPTURE_APPLICATION_DATA")
	if scenario_source.is_empty() or application_data.is_empty():
		push_error("Scenario import capture requires PROVIDENCE_CAPTURE_SCENARIO_SOURCE and PROVIDENCE_CAPTURE_APPLICATION_DATA")
		return
	var dialog := editor.find_child("ScenarioImportDialog", true, false)
	if dialog == null:
		push_error("Scenario import dialog was not found")
		return
	dialog.call("popup_import")
	dialog.call("set_source_directories", scenario_source, application_data)
	dialog.call("request_classic_inspection")
	dialog.popup_centered(Vector2i(920, 680))


func _prepare_scenario_picture_surface(editor: Control) -> void:
	editor.call("_activate_activity", "media")
	var picture_editor := editor.find_child("Scenario Pictures", true, false)
	if picture_editor == null:
		push_error("Scenario Pictures editor was not found")
		return
	var pictures := [
		{"identity": "picture:30000", "label": "The Crown and the Moon Gate", "resourceType": "PICT", "resourceId": 30000, "width": 640, "height": 400, "bytes": 24892, "classicPayloadBytes": 18742, "hasPreview": true},
		{"identity": "picture:30001", "label": "Captain Renald at Thornwatch", "resourceType": "PICT", "resourceId": 30001, "width": 640, "height": 400, "bytes": 23104, "classicPayloadBytes": 18112, "hasPreview": true},
		{"identity": "picture:30002", "label": "The Flooded Chapel Reliquary", "resourceType": "PICT", "resourceId": 30002, "width": 512, "height": 384, "bytes": 21880, "classicPayloadBytes": 16904, "hasPreview": true},
		{"identity": "picture:30003", "label": "Widow's Causeway at Dusk", "resourceType": "PICT", "resourceId": 30003, "width": 640, "height": 360, "bytes": 20554, "classicPayloadBytes": 15742, "hasPreview": true},
		{"identity": "picture:30004", "label": "Ashen Crown Audience Chamber", "resourceType": "PICT", "resourceId": 30004, "width": 640, "height": 400, "bytes": 27119, "classicPayloadBytes": 19640, "hasPreview": true},
		{"identity": "picture:30005", "label": "Missing: Northern Beacon", "resourceType": "PICT", "resourceId": 30005, "width": 0, "height": 0, "bytes": 0, "classicPayloadBytes": 14822, "hasPreview": false},
	]
	picture_editor.set_block_signals(true)
	picture_editor.call("set_pictures", {"items": pictures, "total": pictures.size()}, 12)
	picture_editor.call("set_document", {
		"revision": 12,
		"picture": pictures[0],
		"source": "authored image import",
		"sourceBlob": "f6a2d4b731e905c6d2deef12",
		"classicPayloadBlob": "87c1e9d0b4a355722b1f9c60",
		"classicPayloadBytes": 18742,
	})
	var preview := Image.create(640, 400, false, Image.FORMAT_RGBA8)
	preview.fill(Color("315d7c"))
	for y in range(210, 400):
		for x in range(640):
			var cell := int(x / 32) + int(y / 24)
			var color := Color("d4a54a") if cell % 3 == 0 else Color("243746")
			preview.set_pixel(x, y, color)
	picture_editor.call("set_preview_base64", Marshalls.raw_to_base64(preview.save_png_to_buffer()), "image/png")
	picture_editor.set_block_signals(false)


func _prepare_scenario_sound_surface(editor: Control) -> void:
	editor.call("_activate_activity", "media")
	editor._navigation.select_tab(8)
	var sound_editor := editor.find_child("Scenario Sounds", true, false)
	if sound_editor == null:
		push_error("Scenario Sounds editor was not found")
		return
	var sounds := [
		{"identity": "sound:200", "label": "Thornwatch Portcullis and Western Bell", "resourceType": "snd ", "resourceId": 200, "sampleRate": 11025, "channels": 2, "durationMs": 4820, "bytes": 212644, "classicPayloadBytes": 53174, "hasPreview": true},
		{"identity": "sound:201", "label": "Moon Gate Chains Across the Western Tower", "resourceType": "snd ", "resourceId": 201, "sampleRate": 22050, "channels": 1, "durationMs": 3110, "bytes": 137214, "classicPayloadBytes": 68596, "hasPreview": true},
		{"identity": "sound:202", "label": "Flooded Chapel Water and Distant Choir", "resourceType": "snd ", "resourceId": 202, "sampleRate": 11025, "channels": 1, "durationMs": 7840, "bytes": 86480, "classicPayloadBytes": 86470, "hasPreview": true},
		{"identity": "sound:203", "label": "Captain Renald Draws the Observatory Bolt", "resourceType": "snd ", "resourceId": 203, "sampleRate": 22050, "channels": 2, "durationMs": 1920, "bytes": 169388, "classicPayloadBytes": 42356, "hasPreview": true},
		{"identity": "sound:204", "label": "Widow's Causeway Wind — Long Exterior Loop", "resourceType": "snd ", "resourceId": 204, "sampleRate": 11025, "channels": 1, "durationMs": 12640, "bytes": 139400, "classicPayloadBytes": 139386, "hasPreview": true},
		{"identity": "sound:205", "label": "Missing: Northern Beacon Alarm", "resourceType": "snd ", "resourceId": 205, "sampleRate": 0, "channels": 0, "durationMs": 0, "bytes": 0, "classicPayloadBytes": 0, "hasPreview": false},
	]
	sound_editor.set_block_signals(true)
	sound_editor.call("set_sounds", {"items": sounds, "total": sounds.size()}, 13)
	sound_editor.call("set_document", {
		"revision": 13,
		"sound": sounds[0],
		"source": "authored WAV import",
		"sourceBlob": "270e5bce3837330a4679de21",
		"classicPayloadBlob": "4c6389c5db27bb78f3c1b249",
		"classicPayloadBytes": 53174,
	})
	var samples := PackedByteArray()
	samples.resize(8000)
	for index in range(samples.size()):
		var attack := minf(1.0, float(index) / 300.0)
		var decay := 1.0 - float(index) / samples.size() * 0.62
		samples[index] = clampi(128 + int(sin(float(index) * 0.083) * 105.0 * attack * decay), 0, 255)
	sound_editor.call("set_preview_pcm8_base64", Marshalls.raw_to_base64(samples), 11025)
	sound_editor.set_block_signals(false)


func _prepare_scenario_icon_surface(editor: Control) -> void:
	editor.call("_activate_activity", "media")
	editor._navigation.select_tab(9)
	var icon_editor := editor.find_child("Scenario Icons", true, false)
	if icon_editor == null:
		push_error("Scenario Icons editor was not found")
		return
	var icons := [
		{"identity": "icon:30126", "label": "Ashen Gate Sigil With A Very Long Corpus Name", "resourceType": "cicn", "resourceId": 30126, "width": 32, "height": 32, "bytes": 1834, "classicPayloadBytes": 2466, "hasPreview": true},
		{"identity": "icon:30127", "label": "Captain Renald — Thornwatch Faction", "resourceType": "cicn", "resourceId": 30127, "width": 32, "height": 32, "bytes": 1652, "classicPayloadBytes": 2386, "hasPreview": true},
		{"identity": "icon:30128", "label": "Flooded Chapel Reliquary", "resourceType": "cicn", "resourceId": 30128, "width": 32, "height": 32, "bytes": 2014, "classicPayloadBytes": 2530, "hasPreview": true},
		{"identity": "icon:30129", "label": "Widow's Causeway Warning Marker", "resourceType": "cicn", "resourceId": 30129, "width": 32, "height": 32, "bytes": 1510, "classicPayloadBytes": 2306, "hasPreview": true},
		{"identity": "icon:30130", "label": "Moon Gate Key — Ambiguous Uses", "resourceType": "cicn", "resourceId": 30130, "width": 32, "height": 32, "bytes": 1742, "classicPayloadBytes": 2434, "hasPreview": true},
		{"identity": "icon:30131", "label": "Missing: Northern Beacon Crest", "resourceType": "cicn", "resourceId": 30131, "width": 32, "height": 32, "bytes": 0, "classicPayloadBytes": 0, "hasPreview": false},
		{"identity": "icon:30132", "label": "Silver Harbor Guild Mark", "resourceType": "cicn", "resourceId": 30132, "width": 32, "height": 32, "bytes": 1902, "classicPayloadBytes": 2498, "hasPreview": true},
		{"identity": "icon:30133", "label": "Observatory Lens Control", "resourceType": "cicn", "resourceId": 30133, "width": 32, "height": 32, "bytes": 1719, "classicPayloadBytes": 2418, "hasPreview": true},
	]
	icon_editor.set_block_signals(true)
	icon_editor.call("set_icons", {"items": icons, "total": icons.size()}, 14)
	icon_editor.call("set_document", {
		"revision": 14,
		"icon": icons[0],
		"source": "authored image import (48 x 40 source)",
		"sourceBlob": "ef34ea73b491fe2a63a80318",
		"classicPayloadBlob": "5e70b90d6fd25a53c9f24ee7",
		"classicPayloadBytes": 2466,
	})
	for index in range(icons.size()):
		if not bool((icons[index] as Dictionary).get("hasPreview", false)):
			continue
		var icon := Image.create(64, 64, false, Image.FORMAT_RGBA8)
		icon.fill(Color(0.06, 0.08, 0.11, 0.0))
		var primary := Color.from_hsv(float(index * 47 % 360) / 360.0, 0.52, 0.72)
		for y in range(8, 56):
			for x in range(8, 56):
				if ((x - 32) * (x - 32) + (y - 32) * (y - 32)) < 430 and (x + y + index) % 5 != 0:
					icon.set_pixel(x, y, primary if x < 32 else primary.lightened(0.22))
		icon_editor.call("set_thumbnail_base64", str((icons[index] as Dictionary).get("identity", "")), Marshalls.raw_to_base64(icon.save_png_to_buffer()), "image/png")
		if index == 0:
			icon_editor.call("set_preview_base64", Marshalls.raw_to_base64(icon.save_png_to_buffer()), "image/png")
	icon_editor.set_block_signals(false)


func _prepare_special_land_surface(editor: Control) -> void:
	editor.call("_activate_activity", "media")
	editor._navigation.select_tab(10)
	var tile_editor := editor.find_child("Special Land Tiles", true, false)
	if tile_editor == null:
		push_error("Special Land Tiles editor was not found")
		return
	var tiles := [
		{"identity": "special-land.-91", "label": "Moon Gate — Western Observatory Overlay", "resourceType": "cicn", "resourceId": -91, "width": 32, "height": 32, "bytes": 1852, "classicPayloadBytes": 2418, "hasPreview": true, "uses": 3, "landlook": 2, "baseTile": 37},
		{"identity": "special-land.-92", "label": "Flooded Chapel Reliquary and Broken Pillars", "resourceType": "cicn", "resourceId": -92, "width": 32, "height": 32, "bytes": 1736, "classicPayloadBytes": 2374, "hasPreview": true, "uses": 8, "landlook": 4, "baseTile": 18},
		{"identity": "special-land.-93", "label": "Thornwatch Portcullis — Raised", "resourceType": "cicn", "resourceId": -93, "width": 32, "height": 32, "bytes": 1624, "classicPayloadBytes": 2326, "hasPreview": true, "uses": 1, "landlook": 1, "baseTile": 44},
		{"identity": "special-land.-94", "label": "Widow's Causeway Collapsed Span", "resourceType": "cicn", "resourceId": -94, "width": 32, "height": 32, "bytes": 1908, "classicPayloadBytes": 2478, "hasPreview": true, "uses": 12, "landlook": 3, "baseTile": 9},
		{"identity": "special-land.-95", "label": "Ashen Crown Audience Dais", "resourceType": "cicn", "resourceId": -95, "width": 32, "height": 32, "bytes": 1814, "classicPayloadBytes": 2402, "hasPreview": true, "uses": 2, "landlook": 5, "baseTile": 51},
		{"identity": "special-land.-96", "label": "Missing: Northern Beacon Foundation", "resourceType": "cicn", "resourceId": -96, "width": 32, "height": 32, "bytes": 0, "classicPayloadBytes": 0, "hasPreview": false, "uses": 4, "landlook": 2, "baseTile": 63},
	]
	var used_by := [
		{"source": "LAND 000 · Moon Gate Expanse", "field": "tiles[7][12].specialLand"},
		{"source": "LAND 000 · Moon Gate Expanse", "field": "tiles[8][12].specialLand"},
		{"source": "LAND 003 · Observatory Approach", "field": "tiles[41][63].specialLand"},
	]
	tile_editor.set_block_signals(true)
	tile_editor.call("set_tiles", {"items": tiles, "total": tiles.size(), "missingTargets": [{"targetId": -96}, {"targetId": -97}]}, 15)
	tile_editor.call("set_document", {
		"revision": 15,
		"tile": tiles[0],
		"source": "authored transparent image import",
		"sourceBlob": "ea81f27b9a4430e5d18f2c77",
		"classicPayloadBlob": "21c809ce62ad47b37af50d94",
		"classicPayloadBytes": 2418,
		"usedBy": used_by,
	})
	for index in range(tiles.size()):
		if not bool((tiles[index] as Dictionary).get("hasPreview", false)):
			continue
		var icon := Image.create(64, 64, false, Image.FORMAT_RGBA8)
		icon.fill(Color(0.06, 0.08, 0.11, 0.0))
		var primary := Color.from_hsv(float((index * 43 + 28) % 360) / 360.0, 0.58, 0.76)
		for y in range(7, 57):
			for x in range(7, 57):
				var diamond: bool = abs(x - 32) + abs(y - 32) < 32
				if diamond and (x + y + index * 3) % 7 != 0:
					icon.set_pixel(x, y, primary if x < 32 else primary.lightened(0.18))
		tile_editor.call("set_thumbnail_base64", str((tiles[index] as Dictionary).get("identity", "")), Marshalls.raw_to_base64(icon.save_png_to_buffer()), "image/png")
		if index == 0:
			tile_editor.call("set_preview_base64", Marshalls.raw_to_base64(icon.save_png_to_buffer()), "image/png")
	tile_editor.set_block_signals(false)
