extends RefCounted

var _controllers: Array = []

func bind(registry, operations, navigation, read_context: Callable, read_bridge: Callable, accept_draft: Callable, projection: Callable) -> void:
	for route in ["rules.races", "rules.castes"]:
		var view: ProvidenceRuleAuthoringEditor = registry.view(route)
		var controller = preload("res://src/rule_workbench_controller.gd").new()
		controller.initialize(view, operations, read_context, read_bridge, accept_draft)
		controller.configure_navigation(navigation.open_script_source, navigation.open_script_target)
		controller.projection_applied.connect(projection)
		view.navigation_requested.connect(func(action: Callable): await navigation.request_authoring_navigation(action, "opening a linked rule destination"))
		registry.register_controller(route, preload("res://src/workbench_controller.gd").new(route, view, controller.reload, controller.teardown))
		_controllers.append(controller)

func teardown() -> void:
	for controller in _controllers: controller.teardown()

func dispose() -> void:
	for controller in _controllers: controller.dispose()
	_controllers.clear()
