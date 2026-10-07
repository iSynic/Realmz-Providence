extends VBoxContainer

signal record_selected(result: Dictionary)
signal rows_changed

const RowScene = preload("res://src/monster_inventory_row.tscn")
const SET_NAMES := {0: "Normal", 1: "Monster", -1: "Mega"}

@onready var _rows: VBoxContainer = %Rows
@onready var _search: LineEdit = %ScenarioSearch
@onready var _status: Label = %CatalogStatus
@onready var _previous: Button = %Previous
@onready var _next: Button = %Next
@onready var _delay: Timer = %SearchDelay

var _state
var _scenario_available := false
var _selection := ButtonGroup.new()
var _can_drop: Callable
var _drop: Callable


func configure_drop_target(can_drop: Callable, drop: Callable) -> void:
	_can_drop = can_drop
	_drop = drop
	for surface: Control in [self, $InventoryScroll, _rows]:
		surface.set_drag_forwarding(Callable(), can_drop, drop)


func _ready() -> void:
	_search.editable = false
	_search.text_changed.connect(func(_text: String):
		if _state != null: _state.cancel_pending_read()
		_delay.start())
	_search.text_submitted.connect(func(_text: String): _run_search())
	_delay.timeout.connect(_run_search)
	_previous.pressed.connect(_page.bind(-128))
	_next.pressed.connect(_page.bind(128))


func bind_state(state, scenario_available := true) -> void:
	_delay.stop()
	_state = state
	_scenario_available = state != null and scenario_available
	_search.editable = _scenario_available
	if state == null:
		_search.text = ""
		render_catalog()
		return
	_search.text = str(state.query)
	render_catalog()


func render_catalog() -> void:
	rows_changed.emit()
	for child in _rows.get_children():
		_rows.remove_child(child)
		child.queue_free()
	_previous.disabled = true
	_next.disabled = true
	if not _scenario_available:
		_status.text = "No scenario open."
		return
	if not str(_state.error).is_empty():
		_status.text = str(_state.error)
		return
	var page: Dictionary = _state.catalog
	var items: Array = page.get("items", [])
	var start := int(page.get("offset", 0))
	var total := int(page.get("total", 0))
	_status.text = "%d monsters · %d–%d shown" % [total, start + 1, start + items.size()] if not items.is_empty() else "No matching scenario monsters."
	_previous.disabled = start == 0
	_next.disabled = start + items.size() >= total or items.is_empty()
	for item: Dictionary in items:
		var row := RowScene.instantiate() as Button
		_rows.add_child(row)
		row.button_group = _selection
		row.set_meta("native_id", int(item.nativeId))
		if item.has("iconId"):
			row.set_meta("icon_id", int(item.iconId))
		var name_label := row.get_node("Contents/Facts/Name") as Label
		name_label.text = str(item.get("displayName", ""))
		var facts := "ID %d, HD %d, armor %d, agility %d, icon %d" % [item.nativeId, item.get("hitDice", 0), item.get("armor", 0), item.get("agility", 0), item.get("iconId", 0)]
		(row.get_node("Contents/Facts/Summary") as Label).text = facts
		var names: PackedStringArray = []
		for available in item.get("availableSets", []):
			names.append(str(SET_NAMES.get(int(available), "Unknown")))
		var badges := row.get_node("Contents/Facts/SetBadges")
		badges.set_availability(item.get("availableSets"), int(_state.set_id))
		badges.show()
		row.tooltip_text = "%s\n%s\nAvailable sets: %s" % [name_label.text, facts, ", ".join(names)]
		row.pressed.connect(_open.bind(int(item.nativeId)))
		row.set_drag_forwarding(Callable(), _can_drop, _drop)


func _run_search() -> void:
	_delay.stop()
	if not _scenario_available:
		return
	var response: Dictionary = await _state.search(_search.text)
	if response.get("busy", false) and not response.get("outcomeUnknown", false):
		_delay.start()
		return
	render_catalog()


func set_selection_active(active: bool) -> void:
	for row: Button in _rows.get_children():
		row.set_pressed_no_signal(active and _state != null and int(row.get_meta("native_id")) == int(_state.native_id))


func _page(delta: int) -> void:
	if not _scenario_available:
		return
	await _state.load_page(int(_state.offset) + delta)
	render_catalog()


func _open(native_id: int) -> void:
	var response: Dictionary = await _state.open_record(native_id)
	if not bool(response.get("ok", false)):
		_status.text = str(_state.error)
	record_selected.emit(response)
