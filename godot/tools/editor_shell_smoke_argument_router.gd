class_name ProvidenceEditorShellSmokeArgumentRouter
extends RefCounted

const HANDLERS := {
	"_run_smoke": [preload("res://tools/shell_workflow_smoke.gd"), "_run_smoke"],
	"_run_lifecycle_smoke": [preload("res://tools/project_lifecycle_smoke.gd"), "_run_lifecycle_smoke"],
	"_run_save_as_smoke": [preload("res://tools/project_lifecycle_smoke.gd"), "_run_save_as_smoke"],
	"_run_scenario_import_smoke": [preload("res://tools/scenario_import_smoke.gd"), "_run_scenario_import_smoke"],
	"_run_publish_smoke": [preload("res://tools/scenario_import_smoke.gd"), "_run_publish_smoke"],
	"_run_classic_scenario_import_smoke": [preload("res://tools/scenario_import_smoke.gd"), "_run_classic_scenario_import_smoke"],
	"_run_classic_land_import_smoke": [preload("res://tools/scenario_import_smoke.gd"), "_run_classic_land_import_smoke"],
	"_run_real_action_point_link_smoke": [preload("res://tools/action_point_links_smoke.gd"), "_run_real_action_point_link_smoke"],
	"_run_cob_map_link_smoke": [preload("res://tools/action_point_links_smoke.gd"), "_run_cob_map_link_smoke"],
	"_run_action_point_smoke": [preload("res://tools/action_point_workflow_smoke.gd"), "_run_action_point_smoke"],
	"_run_simple_encounter_smoke": [preload("res://tools/encounter_workflow_smoke.gd"), "_run_simple_encounter_smoke"],
	"_run_extra_action_point_smoke": [preload("res://tools/encounter_workflow_smoke.gd"), "_run_extra_action_point_smoke"],
	"_run_global_macro_smoke": [preload("res://tools/global_macro_workflow_smoke.gd"), "_run_global_macro_smoke"],
	"_run_economy_authoring_smoke": [preload("res://tools/economy_authoring_smoke.gd"), "_run_economy_authoring_smoke"],
	"_run_scenario_picture_smoke": [preload("res://tools/asset_workflow_smoke.gd"), "run_scenario_picture"],
	"_run_scenario_sound_smoke": [preload("res://tools/asset_workflow_smoke.gd"), "run_scenario_sound"],
	"_run_scenario_icon_smoke": [preload("res://tools/asset_workflow_smoke.gd"), "run_scenario_icon"],
	"_run_special_land_smoke": [preload("res://tools/asset_workflow_smoke.gd"), "run_special_land"],
	"_run_performance_smoke": [preload("res://tools/editor_performance_smoke.gd"), "_run_performance_smoke"],
}


const PERFORMANCE := {
	"method": "_run_performance_smoke",
	"arguments": 2,
	"error": "--performance-smoke requires a project directory and report path",
}

const SESSION_SPECS := {
	"--lifecycle-smoke": ["_run_lifecycle_smoke", 1, "requires a project directory"],
	"--save-as-smoke": ["_run_save_as_smoke", 2, "requires source and destination project directories"],
	"--scenario-import-smoke": ["_run_scenario_import_smoke", 2, "requires a project directory and Data NI path"],
	"--classic-scenario-import-smoke": ["_run_classic_scenario_import_smoke", 2, "requires a project directory and scenario directory"],
	"--classic-land-import-smoke": ["_run_classic_land_import_smoke", 2, "requires a project directory and source directory"],
	"--simple-encounter-smoke": ["_run_simple_encounter_smoke", 2, "requires a project directory and source directory"],
	"--extra-action-point-smoke": ["_run_extra_action_point_smoke", 2, "requires a project directory and source directory"],
	"--action-point-smoke": ["_run_action_point_smoke", 2, "requires a project directory and source directory"],
	"--real-action-point-link-smoke": ["_run_real_action_point_link_smoke", 3, "requires a destination project, Classic output directory, and Rebuilt output path"],
	"--cob-map-link-smoke": ["_run_cob_map_link_smoke", 0, "requires no arguments"],
	"--global-macro-smoke": ["_run_global_macro_smoke", 2, "requires a project directory and source directory"],
	"--economy-authoring-smoke": ["_run_economy_authoring_smoke", 2, "requires a project directory and source directory"],
	"--scenario-picture-smoke": ["_run_scenario_picture_smoke", 1, "requires a project directory"],
	"--scenario-sound-smoke": ["_run_scenario_sound_smoke", 1, "requires a project directory"],
	"--scenario-icon-smoke": ["_run_scenario_icon_smoke", 1, "requires a project directory"],
	"--special-land-smoke": ["_run_special_land_smoke", 1, "requires a project directory"],
	"--publish-smoke": ["_run_publish_smoke", 4, "requires a project directory, application-library directory, Classic output directory, and Rebuilt output path"],
	"--smoke": ["_run_smoke", 0, "requires no arguments"],
}


static func route_pre_session(shell: Node, arguments: PackedStringArray) -> bool:
	return _route(shell, arguments, "--performance-smoke", PERFORMANCE)


static func route_session(shell: Node, arguments: PackedStringArray) -> bool:
	for flag in SESSION_SPECS:
		if arguments.has(flag):
			var values := SESSION_SPECS[flag] as Array
			return _route(shell, arguments, flag, {
				"method": str(values[0]),
				"arguments": int(values[1]),
				"error": "%s %s" % [flag, str(values[2])],
			})
	return false


static func _route(shell: Node, arguments: PackedStringArray, flag: String, spec: Dictionary) -> bool:
	if not arguments.has(flag):
		return false
	var index := arguments.find(flag)
	var argument_count := int(spec.get("arguments", 0))
	if index + argument_count >= arguments.size():
		preload("res://tools/native_workflow_fixtures.gd")._smoke_fail(shell, str(spec.get("error", "%s has invalid arguments" % flag)))
		return true
	var invocation: Array = [shell]
	for offset in range(argument_count):
		invocation.append(arguments[index + offset + 1])
	var handler: Array = HANDLERS[str(spec.method)]
	Callable(handler[0], handler[1]).bindv(invocation).call_deferred()
	return true
