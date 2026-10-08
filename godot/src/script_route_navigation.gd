extends VBoxContainer

signal route_requested(route: String)

const ROUTES := {"AP":"scripts.action-points", "EX":"scripts.macros", "GM":"scripts.global-macros", "SF":"scripts.quests"}
@export var active_route := "scripts.action-points"

func _ready() -> void:
	for key in ROUTES:
		var button: Button = get_node(key)
		button.set_pressed_no_signal(ROUTES[key] == active_route)
		button.pressed.connect(func():
			button.set_pressed_no_signal(ROUTES[key] == active_route)
			if ROUTES[key] != active_route: route_requested.emit(ROUTES[key]))
