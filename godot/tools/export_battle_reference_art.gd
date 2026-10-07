extends SceneTree


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 2: quit(1); return
	var bridge := ProvidenceNativeBridge.new()
	var opened := bridge.start_project(args[0])
	if not opened.get("ok", false): push_error(str(opened)); quit(1); return
	DirAccess.make_dir_recursive_absolute(args[1])
	var rows: Array = []
	for icon in [395, 486, 487, 488, 489]:
		var response := bridge.request("monster-appearance.open", {"iconId": icon})
		if not response.get("ok", false): push_error(str(response)); bridge.stop(); quit(1); return
		for role in ["base", "facing"]:
			var resource: Dictionary = response.result.get(role, {})
			var bytes := Marshalls.base64_to_raw(str(resource.get("base64", "")))
			if not resource.get("payloadAvailable", false) or resource.get("mimeType") != "image/png" or bytes.size() != int(resource.get("bytes", -1)):
				push_error("Unavailable exact appearance: %d %s" % [icon, role]); bridge.stop(); quit(1); return
			var id: int = icon if role == "base" else icon + int(response.result.pairOffset)
			var output := args[1].path_join("cicn-%d.png" % id)
			var file := FileAccess.open(output, FileAccess.WRITE)
			file.store_buffer(bytes)
			file.close()
			var identity := resource.duplicate(true)
			identity.erase("base64")
			rows.append({"iconId": icon, "role": role, "path": output, "projection": identity})
	var receipt := FileAccess.open(args[1].path_join("manifest.json"), FileAccess.WRITE)
	receipt.store_string(JSON.stringify({"scope": "Exact existing adapter PNG projections; no authored commands or image alterations.",
		"projectPath": args[0], "adapter": bridge.request("build.identity").get("result", {}), "resources": rows}, "\t"))
	bridge.stop()
	print("PROVIDENCE_BATTLE_REFERENCE_ART_OK resources=%d" % rows.size())
	quit(0)
