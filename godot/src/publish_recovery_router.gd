extends RefCounted

var _current_view: Callable
var _open_project: Callable
var _import_scenario: Callable
var _save_as: Callable
var _status: Callable


func initialize(current_view: Callable, open_project: Callable, import_scenario: Callable, save_as: Callable, status: Callable) -> void:
	_current_view = current_view
	_open_project = open_project
	_import_scenario = import_scenario
	_save_as = save_as
	_status = status


func request(action: String) -> void:
	match action:
		"open-project": _open_project.call()
		"import-scenario": _import_scenario.call()
		"save-as": _save_as.call()
		"choose-location":
			var view := _current_view.call() as ProvidencePublishWorkbench
			if view != null: view.choose_destination()
		"return-editor", "cancel": _status.call("Publication recovery cancelled · current edits retained")
