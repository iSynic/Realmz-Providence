extends HBoxContainer

signal route_requested(route: String)

const ROUTES := {"TreasureTab": "economy.treasure", "ItemsTab": "economy.items", "ShopsTab": "economy.shops"}
var _current := ""


func configure(current: String) -> void:
	_current = current
	for name: String in ROUTES:
		var button: Button = get_node(name)
		button.set_pressed_no_signal(ROUTES[name] == current)
		button.disabled = false


func set_counts(counts: Dictionary) -> void:
	for name: String in ROUTES:
		var button: Button = get_node(name)
		var label := name.trim_suffix("Tab")
		button.text = "%s  %d" % [label, int(counts[ROUTES[name]])] if counts.has(ROUTES[name]) else label


func _ready() -> void:
	for name: String in ROUTES:
		get_node(name).pressed.connect(_request_route.bind(ROUTES[name]))
	visibility_changed.connect(func(): configure(_current))


func _request_route(route: String) -> void:
	# Pressed state describes the open document, including a canceled or busy transition.
	configure(_current)
	if route != _current: route_requested.emit(route)
