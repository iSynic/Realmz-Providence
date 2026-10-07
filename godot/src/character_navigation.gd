extends HBoxContainer

signal route_requested(identity: String)

const ROUTES := {"Spells": "rules.spells", "Races": "rules.races", "Castes": "rules.castes"}
var _current := ""
var _locked := false


func _ready() -> void:
	for name: String in ROUTES:
		get_node(name).pressed.connect(_request.bind(ROUTES[name]))


func configure(current: String) -> void:
	_current = current
	set_locked(_locked)


func set_locked(locked: bool) -> void:
	_locked = locked
	for name: String in ROUTES:
		var button: Button = get_node(name)
		var selected: bool = ROUTES[name] == _current
		button.set_pressed_no_signal(selected)
		button.disabled = locked or selected
		button.theme_type_variation = "ItemCurrentRoute" if selected else ""


func _request(identity: String) -> void:
	set_locked(_locked)
	if not _locked and identity != _current: route_requested.emit(identity)
