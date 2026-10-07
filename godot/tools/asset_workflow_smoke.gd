extends RefCounted

const Fixture = preload("res://tools/scenario_media_smoke_fixture.gd")


static func run_scenario_picture(shell: Control, project_path: String) -> void:
	var _bridge: ProvidenceNativeBridge = shell.get("_bridge")
	var _scenario_picture_editor: Control = shell._documents.view("assets.pictures")
	if not await Fixture.open_project(shell, "scenario-picture-smoke", project_path): return
	await shell._navigation.activate_domain("assets")
	var source_path := project_path.path_join("moon-gate-source.png")
	var source_image := Image.create(24, 16, false, Image.FORMAT_RGBA8)
	source_image.fill(Color("315d7c"))
	for y in range(8, 16):
		for x in range(24):
			if (x + y) % 3 == 0:
				source_image.set_pixel(x, y, Color("d4a54a"))
	if source_image.save_png(source_path) != OK:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Picture source PNG could not be created")
		return
	await _scenario_picture_editor.import_for_smoke(source_path, "The Crown and the Moon Gate", 30000, source_image, true)
	if int(shell._session_view.revision) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Picture import did not produce revision 1")
		return
	var listed := _bridge.request("picture.list", {"offset": 0, "limit": 128})
	if not bool(listed.get("ok", false)) or int((listed.result as Dictionary).get("total", 0)) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(listed.get("error", "Scenario Picture list did not contain one resource")))
		return
	var opened := _bridge.request("picture.open", {"identity": "picture:30000"})
	if not bool(opened.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(opened.get("error", "Scenario Picture did not reopen")))
		return
	var picture := (opened.result as Dictionary).get("picture", {}) as Dictionary
	if int(picture.get("resourceId", 0)) != 30000 or int(picture.get("width", 0)) != 24 or int(picture.get("height", 0)) != 16:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Picture import lost resource identity or source dimensions")
		return
	if not _verify_png_preview(shell, "picture", "Scenario Picture", "picture:30000", Vector2i(24, 16)): return
	var name_field := _scenario_picture_editor.find_child("PictureLabel", true, false) as LineEdit
	var id_field := _scenario_picture_editor.find_child("PictureResourceId", true, false) as SpinBox
	name_field.text = "The Crown and the Moon Gate — Restored"
	id_field.value = 30001
	await _scenario_picture_editor.commit_selected()
	if int(shell._session_view.revision) != 2:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Picture metadata edit did not produce revision 2")
		return
	await shell._undo()
	await shell._redo()
	if int(shell._session_view.revision) != 4:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Picture undo and redo did not advance to revision 4")
		return
	var checkpoint := await Fixture.compile_save_reopen(shell, project_path, "picture", "Scenario Picture", 4)
	if not checkpoint.ok: return
	var reopened_picture := _bridge.request("picture.open", {"identity": "picture:30000"})
	if not bool(reopened_picture.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(reopened_picture.get("error", "Reopened Scenario Picture was missing")))
		return
	var reopened_definition := (reopened_picture.result as Dictionary).get("picture", {}) as Dictionary
	if str(reopened_definition.get("label", "")) != "The Crown and the Moon Gate — Restored" or int(reopened_definition.get("resourceId", 0)) != 30001:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Picture reopen lost edited canonical metadata")
		return
	if not Fixture.verify_repeat_compile(shell, project_path, "picture", "Scenario Picture", checkpoint): return
	print("PROVIDENCE_SCENARIO_PICTURE_SMOKE_OK revision=4 pictures=1")
	shell.get_tree().quit(0)


static func run_scenario_sound(shell: Control, project_path: String) -> void:
	var _bridge: ProvidenceNativeBridge = shell.get("_bridge")
	var _scenario_sound_editor: Control = shell._documents.view("assets.sounds")
	if not await Fixture.open_project(shell, "scenario-sound-smoke", project_path): return
	await shell._navigation.activate_domain("assets")
	await shell._navigation.select_tab(8)
	while shell.get("_operations").busy: await shell.get_tree().process_frame
	var source_path := project_path.path_join("thornwatch-bell.wav")
	if not _write_smoke_wav(source_path):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Sound source WAV could not be created")
		return
	await _scenario_sound_editor.import_for_smoke(source_path, "Thornwatch Portcullis and Western Bell", 200)
	if int(shell._session_view.revision) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Sound import did not produce revision 1")
		return
	var listed := _bridge.request("sound.list", {"offset": 0, "limit": 128})
	if not bool(listed.get("ok", false)) or int((listed.result as Dictionary).get("total", 0)) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(listed.get("error", "Scenario Sound list did not contain one resource")))
		return
	var opened := _bridge.request("sound.open", {"identity": "sound:200"})
	if not bool(opened.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(opened.get("error", "Scenario Sound did not reopen")))
		return
	var sound := (opened.result as Dictionary).get("sound", {}) as Dictionary
	if int(sound.get("resourceId", 0)) != 200 or int(sound.get("sampleRate", 0)) != 11025 or int(sound.get("channels", 0)) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Sound import lost resource identity or decoded audio metadata")
		return
	if not _verify_sound_preview(shell, _scenario_sound_editor): return
	var name_field := _scenario_sound_editor.find_child("SoundLabel", true, false) as LineEdit
	var id_field := _scenario_sound_editor.find_child("SoundResourceId", true, false) as SpinBox
	name_field.text = "Thornwatch Portcullis and Western Bell — Restored"
	id_field.value = 201
	await _scenario_sound_editor.commit_selected()
	if int(shell._session_view.revision) != 2:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Sound metadata edit did not produce revision 2")
		return
	await shell._undo()
	await shell._redo()
	if int(shell._session_view.revision) != 4:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Sound undo and redo did not advance to revision 4")
		return
	var checkpoint := await Fixture.compile_save_reopen(shell, project_path, "sound", "Scenario Sound", 4)
	if not checkpoint.ok: return
	var reopened_sound := _bridge.request("sound.open", {"identity": "sound:200"})
	if not bool(reopened_sound.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(reopened_sound.get("error", "Reopened Scenario Sound was missing")))
		return
	var reopened_definition := (reopened_sound.result as Dictionary).get("sound", {}) as Dictionary
	if str(reopened_definition.get("label", "")) != "Thornwatch Portcullis and Western Bell — Restored" or int(reopened_definition.get("resourceId", 0)) != 201:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Sound reopen lost edited canonical metadata")
		return
	if not Fixture.verify_repeat_compile(shell, project_path, "sound", "Scenario Sound", checkpoint): return
	print("PROVIDENCE_SCENARIO_SOUND_SMOKE_OK revision=4 sounds=1")
	shell.get_tree().quit(0)


static func run_scenario_icon(shell: Control, project_path: String) -> void:
	var _bridge: ProvidenceNativeBridge = shell.get("_bridge")
	var _scenario_icon_editor: Control = shell._documents.view("assets.icons")
	if not await Fixture.open_project(shell, "scenario-icon-smoke", project_path): return
	await shell._navigation.activate_domain("assets")
	await shell._navigation.select_tab(9)
	while shell.get("_operations").busy: await shell.get_tree().process_frame
	var source_path := project_path.path_join("ashen-gate-sigil.png")
	var source_image := Image.create(48, 40, false, Image.FORMAT_RGBA8)
	source_image.fill(Color(0.08, 0.11, 0.15, 0.0))
	for y in range(4, 36):
		for x in range(6, 42):
			if ((x - 24) * (x - 24) + (y - 20) * (y - 20)) < 230:
				source_image.set_pixel(x, y, Color("d2a74f") if (x + y) % 4 else Color("7eb7c8"))
	if source_image.save_png(source_path) != OK:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Icon source PNG could not be created")
		return
	await _scenario_icon_editor.import_for_smoke(source_path, "Ashen Gate Sigil With A Very Long Corpus Name", 30126, source_image, false)
	if int(shell._session_view.revision) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Icon import did not produce revision 1")
		return
	var listed := _bridge.request("icon.list", {"offset": 0, "limit": 128})
	if not bool(listed.get("ok", false)) or int((listed.result as Dictionary).get("total", 0)) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(listed.get("error", "Scenario Icon list did not contain one resource")))
		return
	var opened := _bridge.request("icon.open", {"identity": "icon:30126"})
	if not bool(opened.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(opened.get("error", "Scenario Icon did not reopen")))
		return
	var icon := (opened.result as Dictionary).get("icon", {}) as Dictionary
	if int(icon.get("resourceId", 0)) != 30126 or int(icon.get("width", 0)) != 32 or int(icon.get("height", 0)) != 32:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Icon import lost resource identity or final 32 x 32 geometry")
		return
	if not _verify_png_preview(shell, "icon", "Scenario Icon", "icon:30126", Vector2i(48, 40)): return
	var name_field := _scenario_icon_editor.find_child("PictureLabel", true, false) as LineEdit
	var id_field := _scenario_icon_editor.find_child("PictureResourceId", true, false) as SpinBox
	name_field.text = "Ashen Gate Sigil — Restored"
	id_field.value = 30127
	await _scenario_icon_editor.commit_selected()
	if int(shell._session_view.revision) != 2:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Icon metadata edit did not produce revision 2")
		return
	await shell._undo()
	await shell._redo()
	if int(shell._session_view.revision) != 4:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Icon undo and redo did not advance to revision 4")
		return
	var checkpoint := await Fixture.compile_save_reopen(shell, project_path, "icon", "Scenario Icon", 4)
	if not checkpoint.ok: return
	var reopened_icon := _bridge.request("icon.open", {"identity": "icon:30126"})
	if not bool(reopened_icon.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(reopened_icon.get("error", "Reopened Scenario Icon was missing")))
		return
	var reopened_definition := (reopened_icon.result as Dictionary).get("icon", {}) as Dictionary
	if str(reopened_definition.get("label", "")) != "Ashen Gate Sigil — Restored" or int(reopened_definition.get("resourceId", 0)) != 30127:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Icon reopen lost edited canonical metadata")
		return
	if not Fixture.verify_repeat_compile(shell, project_path, "icon", "Scenario Icon", checkpoint): return
	print("PROVIDENCE_SCENARIO_ICON_SMOKE_OK revision=4 icons=1")
	shell.get_tree().quit(0)


static func run_special_land(shell: Control, project_path: String) -> void:
	var _bridge: ProvidenceNativeBridge = shell.get("_bridge")
	var _special_land_editor: Control = shell._documents.view("maps.special-land")
	if not await Fixture.open_project(shell, "special-land-smoke", project_path): return
	if not await _import_special_land_reference(shell, project_path): return
	shell._navigation.special_land_world_context = true
	await shell._navigation.select_tab(10)
	while shell.get("_operations").busy: await shell.get_tree().process_frame
	var source_path := project_path.path_join("western-moon-gate.png")
	var source_image := _special_land_image()
	if source_image.save_png(source_path) != OK:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land source PNG could not be created")
		return
	(_special_land_editor.find_child("SpecialLandLandlook", true, false) as SpinBox).value = 0
	(_special_land_editor.find_child("SpecialLandBaseTile", true, false) as SpinBox).value = 7
	await _special_land_editor.import_for_smoke(source_path, "Western Moon Gate With Broken Portcullis", -91, source_image, false)
	if int(shell._session_view.revision) != 2:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land import did not produce revision 2")
		return
	var resolved := _bridge.request("special-land.list", {"offset": 0, "limit": 128})
	if not bool(resolved.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(resolved.get("error", "Resolved Special Land list failed")))
		return
	var resolved_result := resolved.result as Dictionary
	if not (resolved_result.get("missingTargets", []) as Array).is_empty() or int((resolved_result.get("items", []) as Array)[0].get("uses", 0)) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land import did not repair the typed map reference")
		return
	var name_field := _special_land_editor.find_child("PictureLabel", true, false) as LineEdit
	var base_field := _special_land_editor.find_child("SpecialLandBaseTile", true, false) as SpinBox
	name_field.text = "Western Moon Gate — Restored"
	base_field.value = 8
	await _special_land_editor.commit_selected()
	if int(shell._session_view.revision) != 3:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land metadata edit did not produce revision 3")
		return
	await shell._undo()
	await shell._redo()
	if int(shell._session_view.revision) != 5:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land undo and redo did not advance to revision 5")
		return
	var checkpoint := await Fixture.compile_save_reopen(shell, project_path, "special-land", "Special Land", 5)
	if not checkpoint.ok: return
	var compiled_ld := FileAccess.get_file_as_bytes(str(checkpoint.directory).path_join("Data LD"))
	var native_offset := (12 * 90 + 7) * 2
	if compiled_ld.size() != 16200 or compiled_ld[native_offset] != 0xfb or compiled_ld[native_offset + 1] != 0xbd:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land compile rewrote the raw -1091 map word")
		return
	var reopened_tile := _bridge.request("special-land.open", {"identity": "special-land.-91"})
	if not bool(reopened_tile.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(reopened_tile.get("error", "Reopened Special Land Tile was missing")))
		return
	var reopened_definition := (reopened_tile.result as Dictionary).get("tile", {}) as Dictionary
	if str(reopened_definition.get("label", "")) != "Western Moon Gate — Restored" or int(reopened_definition.get("baseTile", 0)) != 8 or int(reopened_definition.get("uses", 0)) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land reopen lost metadata or map uses")
		return
	if not Fixture.verify_repeat_compile(shell, project_path, "special-land", "Special Land", checkpoint): return
	print("PROVIDENCE_SPECIAL_LAND_SMOKE_OK revision=5 tiles=1 uses=1")
	shell.get_tree().quit(0)


static func _write_smoke_wav(path: String) -> bool:
	var sample_rate := 11025
	var samples := PackedByteArray()
	samples.resize(2206)
	for index in range(samples.size()):
		var envelope := 1.0 - float(index) / samples.size()
		samples[index] = clampi(128 + int(sin(float(index) * 0.18) * 92.0 * envelope), 0, 255)
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.big_endian = false
	file.store_buffer("RIFF".to_ascii_buffer())
	file.store_32(36 + samples.size())
	file.store_buffer("WAVE".to_ascii_buffer())
	file.store_buffer("fmt ".to_ascii_buffer())
	file.store_32(16)
	file.store_16(1)
	file.store_16(1)
	file.store_32(sample_rate)
	file.store_32(sample_rate)
	file.store_16(1)
	file.store_16(8)
	file.store_buffer("data".to_ascii_buffer())
	file.store_32(samples.size())
	file.store_buffer(samples)
	file.close()
	return true



static func _import_special_land_reference(shell: Control, project_path: String) -> bool:
	var _bridge: ProvidenceNativeBridge = shell.get("_bridge")
	var source_dir := project_path.path_join("classic-source")
	if DirAccess.make_dir_recursive_absolute(source_dir) != OK:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land Classic source directory could not be created")
		return false
	var data_ld := PackedByteArray()
	data_ld.resize(16200)
	var native_offset := (12 * 90 + 7) * 2
	data_ld[native_offset] = 0xfb
	data_ld[native_offset + 1] = 0xbd
	if not preload("res://tools/native_workflow_fixtures.gd")._write_bytes(shell, source_dir.path_join("Data LD"), data_ld):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land Data LD fixture could not be written")
		return false
	var data_dd := PackedByteArray()
	data_dd.resize(4000)
	if not preload("res://tools/native_workflow_fixtures.gd")._write_bytes(shell, source_dir.path_join("Data DD"), data_dd):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land Data DD fixture could not be written")
		return false
	if not preload("res://tools/native_workflow_fixtures.gd")._write_bytes(shell, source_dir.path_join("Data SD2"), PackedByteArray()):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land Data SD2 fixture could not be written")
		return false
	if not preload("res://tools/native_workflow_fixtures.gd")._write_bytes(shell, source_dir.path_join("Data ED"), PackedByteArray()):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land Data ED fixture could not be written")
		return false
	if not (await shell._scenario_import.import_land(source_dir)) or int(shell._session_view.revision) != 1:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Special Land map import did not produce revision 1")
		return false
	var missing := _bridge.request("special-land.list", {"offset": 0, "limit": 128})
	if not bool(missing.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(missing.get("error", "Special Land list failed")))
		return false
	var missing_targets := (missing.result as Dictionary).get("missingTargets", []) as Array
	if missing_targets.size() != 1 or str((missing_targets[0] as Dictionary).get("targetId", "")) != "-91":
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Raw tile -1091 did not expose the normalized missing cicn -91 reference")
		return false
	return true



static func _verify_sound_preview(shell: Control, _scenario_sound_editor: Control) -> bool:
	var _bridge: ProvidenceNativeBridge = shell.get("_bridge")
	var preview := _bridge.request("sound.preview", {"identity": "sound:200"})
	if not bool(preview.get("ok", false)):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(preview.get("error", "Scenario Sound preview was unavailable")))
		return false
	var preview_result := preview.result as Dictionary
	var pcm := Marshalls.base64_to_raw(str(preview_result.get("pcm8Base64", "")))
	if pcm.size() != 2206 or int(preview_result.get("sampleRate", 0)) != 11025:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, "Scenario Sound preview did not decode the durable source WAV")
		return false
	_scenario_sound_editor.set_preview_pcm8_base64(str(preview_result.get("pcm8Base64", "")), 11025)
	return true


static func _special_land_image() -> Image:
	var source_image := Image.create(48, 40, false, Image.FORMAT_RGBA8)
	source_image.fill(Color(0.05, 0.08, 0.11, 0.0))
	for y in range(5, 38):
		for x in range(8, 41):
			if x in [8, 40] or y in [5, 37] or (x + y) % 9 == 0:
				source_image.set_pixel(x, y, Color("d5a94b"))
	return source_image


static func _verify_png_preview(shell: Control, prefix: String, label: String, identity: String, expected_size: Vector2i) -> bool:
	var bridge: ProvidenceNativeBridge = shell.get("_bridge")
	var preview := bridge.request(prefix + ".preview", {"identity": identity})
	if not preview.get("ok", false):
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(preview.get("error", label + " source preview was unavailable")))
		return false
	var bytes := Marshalls.base64_to_raw(str(preview.result.get("base64", "")))
	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK or image.get_size() != expected_size:
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, label + " preview did not decode the durable source image")
		return false
	return true
