class_name ProvidencePublishWorkbench
extends VBoxContainer

signal target_changed(target: String)
signal recheck_requested
signal cancel_check_requested
signal page_requested(offset: int)
signal publish_requested(target: String)
signal destination_selected(target: String, path: String)
signal benchmark_requested
signal route_requested(identity: String)
signal recovery_requested(action: String)

const PAGE_SIZE := 4

var _target := "classic"
var _offset := 0
var _total := 0
var _checked_revision := -1
var _required_directory_name := "scenario-classic"
var _output_paths := {"classic": "", "rebuilt": ""}
var _connected := false
var _plan_ready := false
var _busy := false
var _checking := false
var _recovery_action := ""
var _secondary_action := ""
var _manifest_sha256 := ""
var _trim_bytes := 0
var _trim_acknowledged := false

@onready var trim_option: CheckBox = %TrimExtraCodeTail
@onready var trim_notice: Label = %TrimNotice
@onready var trim_confirmation: ConfirmationDialog = %TrimConfirmation

@onready var target_selector: OptionButton = %TargetSelector
@onready var export_button: Button = %ExportTarget
@onready var summary: Label = %PublishSummary
@onready var readiness_status: Label = %ReadinessStatus
@onready var readiness_revision: Label = %ReadinessRevision
@onready var blocker_groups: RichTextLabel = %BlockerGroups
@onready var recheck_button: Button = %Recheck
@onready var files_heading: Label = %FilesHeading
@onready var files_notice: Label = %FilesNotice
@onready var files_meta: Label = %FilesMeta
@onready var files: ItemList = %Files
@onready var selected_path: LineEdit = %SelectedPath
@onready var previous_page: Button = %PreviousPage
@onready var page_number: LineEdit = %PageNumber
@onready var page_count: Label = %PageCount
@onready var go_to_page: Button = %GoToPage
@onready var next_page: Button = %NextPage
@onready var diagnostics: RichTextLabel = %ExportDiagnostics
@onready var repair_issue: Button = %RepairIssue
@onready var secondary_recovery: Button = %SecondaryRecovery
@onready var open_output: Button = %OpenOutput
@onready var run_benchmark: Button = %RunBenchmark
@onready var benchmark_metrics: Label = %BenchmarkMetrics
@onready var benchmark_status: Label = %BenchmarkStatus
@onready var classic_parent_picker: FileDialog = %ClassicParentPicker
@onready var rebuilt_package_picker: FileDialog = %RebuiltPackagePicker
@onready var stuffit_archive_picker: FileDialog = %StuffItArchivePicker


func _ready() -> void:
	target_selector.add_item("Legacy Realmz scenario (7.1.2 and later)")
	target_selector.add_item("Rebuilt package")
	target_selector.add_item("Legacy Realmz archive (.sit)")
	_update_target_labels()
	target_selector.item_selected.connect(_select_target)
	export_button.pressed.connect(_request_export)
	trim_option.toggled.connect(func(_selected):
		_trim_acknowledged = false
		invalidate("Export options changed · Recheck before publishing.")
		target_changed.emit(_target))
	trim_confirmation.confirmed.connect(func():
		trim_confirmation.hide()
		_trim_acknowledged = true
		publish_requested.emit(_target))
	recheck_button.pressed.connect(func():
		if _checking: cancel_check_requested.emit()
		else: recheck_requested.emit())
	previous_page.pressed.connect(func(): page_requested.emit(maxi(0, _offset - PAGE_SIZE)))
	next_page.pressed.connect(func(): page_requested.emit(_offset + PAGE_SIZE))
	go_to_page.pressed.connect(_request_page_number)
	page_number.text_submitted.connect(func(_text): _request_page_number())
	files.item_selected.connect(_select_file)
	run_benchmark.pressed.connect(benchmark_requested.emit)
	open_output.pressed.connect(_open_output)
	repair_issue.pressed.connect(func(): _request_recovery(_recovery_action))
	secondary_recovery.pressed.connect(func(): _request_recovery(_secondary_action))
	classic_parent_picker.dir_selected.connect(_classic_parent_selected)
	rebuilt_package_picker.file_selected.connect(_rebuilt_path_selected)
	stuffit_archive_picker.file_selected.connect(_stuffit_path_selected)
	show_unavailable("Open a persistent project to inspect publishing readiness.")


func route_identity() -> String:
	return str(get_meta("route_identity", "export.export-plan"))


func target() -> String:
	return _target


func checked_revision() -> int:
	return _checked_revision


func manifest_sha256() -> String:
	return _manifest_sha256


func set_project_context(connected: bool, project_id: String, revision: int, library_root: String) -> void:
	_connected = connected
	%ProjectContext.text = project_id if connected else "No project open"
	%ApplicationLibraryStatus.text = (
		"Application media library · configured" if not library_root.strip_edges().is_empty()
		else "Application media library · not configured"
	)
	if not connected:
		show_unavailable("Open a persistent project to inspect publishing readiness.")
	else:
		target_selector.disabled = false
		recheck_button.disabled = false
		run_benchmark.disabled = false
		if _checked_revision >= 0 and revision != _checked_revision:
			invalidate("Project changed · Recheck before publishing.")


func begin_check() -> void:
	_set_repair()
	_set_busy(true)
	_checking = true
	recheck_button.text = "Cancel check"
	recheck_button.disabled = false
	_checked_revision = -1
	summary.text = "Checking the current %s plan…" % _target_label()
	readiness_status.text = "Checking %s readiness…" % _target_label()
	readiness_status.add_theme_color_override("font_color", Color("e5b567"))
	readiness_revision.text = "Waiting for the compiler plan."
	blocker_groups.text = ""
	_clear_files()
	diagnostics.text = "Checking the current project. No output is written."


func present_check(readiness: Dictionary, plan: Dictionary, _compiler: Dictionary) -> void:
	_checked_revision = int(readiness.get("revision", -1))
	_plan_ready = ProvidencePublishReadiness.is_ready(readiness) and not plan.is_empty()
	_set_busy(false)
	readiness_status.text = "%s files are ready to export." % _target_label() if _plan_ready else "%s export is blocked." % _target_label()
	if _plan_ready and ProvidencePublishReadiness.has_warnings(readiness): readiness_status.text = "%s is ready with %d warnings." % [_target_label(),int(readiness.get("warningCount",0))]
	readiness_status.add_theme_color_override("font_color", Color("e5b567") if _plan_ready and ProvidencePublishReadiness.has_warnings(readiness) else (Color("7dcaa2") if _plan_ready else Color("e58b7b")))
	readiness_revision.text = "Checked revision %d" % _checked_revision
	blocker_groups.text = _format_groups(readiness)
	if _plan_ready:
		present_page(plan)
		summary.text = "%s is ready to export." % _target_label()
		var previous := _target_output()
		diagnostics.text = (
			"No export attempt yet. Choose a new destination; existing output is never replaced."
			if previous.is_empty() else
			"[color=#7dcaa2]Previous successful output remains available.[/color]\n%s\nChoose a new destination to publish again." % previous
		)
		open_output.disabled = previous.is_empty()
		if _target == "stuffit":
			for warning: Variant in plan.get("warnings", []): diagnostics.text += "\n" + str(warning)
	else:
		summary.text = "%s needs attention before export." % _target_label()
		_clear_files()
		diagnostics.text = "Repair the grouped blockers in Issues, then Recheck."
		_set_repair("linter.issues", "Open Issues")


func present_page(plan: Dictionary) -> void:
	_trim_bytes = int(plan.get("trim", {}).get("preview", {}).get("removableBytes", 0))
	trim_notice.visible = trim_option.button_pressed and _target != "rebuilt"
	trim_notice.text = "Export will remove %d trailing Data EDCD bytes. Original bytes remain in the project." % _trim_bytes
	var page := plan.get("files", {}) as Dictionary
	_offset = int(page.get("offset", 0))
	_total = int(page.get("total", 0))
	if _target != "rebuilt":
		_required_directory_name = str(plan.get("requiredDirectoryName", "scenario-classic"))
		if _required_directory_name.is_empty(): _required_directory_name = "scenario-classic"
	_manifest_sha256 = str(plan.get("manifestSha256", ""))
	files.clear()
	for value: Variant in page.get("items", []):
		var row := value as Dictionary
		var kind := str(row.get("family", "Preserved")) if _target == "classic" else str(row.get("kind", "document")).capitalize()
		files.add_item("%-34s  %-18s  %s" % [_abbreviate(str(row.get("path", ""))), kind, _format_bytes(int(row.get("bytes", 0)))])
		files.set_item_metadata(files.item_count - 1, str(row.get("path", "")))
	files_heading.text = "%s FILES" % _target.to_upper()
	files_notice.text = "Native Realmz scenario files." if _target == "classic" else "Deterministic package contents."
	if _target == "stuffit": files_notice.text = "Native files with paired data and resource forks."
	files_meta.text = "%d files · %s" % [_total, _range_label()]
	_update_paging()
	if files.item_count > 0:
		files.select(0)
		_select_file(0)


func present_failure(message: String) -> void:
	_plan_ready = false
	_set_busy(false)
	readiness_status.text = "The %s check failed." % _target_label()
	readiness_revision.text = "No current plan · Check failed."
	summary.text = "The current export plan could not be checked."
	readiness_status.add_theme_color_override("font_color", Color("e58b7b"))
	diagnostics.text = "[color=#e58b7b]%s[/color]\nNo output was reported as created." % message
	_set_repair("linter.issues", "Open Issues")


func begin_publish() -> void:
	_set_repair()
	_set_busy(true)
	summary.text = "Publishing %s without replacing existing output…" % _target_label()
	diagnostics.text = "Publishing %s… The destination will not be overwritten." % _target_label()


func present_published(result: Dictionary) -> void:
	_set_recovery()
	_plan_ready = false
	_set_busy(false)
	_output_paths[_target] = str(result.get("directory", result.get("path", "")))
	var count := (result.get("files", []) as Array).size() if _target == "classic" else int(result.get("fileCount", 0))
	var warnings := result.get("warnings", []) as Array
	var warning_text := ""
	if not warnings.is_empty():
		var warning_lines: Array[String] = []
		for value: Variant in warnings.slice(0, 4): warning_lines.append(str(value.get("message", "Review this warning in Issues.")) if value is Dictionary else str(value))
		warning_text = "\n[color=#e5b567]Published with %d warning%s.[/color]\n%s" % [
			warnings.size(), "" if warnings.size() == 1 else "s", "\n".join(warning_lines)]
		_set_recovery("Review Warning", "route:linter.issues")
	diagnostics.text = "[color=#7dcaa2]Published %s successfully.[/color]%s\n%d files · revision %d\n%s" % [
		_target_label(), warning_text, count, int(result.get("revision", _checked_revision)), _target_output()]
	summary.text = "Published %s successfully." % _target_label()
	open_output.disabled = _target_output().is_empty()


func present_publish_failure(message: String, outcome_unknown: bool, repair_route := "", repair_label := "") -> void:
	_set_recovery()
	_plan_ready = not outcome_unknown and _checked_revision >= 0
	_set_busy(false)
	var consequence := " Reopen the project and inspect the destination before trying again." if outcome_unknown else " No successful output was reported."
	diagnostics.text = "[color=#e58b7b]Publish failed.[/color]\n%s%s" % [message, consequence]
	summary.text = "Publication could not be completed."
	open_output.disabled = _target_output().is_empty()
	if not outcome_unknown:
		if repair_route.is_empty(): _set_recovery("Choose Another Location…", "choose-location")
		else: _set_recovery(repair_label if not repair_label.is_empty() else "Open Issues", "route:" + repair_route)


func begin_page_load() -> void:
	_set_busy(true)
	files_meta.text = "%d files · Loading page…" % _total


func present_page_failure(message: String) -> void:
	_set_busy(false)
	files_meta.text = "%d files · %s" % [_total, _range_label()]
	diagnostics.text = "[color=#e58b7b]The file page could not be loaded.[/color]\n%s" % message


func begin_benchmark() -> void:
	_set_busy(true)
	benchmark_status.text = "Measuring the current revision…"


func present_benchmark(result: Dictionary) -> void:
	_set_busy(false)
	var counts := result.get("counts", {}) as Dictionary
	benchmark_metrics.text = "%d maps · %s tiles\n%d Action Points · %d Extra AP · %d Extra Codes" % [
		int(counts.get("maps", 0)), _format_count(int(counts.get("mapTiles", 0))),
		int(counts.get("actionPoints", 0)), int(counts.get("extraActionPoints", 0)), int(counts.get("extraCodes", 0))]
	benchmark_status.text = "Validation %d ms · Revision %d · %s" % [
		int((result.get("timing", {}) as Dictionary).get("validationMs", 0)), int(result.get("revision", -1)),
		"Pass" if bool(result.get("ok", false)) else "Review"]


func present_benchmark_failure(message: String) -> void:
	_set_busy(false)
	benchmark_status.text = "Benchmark unavailable · " + message


func invalidate(message: String) -> void:
	_set_repair()
	_checked_revision = -1
	_manifest_sha256 = ""
	_plan_ready = false
	_set_busy(false)
	open_output.disabled = _target_output().is_empty()
	readiness_status.text = message
	readiness_status.add_theme_color_override("font_color", Color("e5b567"))
	readiness_revision.text = "No current plan."
	_clear_files()


func show_unavailable(message: String) -> void:
	_set_repair()
	_connected = false
	_output_paths = {"classic": "", "rebuilt": ""}
	summary.text = "No project open."
	invalidate(message)
	recheck_button.disabled = true
	run_benchmark.disabled = true
	_set_recovery("Open Project…", "open-project", "Import Scenario…", "import-scenario")


func show_unsaved() -> void:
	show_unavailable("Save this project before publishing Classic output.")
	summary.text = "Save required before export."
	_set_recovery("Save Project As…", "save-as", "Cancel", "cancel")


func show_unapplied() -> void:
	invalidate("Apply or discard editor changes before publishing.")
	summary.text = "One editor has unapplied changes."
	_set_recovery("Return to Editor", "return-editor", "Cancel", "cancel")


func focus_route(identity: String) -> void:
	match identity:
		"linter.readiness": recheck_button.grab_focus()
		"export.benchmark": run_benchmark.grab_focus()
		_: (target_selector if export_button.disabled else export_button).grab_focus()


func choose_destination() -> void:
	if _target == "classic":
		classic_parent_picker.popup_centered_ratio(0.72)
	elif _target == "stuffit":
		stuffit_archive_picker.current_file = _required_directory_name + ".sit"
		stuffit_archive_picker.popup_centered_ratio(0.72)
	else:
		rebuilt_package_picker.popup_centered_ratio(0.72)


func _select_target(index: int) -> void:
	_target = ["classic", "rebuilt", "stuffit"][index]
	reset_trim()
	trim_option.visible = _target != "rebuilt"
	_update_target_labels()
	_offset = 0
	invalidate("Target changed · Recheck %s." % _target_label())
	target_changed.emit(_target)


func _set_busy(busy: bool) -> void:
	_checking = false
	recheck_button.text = "Recheck"
	_busy = busy
	trim_option.disabled = busy or not _connected
	target_selector.disabled = busy or not _connected
	recheck_button.disabled = busy or not _connected
	run_benchmark.disabled = busy or not _connected
	export_button.disabled = busy or not _plan_ready
	previous_page.disabled = busy or _offset <= 0
	next_page.disabled = busy or _offset + PAGE_SIZE >= _total
	go_to_page.disabled = busy or _total <= PAGE_SIZE


func reset_trim() -> void:
	trim_option.set_pressed_no_signal(false)
	_trim_acknowledged = false
	trim_notice.hide()
	trim_confirmation.hide()


func trim_parameters(publishing := false) -> Dictionary:
	if _target == "rebuilt" or not trim_option.button_pressed: return {}
	var params := {"trimExtraCodeTail": true}
	if publishing:
		params.merge({"acknowledgeTrim": _trim_acknowledged, "manifestSha256": _manifest_sha256})
	return params


func _request_export() -> void:
	if _target != "rebuilt" and trim_option.button_pressed:
		trim_confirmation.dialog_text = "Remove %d trailing bytes from Data EDCD in the exported copy?\n\nThe export will no longer preserve every original byte. The project and retained source remain unchanged. No interior records will move." % _trim_bytes
		trim_confirmation.popup_centered(Vector2i(640, 210))
	else:
		publish_requested.emit(_target)


func _clear_files() -> void:
	_offset = 0
	_total = 0
	files.clear()
	files_meta.text = "No current file plan."
	selected_path.text = ""
	_update_paging()


func _update_paging() -> void:
	var pages := maxi(1, ceili(float(_total) / PAGE_SIZE))
	var current := mini(pages, _offset / PAGE_SIZE + 1)
	page_number.text = str(current)
	page_count.text = "of %d" % pages
	previous_page.disabled = _busy or _offset <= 0
	next_page.disabled = _busy or _offset + PAGE_SIZE >= _total
	go_to_page.disabled = _busy or _total <= PAGE_SIZE


func _request_page_number() -> void:
	var pages := maxi(1, ceili(float(_total) / PAGE_SIZE))
	var requested := int(page_number.text)
	if requested < 1 or requested > pages:
		page_number.text = str(mini(pages, _offset / PAGE_SIZE + 1))
		return
	page_requested.emit((requested - 1) * PAGE_SIZE)


func _select_file(index: int) -> void:
	selected_path.text = str(files.get_item_metadata(index)) if index >= 0 and index < files.item_count else ""


func _classic_parent_selected(parent: String) -> void:
	destination_selected.emit("classic", parent.path_join(_required_directory_name))


func _rebuilt_path_selected(path: String) -> void:
	var output := path if path.to_lower().ends_with(".realmz2") else path + ".realmz2"
	destination_selected.emit("rebuilt", output)


func _stuffit_path_selected(path: String) -> void:
	var output := path if path.to_lower().ends_with(".sit") else path + ".sit"
	destination_selected.emit("stuffit", output)


func _open_output() -> void:
	if not _target_output().is_empty(): OS.shell_show_in_file_manager(_target_output())


func _set_repair(route := "", label := "") -> void:
	if route.is_empty(): _set_recovery()
	else: _set_recovery(label if not label.is_empty() else "Open Issues", "route:" + route)


func _set_recovery(primary_label := "", primary_action := "", secondary_label := "", secondary_action := "") -> void:
	_recovery_action = primary_action
	_secondary_action = secondary_action
	repair_issue.visible = not primary_action.is_empty()
	secondary_recovery.visible = not secondary_action.is_empty()
	if not primary_label.is_empty(): repair_issue.text = primary_label
	if not secondary_label.is_empty(): secondary_recovery.text = secondary_label


func _request_recovery(action: String) -> void:
	if action.begins_with("route:"): route_requested.emit(action.trim_prefix("route:"))
	elif not action.is_empty(): recovery_requested.emit(action)


func _target_output() -> String:
	return str(_output_paths.get(_target, ""))


func _update_target_labels() -> void:
	export_button.text = "Export Legacy Realmz Folder…" if _target == "classic" else "Export Rebuilt Package…"
	if _target == "stuffit": export_button.text = "Export StuffIt Archive…"


func _target_label() -> String:
	if _target == "stuffit": return "Legacy Realmz archive"
	return "Legacy Realmz" if _target == "classic" else "Rebuilt"


func _format_groups(readiness: Dictionary) -> String:
	var groups: Array[String] = []
	for value: Variant in (readiness.get("groups", []) as Array).slice(0, 8):
		var group := value as Dictionary
		groups.append("%s × %d" % [str(group.get("code", "unknown")), int(group.get("count", 0))])
	var blockers := "No blockers." if groups.is_empty() else "\n".join(groups)
	var warnings := ProvidencePublishReadiness.warning_text(readiness)
	return blockers + ("\n\n" + warnings if not warnings.is_empty() else "")


func _range_label() -> String:
	if _total == 0: return "All files shown"
	return "%d–%d shown" % [_offset + 1, mini(_total, _offset + PAGE_SIZE)]


func _abbreviate(path: String) -> String:
	return path if path.length() <= 34 else path.left(15) + "…" + path.right(16)


func _format_bytes(value: int) -> String:
	return "%s bytes" % _format_count(value)


func _format_count(value: int) -> String:
	var source := str(value)
	var output := ""
	while source.length() > 3:
		output = ",%s%s" % [source.right(3), output]
		source = source.left(source.length() - 3)
	return source + output
