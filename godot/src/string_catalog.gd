extends ScrollContainer
signal item_selected(index: int)
var _selected := -1
var item_count: int:
    get: return %Rows.get_child_count()
func _ready() -> void: gui_input.connect(_keyboard)
func add_item(text: String) -> int:
    var index := item_count
    var row = preload("res://src/string_catalog_row.tscn").instantiate()
    %Rows.add_child(row)
    set_item_text(index,text)
    row.pressed.connect(func(): grab_focus(); item_selected.emit(index))
    return index
func clear() -> void:
    _selected = -1
    for row in %Rows.get_children(): %Rows.remove_child(row); row.queue_free()
func set_item_text(index: int, text: String) -> void:
    var row: Button = %Rows.get_child(index)
    row.set_meta("text",text)
    row.get_node("Inset/Lines/Name").text = text.get_slice("\n",0)
    row.get_node("Inset/Lines/Context").text = text.get_slice("\n",1).strip_edges()
func get_item_text(index: int) -> String: return str(%Rows.get_child(index).get_meta("text"))
func set_item_tooltip(index: int, text: String) -> void: %Rows.get_child(index).tooltip_text = text
func select(index: int) -> void:
    _selected = index
    for row_index in item_count: (%Rows.get_child(row_index) as Button).set_pressed_no_signal(row_index == index)
func deselect_all() -> void: select(-1)
func get_selected_items() -> PackedInt32Array: return PackedInt32Array([_selected]) if _selected >= 0 else PackedInt32Array()
func ensure_current_is_visible() -> void:
    if _selected >= 0 and _selected < item_count: ensure_control_visible(%Rows.get_child(_selected))
func _keyboard(event: InputEvent) -> void:
    if item_count == 0: return
    var next := _selected
    if event.is_action_pressed("ui_down"): next = mini(item_count-1,_selected+1)
    elif event.is_action_pressed("ui_up"): next = maxi(0,_selected-1)
    elif event.is_action_pressed("ui_accept") and _selected >= 0: item_selected.emit(_selected); accept_event(); return
    else: return
    item_selected.emit(next)
    accept_event()
