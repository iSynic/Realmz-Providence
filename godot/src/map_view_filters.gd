extends HBoxContainer

signal changed(flags: Dictionary, rectangles: Array, footprints: Array)
var state := preload("res://src/map_view_filter_state.gd").new()
var _controls := {}
var _expanded := {"randomRectangles":true,"playerMaps":true}
var _context_available := false


func _ready() -> void:
	state.changed.connect(_render)
	%MapOverlayButton.pressed.connect(open_menu)
	%OverlayClose.pressed.connect(close_menu)
	%OverlayShowAll.pressed.connect(func(): state.set_all(true))
	%OverlayHideAll.pressed.connect(func(): state.set_all(false))
	%MapOverlayPopup.popup_hide.connect(_restore_focus)
	%MapOverlayPopup.window_input.connect(func(event): if event.is_action_pressed("ui_cancel"): close_menu())
	_controls={"realTiles":%RealTilesFilter,"coordinates":%CoordinatesFilter,"secrets":%SecretsFilter,"combatClearing":%CombatClearingFilter,"actionPoints":%TriggersFilter,"randomRectangles":%RandomAreasFilter,"playerMaps":%PlayerMapsFilter,"smooth":%SmoothFilter}
	for key in _controls: _controls[key].toggled.connect(_toggle_flag.bind(key))
	%RandomExpand.pressed.connect(_toggle_expanded.bind("randomRectangles"))
	%PlayerMapsExpand.pressed.connect(_toggle_expanded.bind("playerMaps"))
	_render()


func set_context(identity: String, rectangles: Array, footprints: Array) -> void:
	if state.identity!=identity: close_menu()
	_context_available=not identity.is_empty()
	state.set_context(identity,rectangles,footprints)


func open_menu() -> void:
	if not _context_available: return
	var point: Vector2 = %MapOverlayButton.global_position + Vector2(0,%MapOverlayButton.size.y)
	var desired := Rect2i(Vector2i(point),Vector2i(396,570))
	desired.position.y=mini(desired.position.y,get_window().size.y-desired.size.y-8)
	desired.position.x=mini(desired.position.x,get_window().size.x-desired.size.x-8)
	%MapOverlayPopup.popup(desired)
	%OverlayShowAll.grab_focus.call_deferred()


func close_menu() -> void: %MapOverlayPopup.hide()


func _restore_focus() -> void:
	if is_visible_in_tree() and not %MapOverlayButton.disabled: %MapOverlayButton.grab_focus()


func _toggle_expanded(group: String) -> void:
	_expanded[group]=not _expanded[group]
	_render_group(group,false)


func _toggle_flag(enabled: bool, key: String) -> void:
	if state.entries.has(key):
		var count: int = state.visible_entries(key).size()
		if count>0 and count<state.entries[key].size(): enabled=true
	state.set_flag(key,enabled)


func _render() -> void:
	if not is_node_ready(): return
	%MapOverlayButton.disabled=not _context_available
	var active := 0
	for key in _controls:
		var enabled := bool(state.flags[key])
		_controls[key].set_pressed_no_signal(enabled)
		_controls[key].disabled=not _context_available or state.entries.has(key) and state.entries[key].is_empty()
		if enabled: active+=1
	%OverlayActiveCount.text="%d active" % active
	_render_group("randomRectangles",true)
	_render_group("playerMaps",true)
	changed.emit(state.flags.duplicate(),state.visible_entries("randomRectangles"),state.visible_entries("playerMaps"))


func _render_group(group: String, rebuild: bool) -> void:
	var list: VBoxContainer = %RandomEntries if group=="randomRectangles" else %PlayerMapEntries
	var count: Label = %RandomEntryCount if group=="randomRectangles" else %PlayerMapEntryCount
	var scroll: ScrollContainer = %RandomEntryScroll if group=="randomRectangles" else %PlayerMapEntryScroll
	var expand: Button = %RandomExpand if group=="randomRectangles" else %PlayerMapsExpand
	var visible_count: int = state.visible_entries(group).size()
	var total: int = state.entries[group].size()
	_controls[group].text=("◩  " if visible_count>0 and visible_count<total else "")+("Random rectangles" if group=="randomRectangles" else "Player Maps")
	count.text="%d of %d visible" % [visible_count,total] if total>0 else "No regions on this map" if group=="randomRectangles" else "No terrain footprints on this map"
	count.tooltip_text="Picture and text maps do not overlay terrain" if group=="playerMaps" and total==0 else ""
	%PlayerMapUnavailable.visible=group=="playerMaps" and total==0 if group=="playerMaps" else %PlayerMapUnavailable.visible
	expand.text="▾" if _expanded[group] else "▸"
	expand.disabled=total==0
	scroll.visible=_expanded[group] and total>0
	if not rebuild: return
	var focus := list.get_viewport().gui_get_focus_owner()
	var focus_key := str(focus.get_meta("entry","")) if focus!=null and list.is_ancestor_of(focus) else ""
	var position := scroll.scroll_vertical
	for child in list.get_children(): list.remove_child(child); child.queue_free()
	for entry: Dictionary in state.entries[group]:
		var button := CheckBox.new()
		var key := str(entry.identity)
		button.name="Entry_"+key.replace(":","_")
		button.text=_entry_caption(group,entry)
		button.tooltip_text=button.text
		button.set_meta("entry",key)
		button.set_pressed_no_signal(state.flags[group] and state.selected[group].has(key))
		button.toggled.connect(func(enabled): state.set_entry(group,key,enabled))
		list.add_child(button)
		if key==focus_key: button.grab_focus.call_deferred()
	scroll.set_deferred("scroll_vertical",position)


func _entry_caption(group: String, entry: Dictionary) -> String:
	if group=="playerMaps": return "Player Map %d · %s" % [int(entry.nativeId),str(entry.name)]
	var slot := str(entry.identity).get_slice(":rect:",1)
	return "Rectangle %s · %d,%d → %d,%d" % [slot,int(entry.left),int(entry.top),int(entry.right),int(entry.bottom)]
