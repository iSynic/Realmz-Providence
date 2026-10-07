extends SceneTree

var _bridge: ProvidenceNativeBridge
var _operations: ProvidenceEditorOperation
var _view: Control


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1, "one disposable imported project required"): return
	_bridge = ProvidenceNativeBridge.new(args[0].path_join("security-check.cfg"))
	var opened: Dictionary = _bridge.start_project(args[0])
	if not _check(opened.get("ok", false), "open retained import: " + str(opened)): return
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	_view = load("res://src/scenario_security_evidence.tscn").instantiate()
	root.add_child(_view)
	_view.size = Vector2(1400, 780)
	_view.configure_operations(_operations, func(): return _bridge)
	await process_frame
	if not _check((await _view.refresh_workbench()).get("ok", false), "read imported Security"): return
	if not _check(_view.text_field("CodeSegment1").text == "Avast Matey!", "first C string ignores trailing residue"): return
	if not _check(_view.text_field("CodeSegment2").text == "Holy 28 Toes Batman", "second segment decoded"): return
	if not _check(not _view.has_unapplied_changes(), "viewing leaves Security unchanged"): return
	_view.text_field("RegistrationName").text = "Author"
	_view.text_field("SerialNumber").text = "9140886"
	_view.text_field("SerialNumber").text_changed.emit("9140886")
	if not _check(not _view.find_child("GenerateCodes", true, false).disabled, "Generate enabled without replacement or Apply"): return
	var revision: int = _view.applied_revision()
	await _view._generate()
	var rows: Control = _view.find_child("RegistrationResults", true, false)
	if not _check(rows.get_node("%AlgorithmGrid").get_child_count() == 4, "all four computed identities shown"): return
	if not _check(int(_bridge.request("scenario-security.open").result.revision) == revision, "generation leaves revision unchanged"): return
	_view.free()
	_bridge.stop()
	print("IMPORTED_SECURITY_OK decoded-controls-generate-read-only")
	quit()


func _check(condition: bool, label: String) -> bool:
	if condition: return true
	push_error("IMPORTED_SECURITY_FAILED " + label)
	if _bridge != null: _bridge.stop()
	quit(1)
	return false
