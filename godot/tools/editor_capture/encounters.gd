extends RefCounted

const ComplexEncounterCapture = preload("res://tools/complex_encounter_capture.gd")

static func navigation(editor: Control, tree: SceneTree) -> bool:
	var encounter_route := OS.get_environment("PROVIDENCE_CAPTURE_ENCOUNTER_ROUTE")
	if encounter_route == "encounters.simple":
		await editor._navigation.select_route(encounter_route)
		for _frame in range(4):
			await tree.process_frame
	elif encounter_route == "encounters.complex":
		await ComplexEncounterCapture.prepare(editor, tree)
	elif encounter_route in ["encounters.rogue", "encounters.timed"]:
		await editor._navigation.select_route(encounter_route)
		for _frame in range(4):
			await tree.process_frame
	else:
		push_error("Unknown encounter navigation route: %s" % encounter_route)
		tree.quit(2)
		return false
	return true


static func rogue(editor: Control, tree: SceneTree) -> bool:
	await editor._navigation.select_tab(18)
	var rogue_editor := editor.find_child("Rogue Encounters", true, false)
	if rogue_editor == null:
		push_error("Rogue Encounter capture could not find its route scene.")
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	var rogue_id := OS.get_environment("PROVIDENCE_CAPTURE_RECORD_ID").to_int()
	var rogue_opened: Dictionary = await rogue_editor.call("open_native_id", rogue_id)
	if not bool(rogue_opened.get("ok", false)):
		push_error(str(rogue_opened.get("error", "Rogue Encounter capture could not open its record.")))
		editor.queue_free()
		await tree.process_frame
		tree.quit(2)
		return false
	for _frame in range(3):
		await tree.process_frame
	return true


