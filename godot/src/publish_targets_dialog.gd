class_name ProvidencePublishTargetsDialog
extends ConfirmationDialog

signal readiness_requested(application_library_root: String)
signal publish_requested(classic_directory: String, rebuilt_path: String, application_library_root: String, expected_revision: int)

var _classic_output: LineEdit
var _rebuilt_output: LineEdit
var _application_library: LineEdit
var _classic_status: RichTextLabel
var _rebuilt_status: RichTextLabel
var _compiler_identity: Label
var _validation: Label
var _check_button: Button
var _classic_picker: FileDialog
var _rebuilt_picker: FileDialog
var _library_picker: FileDialog
var _classic_leaf := "scenario-classic"
var _classic_ready := false
var _rebuilt_ready := false
var _checked_revision := -1
var _input_generation := 0
var _busy := false


func _ready() -> void:
	name = "PublishTargetsDialog"
	title = "Validate and Publish — Legacy Realmz + Rebuilt"
	ok_button_text = "Publish Both Targets"
	cancel_button_text = "Cancel"
	dialog_hide_on_ok = false
	wrap_controls = false
	min_size = Vector2i(860, 680)
	_build_content()
	confirmed.connect(_submit)
	custom_action.connect(_on_custom_action)
	_update_controls()


func popup_publish(scenario_name: String, project_path: String, application_library_root: String) -> void:
	var safe_name := scenario_name.strip_edges()
	if safe_name.is_empty():
		safe_name = "scenario"
	_classic_leaf = safe_name + "-classic"
	var parent := project_path.get_base_dir()
	_classic_output.text = parent.path_join(_classic_leaf)
	_rebuilt_output.text = parent.path_join(safe_name + ".realmz2")
	_application_library.text = application_library_root
	_reset_readiness("Check both targets before publishing. Existing destinations are never overwritten.")
	popup_centered(Vector2i(860, 680))
	_check_button.call_deferred("grab_focus")


func set_publish_inputs(classic_directory: String, rebuilt_path: String, application_library_root: String) -> void:
	_classic_output.text = classic_directory
	_rebuilt_output.text = rebuilt_path
	_application_library.text = application_library_root
	_reset_readiness("Check both targets before publishing.")


func request_readiness() -> void:
	if _busy: return
	_set_busy("Checking Classic and Rebuilt compatibility…")
	readiness_requested.emit(_application_library.text.strip_edges())


func input_generation() -> int:
	return _input_generation


func is_busy() -> bool:
	return _busy


func submit_publish() -> bool:
	if not is_ready_to_publish() or get_ok_button().disabled:
		return false
	_submit()
	return true


func status_text() -> String:
	return _validation.text


func is_ready_to_publish() -> bool:
	return _classic_ready and _rebuilt_ready and _paths_are_valid()


func apply_readiness(classic: Dictionary, rebuilt: Dictionary, compiler: Dictionary, package_preview: Dictionary) -> void:
	_busy = false
	_classic_ready = ProvidencePublishReadiness.is_ready(classic)
	_rebuilt_ready = ProvidencePublishReadiness.is_ready(rebuilt) and not package_preview.is_empty()
	_checked_revision = int(classic.get("revision", -1))
	if int(rebuilt.get("revision", -2)) != _checked_revision:
		_rebuilt_ready = false
	_classic_status.text = _format_readiness("CLASSIC", classic)
	_rebuilt_status.text = _format_readiness("REBUILT", rebuilt)
	if not package_preview.is_empty():
		_rebuilt_status.text += "\nPreview · %d files · %s bytes · package %s" % [
			int(package_preview.get("fileCount", 0)) + 1,
			_format_count(_sum_document_bytes(package_preview)),
			_short_hash(str(package_preview.get("packageHash", ""))),
		]
	_compiler_identity.text = "Compiler · %s · %s" % [
		str(compiler.get("version", "unknown")),
		_short_hash(str(compiler.get("commit", "unavailable"))),
	]
	_check_button.disabled = false
	_update_controls()
	if _classic_ready and _rebuilt_ready:
		_validation.text = "Ready · both target compilers accepted revision %d · outputs publish independently without overwrite" % _checked_revision
		_validation.add_theme_color_override("font_color", Color("7dcaa2"))
	else:
		_validation.text = "Publishing remains blocked. Open Problems or repair the grouped compatibility failures, then check again."
		_validation.add_theme_color_override("font_color", Color("e58b7b"))


func apply_error(message: String) -> void:
	_busy = false
	_classic_ready = false
	_rebuilt_ready = false
	_checked_revision = -1
	_check_button.disabled = false
	_validation.text = message
	_validation.add_theme_color_override("font_color", Color("e58b7b"))
	_update_controls()


func apply_publish_started() -> void:
	_set_busy("Publishing both deterministic targets…")


func apply_published(classic: Dictionary, rebuilt: Dictionary) -> void:
	_busy = false
	_classic_status.text = "[color=#7dcaa2]PUBLISHED[/color] · %d files · manifest %s\n%s" % [
		(classic.get("files", []) as Array).size(),
		_short_hash(str(classic.get("manifestSha256", ""))),
		str(classic.get("directory", "")),
	]
	_rebuilt_status.text = "[color=#7dcaa2]PUBLISHED[/color] · %d files · %s bytes · package %s\n%s" % [
		int(rebuilt.get("fileCount", 0)),
		_format_count(int(rebuilt.get("bytes", 0))),
		_short_hash(str(rebuilt.get("packageHash", ""))),
		str(rebuilt.get("path", "")),
	]
	_validation.text = "Published both targets. Destinations remain immutable; choose new paths for another build."
	_validation.add_theme_color_override("font_color", Color("7dcaa2"))
	get_ok_button().disabled = true
	_check_button.disabled = true


func _build_content() -> void:
	var body := preload("res://src/publish_targets_content.tscn").instantiate()
	add_child(body)
	_application_library = body.get_node("ApplicationLibrary/Path/ApplicationLibraryRoot")
	_classic_output = body.get_node("ClassicOutput/Path/ClassicOutputDirectory")
	_rebuilt_output = body.get_node("RebuiltOutput/Path/RebuiltPackagePath")
	for field in [_application_library, _classic_output, _rebuilt_output]:
		field.text_changed.connect(_on_input_changed)
	body.get_node("ApplicationLibrary/Path/Browse").pressed.connect(_browse_library)
	body.get_node("ClassicOutput/Path/Browse").pressed.connect(_browse_classic_parent)
	body.get_node("RebuiltOutput/Path/Browse").pressed.connect(_browse_rebuilt)
	_classic_status = body.get_node("TargetReadinessRow/Classic/Status")
	_rebuilt_status = body.get_node("TargetReadinessRow/Rebuilt/Status")
	_compiler_identity = body.get_node("CompilerIdentity")
	_validation = body.get_node("PublishValidation")
	_check_button = add_button("Check Readiness", true, "check")
	_build_native_pickers()


func _build_native_pickers() -> void:
	_classic_picker = _directory_picker("ClassicOutputParentPicker", _select_classic_parent)
	_library_picker = _directory_picker("ApplicationLibraryPicker", _select_library)
	_rebuilt_picker = FileDialog.new()
	_rebuilt_picker.name = "RebuiltPackagePicker"
	_rebuilt_picker.file_mode = FileDialog.FILE_MODE_SAVE_FILE
	_rebuilt_picker.access = FileDialog.ACCESS_FILESYSTEM
	_rebuilt_picker.use_native_dialog = true
	_rebuilt_picker.filters = PackedStringArray(["*.realmz2 ; Realmz 2 scenario package"])
	_rebuilt_picker.file_selected.connect(_select_rebuilt)
	add_child(_rebuilt_picker)


func _directory_picker(node_name: String, action: Callable) -> FileDialog:
	var picker := FileDialog.new()
	picker.name = node_name
	picker.file_mode = FileDialog.FILE_MODE_OPEN_DIR
	picker.access = FileDialog.ACCESS_FILESYSTEM
	picker.use_native_dialog = true
	picker.dir_selected.connect(action)
	add_child(picker)
	return picker


func _on_custom_action(action: StringName) -> void:
	if action == &"check":
		request_readiness()


func _submit() -> void:
	if not is_ready_to_publish() or get_ok_button().disabled:
		return
	publish_requested.emit(
		_classic_output.text.strip_edges(),
		_rebuilt_output.text.strip_edges(),
		_application_library.text.strip_edges(),
		_checked_revision
	)


func _set_busy(message: String) -> void:
	_busy = true
	get_ok_button().disabled = true
	_check_button.disabled = true
	_validation.text = message
	_validation.add_theme_color_override("font_color", Color("e5b567"))


func _reset_readiness(message: String) -> void:
	_input_generation += 1
	_classic_ready = false
	_rebuilt_ready = false
	_checked_revision = -1
	if _classic_status != null:
		_classic_status.text = "CLASSIC · NOT CHECKED"
		_rebuilt_status.text = "REBUILT · NOT CHECKED"
		_compiler_identity.text = "Compiler · not inspected"
		_check_button.disabled = _busy
		_validation.text = message
		_validation.add_theme_color_override("font_color", Color("e5b567"))
	_update_controls()


func _update_controls() -> void:
	if get_ok_button() == null:
		return
	get_ok_button().disabled = _busy or not is_ready_to_publish()


func _on_input_changed(_text: String) -> void:
	_reset_readiness("Paths changed · check both targets again.")


func _paths_are_valid() -> bool:
	var classic := _classic_output.text.strip_edges()
	var rebuilt := _rebuilt_output.text.strip_edges()
	if classic.is_empty() or rebuilt.is_empty() or not rebuilt.to_lower().ends_with(".realmz2"):
		return false
	if DirAccess.dir_exists_absolute(classic) or FileAccess.file_exists(classic):
		return false
	if DirAccess.dir_exists_absolute(rebuilt) or FileAccess.file_exists(rebuilt):
		return false
	return DirAccess.dir_exists_absolute(classic.get_base_dir()) and DirAccess.dir_exists_absolute(rebuilt.get_base_dir())


func _format_readiness(label: String, readiness: Dictionary) -> String:
	var ready := ProvidencePublishReadiness.is_ready(readiness)
	var warning := ProvidencePublishReadiness.has_warnings(readiness)
	var color := "#e5b567" if ready and warning else ("#7dcaa2" if ready else "#e58b7b")
	var status := ("READY WITH WARNINGS" if warning else "READY") if ready else "BLOCKED"
	var groups := readiness.get("groups", []) as Array
	var details: Array[String] = []
	for value: Variant in groups.slice(0, 3):
		if value is Dictionary:
			var group := value as Dictionary
			details.append("%s × %d" % [str(group.get("code", "unknown")), int(group.get("count", 0))])
	return "[color=%s]%s · %s[/color]\n%d blocker%s%s" % [
		color,
		label,
		status,
		int(readiness.get("blockerCount", 0)),
		"" if int(readiness.get("blockerCount", 0)) == 1 else "s",
		("\n" + "\n".join(details) if not details.is_empty() else "") + "\n" + ProvidencePublishReadiness.warning_text(readiness),
	]


func _sum_document_bytes(preview: Dictionary) -> int:
	var total := int(preview.get("manifestBytes", 0))
	var documents := preview.get("documentBytes", {}) as Dictionary
	for value: Variant in documents.values():
		total += int(value)
	return total


func _short_hash(value: String) -> String:
	return value.left(12) if value.length() > 12 else value


func _format_count(value: int) -> String:
	var source := str(value)
	var output := ""
	while source.length() > 3:
		output = ",%s%s" % [source.right(3), output]
		source = source.left(source.length() - 3)
	return source + output


func _browse_library() -> void:
	_popup_directory(_library_picker, _application_library.text)


func _browse_classic_parent() -> void:
	_popup_directory(_classic_picker, _classic_output.text.get_base_dir())


func _browse_rebuilt() -> void:
	var current := _rebuilt_output.text.strip_edges()
	if not current.is_empty():
		_rebuilt_picker.current_path = current
	_rebuilt_picker.popup_centered_ratio(0.75)


func _popup_directory(picker: FileDialog, current: String) -> void:
	if not current.strip_edges().is_empty() and DirAccess.dir_exists_absolute(current):
		picker.current_dir = current
	picker.popup_centered_ratio(0.75)


func _select_library(path: String) -> void:
	_application_library.text = path
	_on_input_changed(path)


func _select_classic_parent(path: String) -> void:
	_classic_output.text = path.path_join(_classic_leaf)
	_on_input_changed(path)


func _select_rebuilt(path: String) -> void:
	_rebuilt_output.text = path if path.to_lower().ends_with(".realmz2") else path + ".realmz2"
	_on_input_changed(path)
