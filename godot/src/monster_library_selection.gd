extends VBoxContainer

signal clear_requested
signal operation_requested(action: String)
@export var row_scene: PackedScene
var _items: Array = []
var _offset := 0
var _plan: Dictionary = {}
var _loading := false
var copy_enabled := false


func _ready() -> void:
	$Header/CopySelected.pressed.connect(func(): operation_requested.emit("CopySelected"))
	$Header/ReviewMembership.pressed.connect(func(): operation_requested.emit("ReviewMembership"))
	$Header/ClearSelection.pressed.connect(func(): clear_requested.emit())
	$Paging/Previous.pressed.connect(func():
		_offset = maxi(0, _offset - 128)
		_render_page())
	$Paging/Next.pressed.connect(func():
		_offset += 128
		_render_page())


func set_items(items: Array) -> void:
	clear_items()
	_items = items.duplicate(true)
	_render_page()


func _render_page() -> void:
	_clear_rows()
	$Summary.text = "%d Library entries selected. Preparing scenario destinations…" % _items.size()
	$Paging.visible = _items.size() > 128
	$Paging/Previous.disabled = _offset == 0
	$Paging/Next.disabled = _offset + 128 >= _items.size()
	$Paging/PageStatus.text = "%d–%d of %d selected" % [_offset + 1, mini(_offset + 128, _items.size()), _items.size()]
	var page := _items.slice(_offset, _offset + 128)
	for index in page.size():
		if index >= $SelectedRows.get_child_count():
			$SelectedRows.add_child(row_scene.instantiate())
		var row := $SelectedRows.get_child(index) as Control
		row.bind_source(page[index])
		row.show()
	if not _plan.is_empty():
		set_plan(_plan)
	elif _loading:
		begin_plan()


func set_plan(plan: Dictionary) -> void:
	_loading = false
	_plan = plan.duplicate(true)
	$Header/CopySelected.disabled = not copy_enabled or not plan.get("ok", false)
	$Header/ReviewMembership.disabled = $Header/CopySelected.disabled
	for row in $SelectedRows.get_children():
		if row.visible:
			row.get_node("Target").text = "Destination plan unavailable"
	if not bool(plan.get("ok", false)):
		$Summary.text = str(plan.get("error", "Destination plan unavailable."))
		return
	var targets: Dictionary = plan.get("rows", {})
	for row in $SelectedRows.get_children():
		if not row.visible:
			continue
		var target: Dictionary = targets.get(str(row.get_meta("identity")), {})
		if target.is_empty():
			set_plan({"ok": false, "error": "Destination plan no longer matches the selected entries."})
			return
		row.get_node("Target").text = "Monster %d\n%s" % [int(target.targetId), str(target.reason)]
	$Summary.text = "%d entries selected" % targets.size()


func begin_plan() -> void:
	_loading = true
	_plan.clear()
	$Header/CopySelected.disabled = true
	$Header/ReviewMembership.disabled = true
	$Summary.text = "Loading destination plan…"
	for row in $SelectedRows.get_children():
		if row.visible:
			row.get_node("Target").text = "Loading…"


func clear_items() -> void:
	_loading = false
	_items.clear()
	_offset = 0
	_plan.clear()
	$Paging.hide()
	_clear_rows()


func _clear_rows() -> void:
	for child in $SelectedRows.get_children():
		child.hide()
		child.clear_source()
	$Summary.text = ""


func _unhandled_key_input(event: InputEvent) -> void:
	if is_visible_in_tree() and event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		clear_requested.emit()
		get_viewport().set_input_as_handled()
