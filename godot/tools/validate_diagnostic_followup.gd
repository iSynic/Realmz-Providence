extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var dialog := load("res://src/scenario_import_dialog.tscn").instantiate() as ProvidenceScenarioImportDialog
	root.add_child(dialog)
	for fork_name in ["Scenario.rsrc", "Scenario.rsf", "._Scenario", ".rsrc/Scenario"]:
		var directory := "user://diagnostic-followup-" + str(Time.get_ticks_usec())
		DirAccess.make_dir_recursive_absolute(directory.path_join(".rsrc"))
		FileAccess.open(directory.path_join("Data NI"), FileAccess.WRITE).store_buffer(PackedByteArray([0]))
		FileAccess.open(directory.path_join(fork_name), FileAccess.WRITE).store_buffer(PackedByteArray([0]))
		dialog.set_source_directories(directory, "reference")
		assert(dialog._import_mode == ProvidenceScenarioImportDialog.ImportMode.CLASSIC_SCENARIO)
		assert(dialog.get_ok_button().disabled)
		assert(not dialog._inspect_button.disabled)
		DirAccess.remove_absolute(directory.path_join(fork_name))
		DirAccess.remove_absolute(directory.path_join("Data NI"))
		DirAccess.remove_absolute(directory.path_join(".rsrc"))
		DirAccess.remove_absolute(directory)
	dialog.queue_free()
	var spells := load("res://src/spell_editor.tscn").instantiate() as ProvidenceSpellEditor
	root.add_child(spells)
	assert(spells.catalog_query().showUnused == false)
	var toggle := spells.get_node("%ShowUnusedSpells") as CheckButton
	toggle.button_pressed = true
	assert(spells.catalog_query().showUnused == true and spells.catalog_query().offset == 0)
	spells.set_locked(true)
	assert(toggle.disabled)
	spells.set_locked(false)
	assert(not toggle.disabled)
	spells.queue_free()
	await process_frame
	print("PROVIDENCE_DIAGNOSTIC_FOLLOWUP_UI_OK resource-fork-variants unused-filter locking")
	quit()
