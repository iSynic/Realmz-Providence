extends GridContainer

signal changed
var scope := "current-map"
var _locked := false
var _counts := {}
const SCOPES := {"current-map": "CurrentMap", "all": "All", "reusable": "Reusable", "warnings": "Warnings"}


func _ready() -> void:
	for key in SCOPES: get_node(SCOPES[key]).pressed.connect(_select_scope.bind(key))
	$StatusFilters.pressed.connect(_open)
	%CatalogStatusFields.changed.connect(func(_filters): _render(); changed.emit())
	$ResetStatus.pressed.connect(func(): %CatalogStatusFields.reset())
	_render()


func filters() -> Dictionary: return %CatalogStatusFields.filters()


func restore(value: Dictionary) -> void:
	scope = str(value.get("filter", "current-map"))
	var restored: Dictionary = value.get("activationFilters", {})
	if scope == "active": scope = "all"; restored = {"chance": "positive"}
	%CatalogStatusFields.set_filters(restored)
	_render()


func map_count(fallback: int) -> int: return int(_counts.get("current-map", fallback))


func present(counts: Dictionary) -> void:
	_counts = counts.duplicate()
	_render()


func set_locked(locked: bool) -> void:
	_locked = locked
	for key in SCOPES: get_node(SCOPES[key]).disabled = locked
	$ResetStatus.disabled = locked
	%CatalogStatusFields.set_locked(locked)
	$StatusFilters.tooltip_text = "Apply or discard this AP draft before changing filters." if locked else "Filter applied AP state within the current scope and search."


func _select_scope(value: String) -> void:
	if _locked: return
	scope = value
	_render()
	changed.emit()


func _open() -> void:
	var point: Vector2 = $StatusFilters.global_position + Vector2(0, $StatusFilters.size.y)
	var window_size := get_window().size
	%CatalogStatusPopup.popup(Rect2i(Vector2i(mini(int(point.x), window_size.x - 380), mini(int(point.y), window_size.y - 310)), Vector2i(370, 300)))


func _render() -> void:
	for key in SCOPES:
		get_node(SCOPES[key]).button_pressed = scope == key
		get_node(SCOPES[key]).text = "%s  %d" % [key.to_upper(), int(_counts.get(key, 0))]
	var count: int = %CatalogStatusFields.active_count()
	$StatusFilters.text = "Status filters…" if count == 0 else "Status filters · %d" % count
	$ResetStatus.visible = count > 0
