extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and args[0].get_file().begins_with("providence-maintenance-corpus-"))
	var project := args[0].path_join("project")
	var bridge := ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	var created := bridge.create_project("maintenance-corpus", project)
	assert(created.get("ok", false), str(created.get("error", "Project creation failed")))
	var imported := bridge.import_classic_scenario(args[1], 0, bridge.bundled_classic_application_data_root())
	assert(imported.get("ok", false), str(imported.get("error", "Classic import failed")))
	var described := bridge.request("session.describe")
	assert(described.get("ok", false))
	var marker := FileAccess.open(project.path_join("assets-corpus-disposable.marker"), FileAccess.WRITE)
	assert(marker != null)
	marker.store_string("Disposable fresh Classic import for the bounded maintenance corpus checks.\n")
	marker.close()
	bridge.stop()
	print("PROVIDENCE_MAINTENANCE_FIXTURE_OK ", JSON.stringify(described.result.counts))
	quit()
