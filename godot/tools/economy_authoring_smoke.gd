extends RefCounted

const Fixture = preload("res://tools/native_workflow_fixtures.gd")


static func _run_economy_authoring_smoke(shell: Control, project_path: String, source_directory: String) -> void:
	var created = shell._bridge.create_project("economy-authoring-smoke", project_path)
	if not bool(created.get("ok", false)):
		Fixture._smoke_fail(shell, str(created.get("error", "Economy project creation failed")))
		return
	await shell._activate_session(created)
	if not _import_sources(shell, source_directory): return
	if not await _edit_treasure(shell): return
	if not await _exercise_treasure_lifecycle(shell): return
	if not await _edit_shop(shell): return
	if not await _exercise_shop_lifecycle(shell): return
	if not _save_and_reopen(shell, project_path): return
	var compiled := _compile_twice(shell, project_path)
	if compiled.is_empty(): return
	if not await _reimport_and_verify(shell, project_path.path_join("reimport-project"), str(compiled.output)): return
	print("PROVIDENCE_ECONOMY_AUTHORING_NATIVE_OK revision=3 treasures=2 shops=2 deterministic=true")
	shell.get_tree().quit(0)


static func _import_sources(shell: Control, source_directory: String) -> bool:
	for request in [
		["item-rules.import-scenario", {"path": source_directory.path_join("Data NI")}],
		["project.import-classic-treasures", {"directory": source_directory}],
		["project.import-classic-shops", {"directory": source_directory}],
	]:
		var params := (request[1] as Dictionary).duplicate()
		params["expectedRevision"] = shell._session_view.revision
		var response = shell._bridge.request(str(request[0]), params)
		if not bool(response.get("ok", false)):
			Fixture._smoke_fail(shell, str(response.get("error", "Economy source import failed")))
			return false
		shell._session_view.apply(response.result as Dictionary)
	if shell._session_view.revision != 3:
		Fixture._smoke_fail(shell, "Economy sources did not import as three exact revisions")
		return false
	return true


static func _edit_treasure(shell: Control) -> bool:
	var controller = shell._workbenches.treasure_commands
	var view: ProvidenceTreasureEditor = shell._workbenches.treasure
	var loaded: Dictionary = await controller.reload()
	if not bool(loaded.get("ok", false)):
		Fixture._smoke_fail(shell, str(loaded.get("error", "Treasure workbench did not load")))
		return false
	var pool := view.find_child("ItemPool", true, false) as ItemList
	await _find_pool_item(shell, view, 800)
	if pool.item_count == 0 or int((pool.get_item_metadata(0) as Dictionary).get("classicId", -1)) != 800:
		Fixture._smoke_fail(shell, "Treasure item pool did not expose imported scenario item 800")
		return false
	pool.select(0)
	pool.item_selected.emit(0)
	view._add_selected_item()
	(view.find_child("Experience", true, false) as LineEdit).text = "-10"
	(view.find_child("Gold", true, false) as LineEdit).text = "250"
	(view.find_child("Gems", true, false) as LineEdit).text = "3"
	(view.find_child("Jewelry", true, false) as LineEdit).text = "4"
	var applied: Dictionary = await view.commit_selected()
	if not bool(applied.get("ok", false)) or shell._session_view.revision != 4:
		Fixture._smoke_fail(shell, str(applied.get("error", "Treasure Apply did not produce revision 4")))
		return false
	return _verify_treasure(shell, 0, 800, -10, 250, 3, 4)


static func _find_pool_item(shell: Control, view: Control, native_id: int) -> void:
	var search := view.find_child("ItemSearch", true, false) as LineEdit
	search.text = str(native_id)
	search.text_changed.emit(search.text)
	var pool := view.find_child("ItemPool", true, false) as ItemList
	var deadline := Time.get_ticks_msec() + 20000
	while Time.get_ticks_msec() < deadline:
		if not shell._operations.busy and pool.item_count > 0 and pool.get_item_metadata(0) is Dictionary:
			if int((pool.get_item_metadata(0) as Dictionary).get("classicId", -1)) == native_id: return
		await shell.get_tree().process_frame


static func _exercise_treasure_lifecycle(shell: Control) -> bool:
	var controller = shell._workbenches.treasure_commands
	var view: ProvidenceTreasureEditor = shell._workbenches.treasure
	await controller.create_record(1)
	(view.find_child("Gold", true, false) as LineEdit).text = "9"
	var applied: Dictionary = await view.commit_selected()
	if not bool(applied.get("ok", false)): return _fail(shell, applied, "New Treasure edit failed")
	await controller.clear_record(1)
	if not _verify_treasure(shell, 1, 0, 0, 0, 0, 0): return false
	if not _history(shell, "history.undo"): return false
	if not _verify_treasure(shell, 1, 0, 0, 9, 0, 0): return false
	if not _history(shell, "history.redo"): return false
	return _verify_treasure(shell, 1, 0, 0, 0, 0, 0)


static func _edit_shop(shell: Control) -> bool:
	var controller = shell._workbenches.shop_commands
	var view: ProvidenceShopEditor = shell._workbenches.shop
	var loaded: Dictionary = await controller.reload()
	if not bool(loaded.get("ok", false)):
		return _fail(shell, loaded, "Shop workbench did not load")
	var category := view.find_child("CategoryFilter", true, false) as OptionButton
	category.select(5)
	category.item_selected.emit(5)
	await shell.get_tree().process_frame
	while shell._operations.busy: await shell.get_tree().process_frame
	var pool := view.find_child("ItemPool", true, false) as ItemList
	await _find_pool_item(shell, view, 800)
	if pool.item_count == 0 or int((pool.get_item_metadata(0) as Dictionary).get("classicId", -1)) != 800:
		Fixture._smoke_fail(shell, "Supply filter did not expose imported scenario item 800")
		return false
	pool.select(0)
	pool.item_selected.emit(0)
	view._add_selected_stock()
	(view.find_child("Quantity", true, false) as SpinBox).value = 9
	(view.find_child("Inflation", true, false) as LineEdit).text = "125"
	var applied: Dictionary = await view.commit_selected()
	if not bool(applied.get("ok", false)): return _fail(shell, applied, "Shop Apply failed")
	return _verify_shop(shell, 0, 800, 9, 125, -1, 77, 11)


static func _exercise_shop_lifecycle(shell: Control) -> bool:
	var controller = shell._workbenches.shop_commands
	var view: ProvidenceShopEditor = shell._workbenches.shop
	await controller.create_record(1)
	(view.find_child("Inflation", true, false) as LineEdit).text = "8"
	var applied: Dictionary = await view.commit_selected()
	if not bool(applied.get("ok", false)): return _fail(shell, applied, "New Shop edit failed")
	await controller.clear_record(1)
	if not _verify_shop(shell, 1, 0, 0, 0, 0, 0, 0): return false
	if not _history(shell, "history.undo"): return false
	if not _verify_shop(shell, 1, 0, 0, 8, 0, 0, 0): return false
	if not _history(shell, "history.redo"): return false
	return _verify_shop(shell, 1, 0, 0, 0, 0, 0, 0)


static func _history(shell: Control, method: String) -> bool:
	var response = shell._bridge.request(method, {"expectedRevision": shell._session_view.revision})
	if not bool(response.get("ok", false)):
		return _fail(shell, response, "%s failed" % method)
	shell._session_view.apply(response.result as Dictionary)
	return true


static func _save_and_reopen(shell: Control, project_path: String) -> bool:
	var saved = shell._bridge.request("project.save")
	if not bool(saved.get("ok", false)): return _fail(shell, saved, "Economy project save failed")
	var revision: int = shell._session_view.revision
	var reopened = shell._bridge.start_project(project_path)
	if not bool(reopened.get("ok", false)): return _fail(shell, reopened, "Economy project reopen failed")
	shell._apply_session(reopened.result as Dictionary)
	if shell._session_view.revision != revision or not bool((reopened.result as Dictionary).get("canUndo", false)):
		Fixture._smoke_fail(shell, "Economy revision or history did not survive reopen")
		return false
	return _verify_treasure(shell, 0, 800, -10, 250, 3, 4) and _verify_shop(shell, 0, 800, 9, 125, -1, 77, 11)


static func _compile_twice(shell: Control, project_path: String) -> Dictionary:
	var outputs := [project_path.path_join("economy-output-1"), project_path.path_join("economy-output-2")]
	var manifests: Array[String] = []
	for output in outputs:
		var response = shell._bridge.request("project.compile-classic-slice", {"directory": output})
		if not bool(response.get("ok", false)):
			_fail(shell, response, "Economy Classic compile failed")
			return {}
		manifests.append(str((response.result as Dictionary).get("manifestSha256", "")))
	if manifests[0].is_empty() or manifests[0] != manifests[1]:
		Fixture._smoke_fail(shell, "Repeated economy compile did not return one deterministic manifest")
		return {}
	for native_path in ["Data NI", "Data TD", "Data SD"]:
		if FileAccess.get_file_as_bytes(outputs[0].path_join(native_path)) != FileAccess.get_file_as_bytes(outputs[1].path_join(native_path)):
			Fixture._smoke_fail(shell, "Repeated economy compile changed %s" % native_path)
			return {}
	if not _verify_compiled_bytes(shell, outputs[0]): return {}
	return {"output": outputs[0], "manifest": manifests[0]}


static func _verify_compiled_bytes(shell: Control, output: String) -> bool:
	var treasure := FileAccess.get_file_as_bytes(output.path_join("Data TD"))
	var shop := FileAccess.get_file_as_bytes(output.path_join("Data SD"))
	if treasure.size() != 96 or _i16(treasure, 0) != 800 or _i16(treasure, 40) != -10 or _i16(treasure, 42) != 250 or _i16(treasure, 44) != 3 or _i16(treasure, 46) != 4:
		Fixture._smoke_fail(shell, "Compiled Data TD did not contain the exact UI-authored first record and cleared second record")
		return false
	for offset in range(48, 96):
		if treasure[offset] != 0:
			Fixture._smoke_fail(shell, "Cleared new Treasure did not compile as canonical zero bytes")
			return false
	if shop.size() != 6004 or _i16(shop, 1600) != 800 or _i16(shop, 1602) != -1 or _i16(shop, 1604) != 77 or shop[2800] != 9 or shop[2802] != 11 or _i16(shop, 3000) != 125:
		Fixture._smoke_fail(shell, "Compiled Data SD lost band insertion, terminator, preserved suffix, quantity, or inflation")
		return false
	for offset in range(3002, 6004):
		if shop[offset] != 0:
			Fixture._smoke_fail(shell, "Cleared new Shop did not compile as canonical zero bytes")
			return false
	return true


static func _reimport_and_verify(shell: Control, project_path: String, output: String) -> bool:
	var created = shell._bridge.create_project("economy-reimport-smoke", project_path)
	if not bool(created.get("ok", false)): return _fail(shell, created, "Economy reimport project creation failed")
	await shell._activate_session(created)
	if not _import_sources(shell, output): return false
	if not _verify_treasure(shell, 0, 800, -10, 250, 3, 4) or not _verify_treasure(shell, 1, 0, 0, 0, 0, 0): return false
	if not _verify_shop(shell, 0, 800, 9, 125, -1, 77, 11) or not _verify_shop(shell, 1, 0, 0, 0, 0, 0, 0): return false
	var recompiled := project_path.path_join("economy-reimport-output")
	var response = shell._bridge.request("project.compile-classic-slice", {"directory": recompiled})
	if not bool(response.get("ok", false)): return _fail(shell, response, "Reimported economy compile failed")
	for native_path in ["Data NI", "Data TD", "Data SD"]:
		if FileAccess.get_file_as_bytes(output.path_join(native_path)) != FileAccess.get_file_as_bytes(recompiled.path_join(native_path)):
			Fixture._smoke_fail(shell, "Reimported economy compile changed %s" % native_path)
			return false
	return true


static func _verify_treasure(shell: Control, native_id: int, item_id: int, experience: int, gold: int, gems: int, jewelry: int) -> bool:
	var response = shell._bridge.request("treasure.open", {"nativeId": native_id})
	if not bool(response.get("ok", false)): return _fail(shell, response, "Treasure verification open failed")
	var record := (response.result as Dictionary).get("treasure", {}) as Dictionary
	if int((record.get("itemIds", []) as Array)[0]) != item_id or int(record.get("experience", 0)) != experience or int(record.get("gold", 0)) != gold or int(record.get("gems", 0)) != gems or int(record.get("jewelry", 0)) != jewelry:
		Fixture._smoke_fail(shell, "Treasure %d did not retain expected authored semantics: %s" % [native_id, str(record)])
		return false
	return true


static func _verify_shop(shell: Control, native_id: int, item_id: int, quantity: int, inflation: int, terminator: int, suffix: int, suffix_quantity: int) -> bool:
	var response = shell._bridge.request("shop.open", {"nativeId": native_id})
	if not bool(response.get("ok", false)): return _fail(shell, response, "Shop verification open failed")
	var record := (response.result as Dictionary).get("shop", {}) as Dictionary
	var items := record.get("itemIds", []) as Array
	var quantities := record.get("quantities", []) as Array
	if int(items[800]) != item_id or int(quantities[800]) != quantity or int(record.get("inflation", 0)) != inflation:
		Fixture._smoke_fail(shell, "Shop %d did not retain expected authored stock semantics" % native_id)
		return false
	if native_id == 0 and (int(items[801]) != terminator or int(items[802]) != suffix or int(quantities[802]) != suffix_quantity):
		Fixture._smoke_fail(shell, "Shop insertion did not preserve its moved terminator and post-terminator bytes")
		return false
	return true


static func _i16(bytes: PackedByteArray, offset: int) -> int:
	var value := (int(bytes[offset]) << 8) | int(bytes[offset + 1])
	return value - 65536 if value >= 32768 else value


static func _fail(shell: Control, response: Dictionary, fallback: String) -> bool:
	Fixture._smoke_fail(shell, str(response.get("error", fallback)))
	return false
