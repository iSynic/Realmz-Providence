extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 2 and args[0].get_file().begins_with("providence-publish-corpus-"))
	var project := args[0].path_join("project")
	var library := args[0].path_join("application-library")
	var bridge := ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	var created := bridge.create_project("publish-native-review", project)
	assert(created.get("ok", false), str(created.get("error", "Project creation failed")))
	var imported_library := bridge.request("application-media.import-classic-library", {
		"sourceDirectory": bridge.bundled_classic_application_data_root(), "libraryRoot": library})
	assert(imported_library.get("ok", false), str(imported_library.get("error", "Application library import failed")))
	var imported := bridge.import_classic_scenario(args[1], 0, bridge.bundled_classic_application_data_root())
	assert(imported.get("ok", false), str(imported.get("error", "Classic import failed")))
	var saved := bridge.request("project.save")
	assert(saved.get("ok", false), str(saved.get("error", "Project save failed")))
	var marker := FileAccess.open(project.path_join("publish-review-disposable.marker"), FileAccess.WRITE)
	assert(marker != null)
	marker.store_string("Disposable fresh Classic import for bounded Publish review.\n")
	marker.close()
	bridge.stop()
	print("PROVIDENCE_PUBLISH_FIXTURE_OK project=ready library=local")
	quit(0)
