extends SceneTree


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1: quit(1); return
	var bridge := ProvidenceNativeBridge.new(args[0].path_join("settings.cfg"))
	var project := args[0].path_join("project")
	var prepared := bridge._prepare_project_start(project, "", "", "")
	print(JSON.stringify({"prepared": prepared, "adapter": bridge._adapter_path()}))
	var response := bridge.start_project(project)
	print(JSON.stringify(response))
	if response.get("ok", false): print(JSON.stringify(bridge.request("monster-library.describe")))
	bridge.stop()
	quit(0 if response.get("ok", false) else 1)
