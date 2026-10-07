extends RefCounted


static func run(host) -> bool:
	var directory: String = host.project.get_base_dir()
	var bridge := ProvidenceNativeBridge.new(directory.path_join("roundtrip-settings.cfg"))
	var project := directory.path_join("roundtrip-project")
	var created := preload("res://src/native_project_creation.gd").create(OS.get_environment("PROVIDENCE_CLI_PATH"), "encounter-roundtrip", project, "")
	if not created.get("ok", false): return _fail(host, bridge, str(created.get("error")))
	var opened := bridge.start_project(project)
	if not opened.get("ok", false): return _fail(host, bridge, str(opened.get("error")))
	for entry in [["map.create", {"levelType": "land"}], ["extra-action-point.create", {}], ["message.create", {"nativeId": 0, "text": ""}], ["message.create", {"nativeId": 1, "text": "A hidden mechanism."}], ["encounter.create-simple", {}], ["encounter.create-complex", {}], ["encounter.create-rogue", {}], ["encounter.create-timed", {}]]:
		var response := _write(bridge, entry[0], entry[1])
		if not response.get("ok", false): return _fail(host, bridge, str(response.get("error")))
	var rogue: Dictionary = bridge.request("encounter.open-rogue", {"identity": "rogue-encounter:0"}).result.encounter
	rogue.modifiers[2] = -20; rogue.lowDamage = 4; rogue.highDamage = 12; rogue.typeFlags[9] = true; rogue.successText[1] = -1
	var response := _write(bridge, "encounter.apply-rogue-draft", {"draft": rogue})
	if not response.get("ok", false): return _fail(host, bridge, str(response.get("error")))
	var timed: Dictionary = bridge.request("encounter.open-timed", {"identity": "timed-encounter:0"}).result.encounter
	timed.day = 3; timed.increment = 2; timed.percent = 35
	response = _write(bridge, "encounter.apply-timed-draft", {"draft": timed})
	if not response.get("ok", false): return _fail(host, bridge, str(response.get("error")))
	var first: String = directory.path_join("encounter-compile-first")
	var second: String = directory.path_join("encounter-compile-second")
	response = bridge.request("project.compile-classic-slice", {"directory": first})
	if not response.get("ok", false): return _fail(host, bridge, str(response.get("error")) + " " + JSON.stringify(bridge.request("validation.list", {"limit": 32})))
	response = _write(bridge, "project.import-classic-land-slice", {"directory": first})
	if not response.get("ok", false): return _fail(host, bridge, str(response.get("error")))
	for kind in ["rogue", "timed"]:
		response = _write(bridge, "project.import-classic-" + kind + "-encounters", {"directory": first})
		if not response.get("ok", false): return _fail(host, bridge, str(response.get("error")))
	for entry in [["rogue", rogue], ["timed", timed]]:
		var reopened: Dictionary = bridge.request("encounter.open-" + entry[0], {"identity": entry[1].identity})
		var expected: Dictionary = entry[1].duplicate(true)
		var actual: Dictionary = reopened.result.encounter.duplicate(true)
		expected.erase("authored"); actual.erase("authored")
		if not preload("res://src/document_value_equality.gd").equal(expected, actual): return _fail(host, bridge, "Compiled reimport changed " + entry[0] + " semantics.")
	response = bridge.request("project.compile-classic-slice", {"directory": second})
	if not response.get("ok", false): return _fail(host, bridge, str(response.get("error")))
	for filename in ["Data TD2", "Data TD3"]:
		if FileAccess.get_file_as_bytes(first.path_join(filename)) != FileAccess.get_file_as_bytes(second.path_join(filename)): return _fail(host, bridge, "Reimport changed deterministic " + filename + " bytes.")
	bridge.stop()
	host.checks.append("Fresh authored fixture compiles and reimports Rogue/Timed semantics, then recompiles byte-identical Data TD2/TD3; full imported corpus certification remains blocked by its existing unresolved references")
	return true


static func _write(bridge: ProvidenceNativeBridge, method: String, params: Dictionary) -> Dictionary:
	var current := bridge.request("session.describe", {})
	params["expectedRevision"] = int(current.result.revision)
	return bridge.request(method, params)


static func _fail(host, bridge: ProvidenceNativeBridge, message: String) -> bool:
	bridge.stop()
	return host._fail(message)
