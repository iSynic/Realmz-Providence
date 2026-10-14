extends VBoxContainer

signal changed(filters: Dictionary)
const VALUES := {"chance": ["all", "positive", "nonpositive"], "marker": ["all", "present", "absent", "unavailable"], "precedence": ["all", "shadowed", "first"], "checks": ["all", "detected", "unknown"]}
const LABELS := {"chance": ["All", "Positive (> 0)", "Nonpositive (≤ 0)"], "marker": ["All", "Present", "Absent", "Unavailable"], "precedence": ["All", "Earlier AP takes precedence", "First at coordinate"], "checks": ["All", "Check / branch steps", "Unknown instructions"]}
var _filters := {"chance": "all", "marker": "all", "precedence": "all", "checks": "all"}
var _controls := {}


func _ready() -> void:
	_controls = {"chance": %Chance, "marker": %Marker, "precedence": %Precedence, "checks": %Checks}
	for key in _controls:
		for label in LABELS[key]: _controls[key].add_item(label)
		_controls[key].item_selected.connect(func(index): _filters[key] = VALUES[key][index]; _render(); changed.emit(filters()))
	%Reset.pressed.connect(reset)
	_render()


func filters() -> Dictionary: return _filters.duplicate()


func set_filters(value: Dictionary) -> void:
	for key in VALUES: _filters[key] = str(value.get(key, "all")) if VALUES[key].has(str(value.get(key, "all"))) else "all"
	if is_node_ready(): _render()


func reset() -> void:
	set_filters({})
	changed.emit(filters())


func active_count() -> int:
	return _filters.values().filter(func(value): return value != "all").size()


func set_locked(locked: bool) -> void:
	for control in _controls.values(): control.disabled = locked
	%Reset.disabled = locked
	%Hint.text = "Apply or discard this AP draft before changing filters." if locked else "Applied state · filters intersect. Program checks may still prevent later effects."


func _render() -> void:
	for key in _controls: _controls[key].select(VALUES[key].find(_filters[key]))
	%Reset.visible = active_count() > 0
