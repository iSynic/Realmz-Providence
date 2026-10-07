extends ProvidenceScenarioSectionEditor

var _unlocked := false
var _replacement_reviewed := false
var _repair_preview: Dictionary = {}
var _confirmation_context: Dictionary = {}
var _confirmation_kind := ""
var _generating := false
var _result_generation := 0
var _startup_source: Dictionary = {}
var _source_picker: Window


func _ready() -> void:
	_source_picker = $StartupSourcePicker
	find_child("ChooseOriginalSource", true, false).pressed.connect(func(): _source_picker.begin(self, find_child("ChooseOriginalSource", true, false)))
	find_child("UnlockEditing", true, false).pressed.connect(_change_lock)
	find_child("GenerateCodes", true, false).pressed.connect(_generate)
	for name in ["RegistrationName", "SerialNumber"]:
		text_field(name).text_changed.connect(func(_text: String): _invalidate_results())
	find_child("SecurityReview", true, false).confirmed.connect(_confirm_review)
	visibility_changed.connect(func(): if not is_visible_in_tree(): _invalidate_results(); _source_picker.cancel())
	super._ready()


func editing_nodes() -> Array:
	return [text_field("CodeSegment1"), text_field("CodeSegment2")]


func extra_draft_token() -> Dictionary:
	return {"repair": _repair_preview.duplicate(true), "startupSource": _startup_source.duplicate(true)}


func draft_params() -> Dictionary:
	if applied.get("sourceSelectionRequired", false) and _startup_source.is_empty(): return {"localError": "Choose the original startup file before editing Security."}
	if not applied.get("decodingAvailable", false) and not _replacement_reviewed:
		return {"localError": "Review explicit replacement of the preserved code segments first."}
	if applied.get("backupNeedsRepair", false) and _repair_preview.is_empty():
		return {"localError": "Review the incomplete backup allocation before Apply."}
	var params := {"segment1": text_field("CodeSegment1").text, "segment2": text_field("CodeSegment2").text}
	if not _repair_preview.is_empty(): params["repairPreview"] = _repair_preview.duplicate(true)
	if not _startup_source.is_empty(): params["startupSource"] = _startup_source.duplicate(true)
	return params


func render_projection(result: Dictionary) -> void:
	_startup_source.clear()
	_source_picker.cancel()
	_unlocked = false
	_replacement_reviewed = bool(result.get("decodingAvailable", false))
	_repair_preview.clear()
	for index in [1, 2]: text_field("CodeSegment%d" % index).text = str(result.get("segment%d" % index, ""))
	find_child("SecurityReason", true, false).text = str(result.get("reason", "") if result.get("reason") != null else "Saved segments · unlock to edit both as one draft.")
	var slot: Variant = result.get("scenarioSlot")
	find_child("GeneratorContext", true, false).text = "Runtime title: %s · %s · levels %s / %s" % [str(result.get("runtimeTitle", "")), "custom" if slot == null else "slot %s" % slot, result.get("recommendedLevel", 0), result.get("maximumLevel", 0)]
	find_child("SourceEvidence", true, false).text = "Backup: %s\nOriginal imported bytes are retained. Applying segments changes startup bytes 20–59; registration generation never saves player identity." % str(result.get("backupSource", "not present"))
	_invalidate_results()
	_update_counts()


func clear_extra_state() -> void:
	_startup_source.clear()
	_source_picker.cancel()
	_unlocked = false
	_replacement_reviewed = false
	_repair_preview.clear()
	_confirmation_context.clear()
	_result_generation += 1
	_generating = false
	for name in ["RegistrationName", "SerialNumber"]: text_field(name).text = ""
	for name in ["GeneratorContext", "SecurityReason", "SourceEvidence"]: find_child(name, true, false).text = ""
	find_child("SecurityReview", true, false).hide()
	_invalidate_results()
	_update_counts()


func set_extra_interaction(enabled: bool) -> void:
	for field in editing_nodes(): field.editable = enabled and _unlocked
	for name in ["RegistrationName", "SerialNumber"]: text_field(name).editable = enabled
	find_child("UnlockEditing", true, false).disabled = not enabled
	find_child("ChooseOriginalSource", true, false).visible = applied.get("sourceSelectionRequired", false)
	find_child("ChooseOriginalSource", true, false).disabled = not enabled
	if applied.get("sourceSelectionRequired", false) and _startup_source.is_empty(): find_child("UnlockEditing", true, false).disabled = true
	find_child("UnlockEditing", true, false).text = "Lock Fields" if _unlocked else "Repair backup…" if applied.get("backupNeedsRepair", false) and _repair_preview.is_empty() else "Enter replacements…" if not _replacement_reviewed else "Unlock Editing"
	_refresh_generate(enabled)


func draft_changed() -> void:
	_invalidate_results()
	_update_counts()
	super.draft_changed()


func _update_counts() -> void:
	for index in [1, 2]:
		var value := text_field("CodeSegment%d" % index).text
		find_child("Segment%dCount" % index, true, false).text = "%d / 20 ASCII bytes" % value.to_utf8_buffer().size()


func _change_lock() -> void:
	if not can_edit(): return
	if _unlocked:
		_unlocked = false
		set_extra_interaction(true)
		return
	_confirmation_context = {"revision": applied_revision(), "token": draft_token()}
	if applied.get("backupNeedsRepair", false) and _repair_preview.is_empty():
		var response := await controller.query("scenario-security.repair-preview", {"expectedRevision": applied_revision()})
		if not _review_is_current(): return
		if not response.get("ok", false): status(str(response.get("error", "Backup preview unavailable."))); return
		_confirmation_context["receipt"] = response.result
		_confirmation_kind = "repair"
		_review("Repair security backup", "Data CS: %d → %d bytes.\n%s\nApply will also replace startup bytes 20–59. No change is made until Apply." % [response.result.beforeBytes, response.result.afterBytes, response.result.description])
	elif not _replacement_reviewed:
		_confirmation_kind = "replacement"
		_review("Replace preserved security segments", "The stored segments could not be decoded reliably. Enter both replacements explicitly.\nApply replaces startup bytes 20–59. Existing backup bytes remain unchanged; an absent backup is created as a 316-byte zero record. The original source remains retained.")
	else:
		_unlocked = true
		set_extra_interaction(true)
		text_field("CodeSegment1").grab_focus()


func _review(title: String, message: String) -> void:
	var dialog := find_child("SecurityReview", true, false) as ConfirmationDialog
	dialog.title = title
	dialog.dialog_text = message
	dialog.popup_centered(Vector2i(700, 260))


func _review_is_current() -> bool:
	return can_edit() and _confirmation_context.get("revision") == applied_revision() and _confirmation_context.get("token") == draft_token()


func _confirm_review() -> void:
	if not _review_is_current(): return
	if _confirmation_kind == "repair": _repair_preview = _confirmation_context.receipt.duplicate(true)
	_replacement_reviewed = true
	_unlocked = true
	set_extra_interaction(true)
	text_field("CodeSegment1").grab_focus()
	draft_changed()


func _generator_token() -> Dictionary:
	return {"draft": draft_token(), "name": text_field("RegistrationName").text, "serial": text_field("SerialNumber").text, "revision": applied_revision()}


func _invalidate_results() -> void:
	_result_generation += 1
	find_child("RegistrationResults", true, false).clear_results("Inputs changed. Generate codes to calculate and copy the current candidates.")
	_refresh_generate(can_edit())


func _refresh_generate(enabled: bool) -> void:
	find_child("GenerateCodes", true, false).disabled = not enabled or _generating or not _replacement_reviewed or text_field("RegistrationName").text.is_empty() or text_field("SerialNumber").text.is_empty()


func _generate() -> void:
	if not can_edit() or _generating or not _replacement_reviewed: return
	var token := _generator_token()
	var generation := _result_generation
	_generating = true
	_refresh_generate(true)
	var response := await controller.query("scenario-registration.generate", {"expectedRevision": applied_revision(), "segment1": text_field("CodeSegment1").text, "segment2": text_field("CodeSegment2").text, "registrationName": text_field("RegistrationName").text, "serialNumber": text_field("SerialNumber").text})
	_generating = false
	_refresh_generate(can_edit())
	if generation != _result_generation or token != _generator_token(): return
	if response.get("ok", false): find_child("RegistrationResults", true, false).set_results(response.result.variants)
	else: find_child("RegistrationResults", true, false).clear_results(str(response.get("error", "Generation unavailable.")))


func restore_extra_draft(token: Dictionary) -> void:
	_startup_source = token.get("startupSource", {}).duplicate(true)
	_repair_preview = token.get("repair", {}).duplicate(true)
	_unlocked = true
	_replacement_reviewed = true
	_update_counts()
	set_extra_interaction(can_edit())


func accept_original_source(source: Dictionary, preview: Dictionary) -> void:
	if not can_edit() or source == _startup_source: return
	var preserve_codes := not _startup_source.is_empty()
	_startup_source = source.duplicate(true)
	_replacement_reviewed = preview.get("decodingAvailable", false)
	if not preserve_codes:
		for index in [1, 2]: text_field("CodeSegment%d" % index).text = str(preview.get("segment%d" % index, ""))
	find_child("SecurityReason", true, false).text = "Original file: %s · %s" % [source.nativePath, preview.get("reason") if preview.get("reason") != null else "Segments decoded; unlock to edit."]
	if preserve_codes: find_child("SecurityReason", true, false).text += " Existing draft codes kept."
	draft_changed(); set_extra_interaction(true)
