extends SceneTree

class IsolatedBridge extends "res://src/native_bridge.gd":
	var personal_root := ""
	func configured_personal_library_root() -> String: return personal_root
	func configured_application_library_root(_explicit_root: String = "") -> String: return ""
	func configured_reference_catalog_root(_explicit_root: String = "") -> String: return ""
	func configured_monster_library_root(_explicit_root: String = "") -> String: return ""
	func bundled_classic_application_data_root() -> String: return ""

var _bridge: IsolatedBridge
var _operations: ProvidenceEditorOperation
var _views: Dictionary = {}
var _receipts: Array = []
var _work_root := ""
var _project := ""


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if not _check(args.size() == 1, "disposable output root required"): return
	_work_root = args[0]
	DirAccess.make_dir_recursive_absolute(_work_root)
	_project = _work_root.path_join("project")
	_bridge = IsolatedBridge.new(_work_root.path_join("settings.cfg"))
	_bridge.personal_root = _work_root.path_join("personal-library")
	var created: Dictionary = _bridge.create_project("scenario-authoring-check", _project)
	if not _check(created.get("ok", false), "create fresh persistent project: " + str(created)): return
	if not _check(_bridge.request("map.create", {"expectedRevision": 0, "levelType": "land"}).get("ok", false), "create startup land through real command"): return
	_operations = ProvidenceEditorOperation.new()
	root.add_child(_operations)
	for section in ["startup", "restrictions", "contact", "security"]:
		var path := "res://src/scenario_%s_editor.tscn" % section if section != "security" else "res://src/scenario_security_evidence.tscn"
		var view: Control = load(path).instantiate()
		_views[section] = view
		root.add_child(view)
		view.size = Vector2(1400, 780)
		view.configure_operations(_operations, func(): return _bridge)
		await process_frame
		if not _check((await view.refresh_workbench()).get("ok", false), "fresh " + section + " editable projection"): return
	await _startup()
	if not _views.has("startup"): return
	await _contact_and_restrictions()
	if not _views.has("startup"): return
	await _security()
	if not _views.has("startup"): return
	if not _check(_bridge.request("project.save").get("ok", false), "Save acknowledges authored sections"): return
	var expected: Dictionary = _bridge.request("scenario-security.open").result
	_bridge.stop()
	if not _check(_bridge.start_project(_project).get("ok", false), "reopen portable project"): return
	var reopened: Dictionary = _bridge.request("scenario-security.open").result
	if not _check(reopened.segment1 == expected.segment1 and reopened.segment2 == expected.segment2 and reopened.runtimeTitle == "Runtime Marker", "security and independent marker filename persist"): return
	FileAccess.open(_work_root.path_join("receipts.json"), FileAccess.WRITE).store_string(JSON.stringify({"buildIdentity": _bridge.request("build.identity").result, "checks": _receipts}, "  "))
	for view in _views.values(): view.free()
	_bridge.stop()
	print("PROVIDENCE_SCENARIO_AUTHORING_NATIVE_OK startup-contact-restrictions-security-generator-atomic-history-reopen")
	quit()


func _startup() -> void:
	var view: Control = _views.startup
	view.text_field("ScenarioName").text = "Display name"
	view.text_field("MarkerFile").text = "Runtime Marker"
	view.text_field("RecommendedLevel").text = "4"
	view.text_field("MaximumLevel").text = "12"
	view.text_field("StartupX").text = "18"
	view.text_field("StartupY").text = "23"
	view.find_child("ChooseStartupLand", true, false).pressed.emit()
	while _operations.busy: await process_frame
	await process_frame
	view._picker.get_node("%Choices").select(0)
	view._picker._preview(0)
	view._picker.get_node("%UseSelection").pressed.emit()
	view.draft_changed()
	if not await _apply(view, "atomic Startup form"): return
	var revision: int = view.applied_revision()
	if not _check(_bridge.request("history.undo", {"expectedRevision": revision}).get("ok", false), "undo Startup in one history entry"): return
	var undone: Dictionary = _bridge.request("scenario-startup.open").result
	if not _check(undone.startLocation == null and undone.startup.name != "Display name", "undo restores name and location together"): return
	if not _check(_bridge.request("history.redo", {"expectedRevision": int(undone.revision)}).get("ok", false), "redo Startup form"): return
	await view.refresh_workbench()
	view.text_field("StartupX").text = "90"
	view.draft_changed()
	await view.controller.validate()
	if not _check(not view.can_commit() and view.has_unapplied_changes(), "invalid Startup coordinate retains draft and disables Apply"): return
	view.discard_draft()


func _contact_and_restrictions() -> void:
	var contact: Control = _views.contact
	await contact.refresh_workbench()
	contact.text_field("ContactTitle").text = "A scenario title"
	contact.text_field("ContactFee").text = "Noncommercial"
	contact.text_editor("ContactDescription").text = "Préservation authoring."
	contact.draft_changed()
	if not await _apply(contact, "Contact named fields and MacRoman description"): return
	var restrictions: Control = _views.restrictions
	await restrictions.refresh_workbench()
	restrictions.text_field("MaximumPartySize").text = "5"
	restrictions.text_field("MaximumCharacterLevel").text = "18"
	restrictions.text_editor("RestrictionMessage").text = "Choose an eligible party."
	restrictions.draft_changed()
	if not await _apply(restrictions, "Restrictions without imported Data RI"): return
	restrictions.find_child("ClearRestrictions", true, false).pressed.emit()
	if not _check(restrictions.has_unapplied_changes() and restrictions.draft_params().restrictions.maxPartySize == 6, "Clear resets only the local restriction draft"): return
	restrictions.discard_draft()
	if not _check(restrictions.text_field("MaximumPartySize").text == "5", "Discard restores applied restriction policy"): return


func _security() -> void:
	var view: Control = _views.security
	await view.refresh_workbench()
	view.find_child("UnlockEditing", true, false).pressed.emit()
	view.text_field("CodeSegment1").text = "ABCDEFGHIJKLMNOPQRST"
	view.text_field("CodeSegment2").text = "preservation"
	view.draft_changed()
	if not await _apply(view, "Security saves both segments atomically"): return
	view.text_field("RegistrationName").text = "Author"
	view.text_field("SerialNumber").text = "9140886"
	var revision: int = view.applied_revision()
	await view._generate()
	var rows: Control = view.find_child("RegistrationResults", true, false)
	if not _check(rows.get_node("%AlgorithmGrid").get_child_count() == 4, "all four algorithm identities remain separate"): return
	if not _check(int(_bridge.request("scenario-security.open").result.revision) == revision, "Generate is read-only"): return
	view.text_field("SerialNumber").text = "2147483648"
	view.text_field("SerialNumber").text_changed.emit("2147483648")
	if not _check(rows.get_node("%AlgorithmGrid").get_child_count() == 0, "input change removes stale copy controls"): return
	await view._generate()
	if not _check(rows.get_node("%AlgorithmGrid").get_child_count() == 0 and rows.get_node("%GeneratorStatus").text.contains("32-bit"), "overflow serial explains rejection without losing segments"): return
	if not _check(_bridge.request("history.undo", {"expectedRevision": revision}).get("ok", false), "undo Security as one edit"): return
	var undone: Dictionary = _bridge.request("scenario-security.open").result
	if not _check(undone.segment1 == "" and undone.segment2 == "", "undo restores both empty security segments"): return
	if not _check(_bridge.request("history.redo", {"expectedRevision": int(undone.revision)}).get("ok", false), "redo Security as one edit"): return


func _apply(view: Control, label: String) -> bool:
	await view.controller.validate()
	if not _check(view.can_commit(), label + " canonical validation: " + str(view.find_child("DraftStatus", true, false).text)): return false
	var response: Dictionary = await view.controller.apply()
	return _check(response.get("ok", false) and not view.has_unapplied_changes(), label + " acknowledged and refreshed: " + str(response))


func _check(condition: bool, label: String) -> bool:
	_receipts.append({"check": label, "passed": condition})
	if condition: return true
	push_error("SCENARIO_AUTHORING_FAILED " + label)
	_views.clear()
	if _bridge != null: _bridge.stop()
	quit(1)
	return false
