extends RefCounted

var bridge: ProvidenceNativeBridge


func resolve(project: ProvidenceNativeBridge, tree: SceneTree) -> Dictionary:
	if project.connection_alive():
		close()
		return {"ok": true, "bridge": project}
	if bridge == null:
		bridge = project.fork_connection()
	if not bridge.connection_alive():
		var candidate := bridge
		var started := candidate.begin_monster_library_start()
		if not started.get("ok", false): return started
		while candidate == bridge:
			var polled := candidate.poll_request()
			if not polled.get("pending", false):
				if not polled.response.get("ok", false): return polled.response
				break
			await tree.process_frame
		if candidate != bridge: return {"ok": false, "connectionChanged": true, "error": "The Library connection changed while opening."}
	return {"ok": true, "bridge": bridge}


func close() -> void:
	if bridge != null: bridge.stop()
	bridge = null
