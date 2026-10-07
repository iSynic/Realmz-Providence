extends SceneTree

var _operations: ProvidenceEditorOperation


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	for section in ["startup", "restrictions", "contact", "security_evidence"]:
		var scene := load("res://src/scenario_%s_editor.tscn" % section) if section != "security_evidence" else load("res://src/scenario_security_evidence.tscn")
		assert(scene != null, section)
		var view: Control = scene.instantiate()
		root.add_child(view)
		view.size = Vector2(1400, 780)
		view.configure_operations(_operations, func(): return null)
		await process_frame
		assert(view.current_selection().is_empty(), section + " fresh state")
		assert(view.find_child("ApplySection", true, false).disabled)
		assert(view.get_combined_minimum_size().x <= 1280, section + " compact minimum width")
		view.set_projection(_projection(section))
		assert(not view.has_unapplied_changes(), section + " clean baseline")
		assert(not view.find_child("ApplySection", true, false).visible or view.find_child("ApplySection", true, false).disabled)
		if section == "restrictions":
			var matrix: GridContainer = view.find_child("RaceChecklist", true, false)
			assert(matrix.get_child_count() == 3 and matrix.get_child(2).button_pressed)
			assert(matrix.get_child(1).text == "Custom Race 20" and matrix.get_child(1).get_meta("identity") == "classic.race.21")
			await _restriction_keyboard(view, matrix)
		elif section == "security_evidence":
			assert(not view.text_field("CodeSegment1").editable)
			view.find_child("UnlockEditing", true, false).pressed.emit()
			assert(view.text_field("CodeSegment1").editable)
			view.text_field("CodeSegment1").text = "new draft"
			view.draft_changed()
			view.find_child("UnlockEditing", true, false).pressed.emit()
			assert(not view.text_field("CodeSegment1").editable and view.has_unapplied_changes())
		else:
			view.editing_nodes()[0].text += " edited"
			view.draft_changed()
		assert(view.has_unapplied_changes(), section + " local draft")
		view.discard_draft()
		assert(not view.has_unapplied_changes(), section + " discard")
		view.clear_selection()
		assert(view.current_selection().is_empty(), section + " teardown")
		for field in view.editing_nodes(): assert(field.text.is_empty() and not field.editable)
		view.free()
	await process_frame
	print("PROVIDENCE_SCENARIO_AUTHORING_FORMS_OK routes=4 clean-dirty-discard-lock-missing-identity-clear")
	quit()


func _projection(section: String) -> Dictionary:
	match section:
		"startup": return {"revision": 0, "startup": {"name": "Bywater", "markerFilename": "City of Bywater", "recommendedPartyLevels": 4, "maximumPartyLevels": 12, "creatorUserCheck": ""}, "startLocation": {"map": "land:0", "coordinate": {"x": 2, "y": 3}}, "startMapResolves": true}
		"contact": return {"revision": 0, "contact": {"title": "Bywater", "description": "A scenario.", "fee": "Noncommercial"}}
		"restrictions": return {"revision": 0, "restrictions": {"maxPartySize": 6, "maxLevel": 0, "description": "", "bannedRaces": ["classic.race.30"], "bannedCastes": []}, "raceCatalog": [{"identity": "classic.race.1", "classicId": 1, "authorId": 0, "name": "Human", "displayName": "Human"}, {"identity":"classic.race.21","classicId":21,"authorId":20,"name":"","displayName":"Custom Race 20"}], "casteCatalog": []}
		_: return {"revision": 0, "segment1": "first", "segment2": "second", "decodingAvailable": true, "runtimeTitle": "Bywater", "recommendedLevel": 4, "maximumLevel": 12}


func _restriction_keyboard(view: Control, matrix: GridContainer) -> void:
	var check: CheckBox = matrix.get_child(0)
	assert(check.get_theme_icon("unchecked") == load("res://theme/policy_unchecked.svg"))
	assert(check.get_theme_icon("checked_disabled") == load("res://theme/policy_checked.svg"))
	check.grab_focus()
	await _key(KEY_SPACE)
	assert(check.button_pressed and view.draft_params().restrictions.bannedRaces.has("classic.race.1"))
	await _key(KEY_SPACE)
	assert(not check.button_pressed and not view.draft_params().restrictions.bannedRaces.has("classic.race.1"))
	matrix.set_enabled(false)
	await _key(KEY_SPACE)
	assert(not check.button_pressed)
	matrix.set_enabled(true)
	check.grab_focus()
	await _key(KEY_SPACE)
	assert(check.button_pressed)


func _key(code: Key) -> void:
	for down in [true, false]:
		var event := InputEventKey.new()
		event.keycode = code; event.pressed = down
		root.push_input(event)
		await process_frame
