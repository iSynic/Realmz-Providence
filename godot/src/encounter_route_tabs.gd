class_name ProvidenceEncounterRouteTabs
extends PanelContainer

signal route_requested(identity: String)

const ROUTES := {
	"encounters.simple": "SimpleEncounterRoute",
	"encounters.complex": "ComplexEncounterRoute",
	"encounters.rogue": "RogueEncounterRoute",
	"encounters.timed": "TimedEncounterRoute",
}

var _active_route := ""
var _buttons: Dictionary = {}


func _ready() -> void:
	var group := ButtonGroup.new()
	for route: String in ROUTES:
		var button := get_node("Margin/Routes/" + ROUTES[route]) as Button
		button.button_group = group
		button.pressed.connect(_request_route.bind(route))
		button.tooltip_text = "Open " + button.text
		_buttons[route] = button
	present_route("")


func present_route(route: String) -> void:
	_active_route = route
	visible = ROUTES.has(route)
	for identity: String in _buttons:
		var button := _buttons[identity] as Button
		button.set_pressed_no_signal(identity == route)
		button.tooltip_text = "Current encounter type" if identity == route else "Open " + button.text


func active_route() -> String:
	return _active_route


func button_for(route: String) -> Button:
	return _buttons.get(route) as Button


func _request_route(route: String) -> void:
	if route == _active_route:
		return
	# Keep the committed route selected while a draft guard decides whether the
	# requested navigation may proceed.
	present_route(_active_route)
	route_requested.emit(route)
