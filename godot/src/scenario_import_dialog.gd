class_name ProvidenceScenarioImportDialog
extends ConfirmationDialog

signal scenario_item_import_requested(data_path: String, text_path: String)
signal classic_land_import_requested(directory: String)
signal classic_scenario_inspect_requested(scenario_directory: String, application_data_directory: String)
signal classic_scenario_import_requested(scenario_directory: String, application_data_directory: String)

const DATA_NI_BYTES := 20_000
const MAP_LEVEL_BYTES := 16_200
const ACTION_POINT_LEVEL_BYTES := 4_000
const MESSAGE_RECORD_BYTES := 256
const SIMPLE_ENCOUNTER_RECORD_BYTES := 426
const EXTRA_ACTION_POINT_RECORD_BYTES := 40
const EXTRA_CODE_RECORD_BYTES := 10
const GLOBAL_MACRO_BYTES := 60

class LandInputs extends RefCounted:
	var lengths: Dictionary
	var land_levels: int
	var message_rows: int
	var encounter_rows: int
	var optional_details: Array[String] = []
	var optional_count := 0
	var valid := false


enum ImportMode { NONE, CLASSIC_SCENARIO, CLASSIC_LAND, SCENARIO_ITEMS }

@onready var _source_folder: LineEdit = %ScenarioSourceFolder
@onready var _application_data_folder: LineEdit = %ClassicApplicationDataFolder
@onready var _application_data_status: Label = %BundledRealmzDataStatus
@onready var _subtitle: Label = %ScenarioImportSubtitle
@onready var _invariant_text: Label = %BoundedImportInvariantText
@onready var _detected_inputs: Label = %DetectedScenarioInputs
@onready var _scope: Label = %ScenarioImportScope
@onready var _validation: Label = %ScenarioImportValidation
@onready var _directory_dialog: FileDialog = %ScenarioDirectoryPicker
var _inspect_button: Button
var _data_path := ""
var _text_path := ""
var _import_mode := ImportMode.NONE
var _classic_preflight_ready := false
var _classic_preflight: Dictionary = {}


func _ready() -> void:
	name = "ScenarioImportDialog"
	accessibility_name = "Import Classic Scenario"
	title = "Import Classic Scenario"
	ok_button_text = "Import"
	cancel_button_text = "Cancel"
	wrap_controls = false
	min_size = Vector2i(860, 560)
	_source_folder.text_changed.connect(func(_text: String) -> void: _update_validation())
	_application_data_folder.text_changed.connect(func(_text: String) -> void: _update_validation())
	%BrowseScenarioSource.pressed.connect(_browse_source)
	_directory_dialog.dir_selected.connect(_select_source)
	confirmed.connect(_submit)
	custom_action.connect(_on_custom_action)
	_inspect_button = add_button("Inspect Source Set", false, "inspect")
	_update_validation()


func popup_import(bundled_application_data_directory: String = "") -> void:
	_source_folder.text = ""
	var configured_data := bundled_application_data_directory.strip_edges()
	if configured_data.is_empty():
		configured_data = OS.get_environment("PROVIDENCE_CLASSIC_APPLICATION_DATA_ROOT").strip_edges()
	if not configured_data.is_empty():
		_application_data_folder.text = configured_data
	_update_validation()
	popup_centered(Vector2i(900, 640))
	_source_folder.call_deferred("grab_focus")


func set_source_directories(scenario_directory: String, application_data_directory: String) -> void:
	_source_folder.text = scenario_directory
	_application_data_folder.text = application_data_directory
	_update_validation()


func request_classic_inspection() -> void:
	if _import_mode != ImportMode.CLASSIC_SCENARIO:
		return
	var scenario_directory := _source_folder.text.strip_edges()
	var application_data_directory := _application_data_folder.text.strip_edges()
	if scenario_directory.is_empty() or application_data_directory.is_empty():
		return
	_classic_preflight_ready = false
	_validation.text = "Inspecting the complete source set…"
	_validation.add_theme_color_override("font_color", Color("e5b567"))
	get_ok_button().disabled = true
	classic_scenario_inspect_requested.emit(scenario_directory, application_data_directory)


func submit_import() -> void:
	_submit()


func is_classic_scenario_ready() -> bool:
	return _import_mode == ImportMode.CLASSIC_SCENARIO and _classic_preflight_ready


func classic_preflight() -> Dictionary:
	return _classic_preflight.duplicate(true)


func apply_classic_preflight(preflight: Dictionary) -> void:
	if _import_mode != ImportMode.CLASSIC_SCENARIO:
		return
	var selected_scenario := _source_folder.text.strip_edges().replace("\\", "/").simplify_path()
	var selected_application := _application_data_folder.text.strip_edges().replace("\\", "/").simplify_path()
	var inspected_scenario := str(preflight.get("scenarioDirectory", "")).replace("\\", "/").simplify_path()
	var inspected_application := str(preflight.get("applicationDataDirectory", "")).replace("\\", "/").simplify_path()
	if inspected_scenario != selected_scenario or inspected_application != selected_application:
		apply_classic_preflight_error("The inspected folders changed. Inspect the current selection again.")
		return
	_classic_preflight = preflight.duplicate(true)
	_classic_preflight_ready = bool(preflight.get("readyForDecode", false))
	var counts := preflight.get("counts", {}) as Dictionary
	var blockers := preflight.get("blockers", []) as Array
	_detected_inputs.text = (
		"%s\n" % str(preflight.get("scenarioName", "Classic scenario"))
		+ "Scenario files  %d/%d required · %d optional · %s\n" % [
			int(counts.get("presentRequiredScenarioFiles", 0)),
			int(counts.get("requiredScenarioFiles", 0)),
			int(counts.get("presentOptionalScenarioFiles", 0)),
			_format_bytes(int(counts.get("scenarioSourceBytes", 0))),
		]
		+ "Realmz data files  %d/%d required · %s\n" % [
			int(counts.get("presentRequiredApplicationFiles", 0)),
			int(counts.get("requiredApplicationFiles", 0)),
			_format_bytes(int(counts.get("applicationSourceBytes", 0))),
		]
		+ "Ignored support files  %d" % int(counts.get("unownedScenarioFiles", 0))
	)
	_scope.text = "Complete Classic scenario"
	if _classic_preflight_ready:
		_validation.text = "Ready to import · %d blockers · import cannot be undone" % blockers.size()
		_validation.add_theme_color_override("font_color", Color("7dcaa2"))
		get_ok_button().disabled = false
	else:
		var details: Array[String] = []
		for blocker: Variant in blockers.slice(0, 4):
			if blocker is Dictionary:
				details.append(str((blocker as Dictionary).get("message", (blocker as Dictionary).get("code", "Source-set blocker"))))
		_validation.text = "Cannot import · %d source-set blocker%s%s" % [
			blockers.size(),
			"" if blockers.size() == 1 else "s",
			"\n" + "\n".join(details) if not details.is_empty() else "",
		]
		_validation.add_theme_color_override("font_color", Color("e58b7b"))
		get_ok_button().disabled = true


func apply_classic_preflight_error(message: String) -> void:
	_inspect_button.disabled = false
	_classic_preflight_ready = false
	_classic_preflight.clear()
	_validation.text = message
	_validation.add_theme_color_override("font_color", Color("e58b7b"))
	get_ok_button().disabled = true


func apply_import_started() -> void:
	_validation.text = "Importing scenario…"
	_validation.add_theme_color_override("font_color", Color("e5b567"))
	get_ok_button().disabled = true
	_inspect_button.disabled = true


func _browse_source() -> void:
	var documents := OS.get_system_dir(OS.SYSTEM_DIR_DOCUMENTS)
	if not documents.is_empty():
		_directory_dialog.current_dir = documents
	_directory_dialog.popup_centered_ratio(0.72)


func _select_source(path: String) -> void:
	_source_folder.text = path
	_update_validation()


func _on_custom_action(action: StringName) -> void:
	if action == &"inspect":
		if _import_mode == ImportMode.CLASSIC_SCENARIO:
			request_classic_inspection()
		else:
			_update_validation()


func _submit() -> void:
	if _import_mode == ImportMode.CLASSIC_SCENARIO:
		if not _classic_preflight_ready or get_ok_button().disabled:
			return
		classic_scenario_import_requested.emit(
			_source_folder.text.strip_edges(),
			_application_data_folder.text.strip_edges()
		)
		return
	_update_validation()
	if _import_mode == ImportMode.NONE or get_ok_button().disabled:
		return
	if _import_mode == ImportMode.CLASSIC_LAND:
		classic_land_import_requested.emit(_source_folder.text.strip_edges())
	else:
		scenario_item_import_requested.emit(_data_path, _text_path)


func _update_validation() -> void:
	_data_path = ""
	_text_path = ""
	_import_mode = ImportMode.NONE
	_classic_preflight_ready = false
	_classic_preflight.clear()
	_inspect_button.disabled = false
	var bundled_data_ready := not _application_data_folder.text.strip_edges().is_empty()
	_application_data_status.text = "Included with Providence" if bundled_data_ready else "Missing from this build"
	_application_data_status.add_theme_color_override(
		"font_color",
		Color("7dcaa2") if bundled_data_ready else Color("e58b7b")
	)
	_subtitle.text = "Choose a Classic scenario folder."
	_invariant_text.text = "Inspect the folder before importing."
	title = "Import Classic Scenario"
	_scope.text = "Inspect the folder before importing."
	var folder := _source_folder.text.strip_edges()
	if folder.is_empty():
		_detected_inputs.text = "Waiting for a source folder"
		_set_invalid("Choose a scenario folder. No project state changes during inspection.")
		return
	if _detect_complete_classic_scenario(folder):
		return
	if _detect_classic_land(folder):
		return
	_detect_scenario_items(folder)


func _detect_complete_classic_scenario(folder: String) -> bool:
	var has_resource_container := (
		FileAccess.file_exists(folder.path_join("Scenario.rsrc"))
		or FileAccess.file_exists(folder.path_join("Scenario.rsf"))
		or FileAccess.file_exists(folder.path_join(".rsrc").path_join("Scenario"))
		or FileAccess.file_exists(folder.path_join("._Scenario"))
	)
	if not has_resource_container or not FileAccess.file_exists(folder.path_join("Data NI")):
		return false
	_import_mode = ImportMode.CLASSIC_SCENARIO
	title = "Import Classic Scenario"
	_subtitle.text = "Classic scenario import"
	_invariant_text.text = "Import replaces the current scenario and clears Undo history. It cannot be undone."
	_scope.text = "Complete Classic scenario"
	_detected_inputs.text = "Classic scenario detected · inspect to continue."
	get_ok_button().text = "Import Complete Scenario"
	get_ok_button().disabled = true
	if _application_data_folder.text.strip_edges().is_empty():
		_validation.text = "Providence's bundled Realmz reference data is missing. Reinstall or rebuild the complete application bundle."
		_validation.add_theme_color_override("font_color", Color("e58b7b"))
		_inspect_button.disabled = true
	else:
		_validation.text = "Not inspected · inspection will not change the project."
		_validation.add_theme_color_override("font_color", Color("e5b567"))
	return true


func _detect_classic_land(folder: String) -> bool:
	var inputs := _read_classic_land_inputs(folder)
	if inputs == null:
		return false
	_inspect_classic_land_optional(folder, inputs)
	_show_classic_land_inputs(inputs)
	if not inputs.valid:
		_set_invalid("The land workflow files are present but their native geometry is inconsistent.")
		return true
	_import_mode = ImportMode.CLASSIC_LAND
	_invariant_text.text = "Import replaces the listed families. Undo restores them."
	title = "Import Scenario — Certified Land Workflow"
	_scope.text = "Land maps, placed and Extra Action Points, messages, encounters, E-code attachments, and Global hooks · absent families unchanged"
	_validation.text = "Ready · %d file families" % (4 + inputs.optional_count)
	_validation.add_theme_color_override("font_color", Color("7dcaa2"))
	get_ok_button().text = "Import Land Workflow"
	get_ok_button().disabled = false
	return true


func _read_classic_land_inputs(folder: String) -> LandInputs:
	var required := {
		"Data LD": MAP_LEVEL_BYTES,
		"Data DD": ACTION_POINT_LEVEL_BYTES,
		"Data SD2": MESSAGE_RECORD_BYTES,
		"Data ED": SIMPLE_ENCOUNTER_RECORD_BYTES,
	}
	var lengths := {}
	for native_path in required:
		var path := folder.path_join(native_path)
		if not FileAccess.file_exists(path):
			return null
		var source := FileAccess.open(path, FileAccess.READ)
		if source == null:
			return null
		lengths[native_path] = source.get_length()
	var land_levels := floori(float(lengths["Data LD"]) / float(MAP_LEVEL_BYTES))
	var message_rows := floori(float(lengths["Data SD2"]) / float(MESSAGE_RECORD_BYTES))
	var encounter_rows := floori(float(lengths["Data ED"]) / float(SIMPLE_ENCOUNTER_RECORD_BYTES))
	var valid := land_levels > 0
	valid = valid and int(lengths["Data LD"]) % MAP_LEVEL_BYTES == 0
	valid = valid and int(lengths["Data DD"]) == land_levels * ACTION_POINT_LEVEL_BYTES
	valid = valid and int(lengths["Data SD2"]) % MESSAGE_RECORD_BYTES == 0
	valid = valid and int(lengths["Data ED"]) % SIMPLE_ENCOUNTER_RECORD_BYTES == 0
	var inputs := LandInputs.new()
	inputs.lengths = lengths
	inputs.land_levels = land_levels
	inputs.message_rows = message_rows
	inputs.encounter_rows = encounter_rows
	inputs.valid = valid
	return inputs


func _inspect_classic_land_optional(folder: String, inputs: LandInputs) -> void:
	var optional_details := inputs.optional_details
	var optional_count := 0
	var valid := inputs.valid
	var extra_ap_path := folder.path_join("Data ED3")
	if FileAccess.file_exists(extra_ap_path):
		var extra_ap := FileAccess.open(extra_ap_path, FileAccess.READ)
		if extra_ap == null or extra_ap.get_length() % EXTRA_ACTION_POINT_RECORD_BYTES != 0:
			valid = false
		else:
			optional_count += 1
			optional_details.append("Data ED3 · %s bytes · %d Extra Action Point rows" % [
				_format_count(extra_ap.get_length()),
				floori(float(extra_ap.get_length()) / float(EXTRA_ACTION_POINT_RECORD_BYTES)),
			])
	else:
		optional_details.append("Data ED3 · optional · not found")
	var extra_code_path := folder.path_join("Data EDCD")
	if FileAccess.file_exists(extra_code_path):
		var extra_code := FileAccess.open(extra_code_path, FileAccess.READ)
		if extra_code == null or extra_code.get_length() % EXTRA_CODE_RECORD_BYTES != 0:
			valid = false
		else:
			optional_count += 1
			optional_details.append("Data EDCD · %s bytes · %d E-code rows" % [
				_format_count(extra_code.get_length()),
				floori(float(extra_code.get_length()) / float(EXTRA_CODE_RECORD_BYTES)),
			])
	else:
		optional_details.append("Data EDCD · optional · not found")
	var global_path := folder.path_join("Global")
	if FileAccess.file_exists(global_path):
		var global := FileAccess.open(global_path, FileAccess.READ)
		if global == null or global.get_length() != GLOBAL_MACRO_BYTES:
			valid = false
		else:
			optional_count += 1
			optional_details.append("Global · 60 bytes · five source-backed lifecycle hooks")
	else:
		optional_details.append("Global · optional · not found")
	inputs.optional_count = optional_count
	inputs.valid = valid


func _show_classic_land_inputs(inputs: LandInputs) -> void:
	var lengths := inputs.lengths
	var land_levels := inputs.land_levels
	var message_rows := inputs.message_rows
	var encounter_rows := inputs.encounter_rows
	var optional_details := inputs.optional_details
	_detected_inputs.text = (
		"Data LD · %s bytes · %d land level%s\n" % [
			_format_count(int(lengths["Data LD"])),
			land_levels,
			"" if land_levels == 1 else "s",
		]
		+ "Data DD · %s bytes · %d Action Point rows\n" % [_format_count(int(lengths["Data DD"])), land_levels * 100]
		+ "Data SD2 · %s bytes · %d message rows\n" % [
			_format_count(int(lengths["Data SD2"])),
			message_rows,
		]
		+ "Data ED · %s bytes · %d simple encounter%s\n%s" % [
			_format_count(int(lengths["Data ED"])),
			encounter_rows,
			"" if encounter_rows == 1 else "s",
			"\n".join(optional_details),
		]
	)


func _detect_scenario_items(folder: String) -> void:
	var data_path := folder.path_join("Data NI")
	if not FileAccess.file_exists(data_path):
		_detected_inputs.text = "Land workflow · incomplete\nData NI · missing"
		_set_invalid("No complete certified import workflow was found in the selected folder.")
		return
	var data_file := FileAccess.open(data_path, FileAccess.READ)
	if data_file == null:
		_detected_inputs.text = "Data NI · unreadable"
		_set_invalid("Data NI could not be opened for inspection.")
		return
	var byte_length := data_file.get_length()
	if byte_length != DATA_NI_BYTES:
		_detected_inputs.text = "Data NI · %s bytes · expected %s" % [_format_count(byte_length), _format_count(DATA_NI_BYTES)]
		_set_invalid("Data NI must contain exactly 200 fixed 100-byte records.")
		return

	_data_path = data_path
	for candidate in [folder.path_join("Data NI.rsrc"), folder.path_join("._Data NI")]:
		if FileAccess.file_exists(candidate):
			_text_path = candidate
			break
	_detected_inputs.text = "Data NI · 20,000 bytes   ·   item text · %s" % (
		"%s found" % _text_path.get_file() if not _text_path.is_empty() else "not found (optional)"
	)
	_import_mode = ImportMode.SCENARIO_ITEMS
	_invariant_text.text = "Import replaces scenario items 800–999. Undo restores them."
	title = "Import Scenario — Item Catalog"
	_scope.text = "Scenario items 800–999 only · other families unchanged"
	_validation.text = "Ready · 200 scenario items"
	_validation.add_theme_color_override("font_color", Color("7dcaa2"))
	get_ok_button().text = "Import Item Catalog"
	get_ok_button().disabled = false


func _set_invalid(message: String) -> void:
	_validation.text = message
	_validation.add_theme_color_override("font_color", Color("e5b567"))
	get_ok_button().text = "Import"
	get_ok_button().disabled = true


func _format_count(value: int) -> String:
	var source := str(value)
	var output := ""
	while source.length() > 3:
		output = ",%s%s" % [source.right(3), output]
		source = source.left(source.length() - 3)
	return source + output


func _format_bytes(value: int) -> String:
	if value >= 1024 * 1024:
		return "%.1f MB" % (float(value) / (1024.0 * 1024.0))
	if value >= 1024:
		return "%.0f KB" % (float(value) / 1024.0)
	return "%s bytes" % _format_count(value)
