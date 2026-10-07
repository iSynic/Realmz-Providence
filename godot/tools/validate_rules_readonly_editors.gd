extends SceneTree

# Historical entry point now checks the complete named authoring scenes.
func _initialize() -> void: _run.call_deferred()

func _run() -> void:
	var inventory: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://../docs/ui/race-caste-authoring-inventory.json"))
	if inventory.is_empty(): push_error("The frozen control inventory is unavailable"); quit(1); return
	for spec in inventory.routes:
		var kind := "race" if spec.route == "rules.races" else "caste"
		var view: ProvidenceRuleAuthoringEditor = load("res://src/" + kind + "_editor.tscn").instantiate()
		root.add_child(view); await process_frame
		assert(view.route_identity() == spec.route)
		var fields: Dictionary = {}
		for control in view.form._controls:
			var path: Array = control.get_meta("field_path")
			if path[0] == "definition": fields[path[1]] = true
		for field in spec.canonicalFields:
			var key: String = str(field.name).to_camel_case()
			if key in ["id", "classicId", "defaultIcon", "defaultIconSet", "startingItemIds"]: continue
			assert(fields.has(key), "Missing authoring control: " + key)
		assert(view.form.find_children("Eligible*", "CheckBox", true, false).size() == 30)
		if kind == "caste":
			assert(view.form.find_children("ChooseItem*", "Button", true, false).size() == 20)
			assert(view.form.control_for(["nativeFields", "maximumSpellsPerRound"]) != null)
		assert(view.get_node("%ApplyRule").disabled and not view.can_apply_draft())
		view.queue_free(); await process_frame
	print("PROVIDENCE_RULES_AUTHORING_SCENES_OK routes=2 denominator=frozen fixedSlots=20 reciprocalChoices=30")
	quit()
