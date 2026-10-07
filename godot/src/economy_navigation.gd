extends HBoxContainer

signal route_requested(route: String)

const ROUTES := {"TreasureTab": "economy.treasure", "ItemsTab": "economy.items", "ShopsTab": "economy.shops"}


func configure(current: String) -> void:
	for name: String in ROUTES:
		var button: Button = get_node(name)
		button.set_pressed_no_signal(ROUTES[name] == current)
		button.disabled = ROUTES[name] == current


func set_counts(counts: Dictionary) -> void:
	for name: String in ROUTES:
		var button: Button = get_node(name)
		var label := name.trim_suffix("Tab")
		button.text = "%s  %d" % [label, int(counts[ROUTES[name]])] if counts.has(ROUTES[name]) else label


func _ready() -> void:
	for name: String in ROUTES:
		get_node(name).pressed.connect(route_requested.emit.bind(ROUTES[name]))
