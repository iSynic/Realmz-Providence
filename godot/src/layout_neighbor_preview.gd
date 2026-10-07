extends Button

signal map_activated(target: Dictionary)
signal cell_selected(target: Dictionary)
var appearance: Dictionary = {}
# The first click recenters the cross; a double-click still owns that original map.
var _gesture: Dictionary = {}
var _activated := false


func _ready() -> void:
	texture_filter = TEXTURE_FILTER_NEAREST
	for kind in ["normal","hover","pressed","disabled"]: add_theme_stylebox_override(kind,StyleBoxEmpty.new())
	pressed.connect(_accept_selection)
	visibility_changed.connect(func(): if not is_visible_in_tree(): _gesture.clear())


func present(value: Dictionary) -> void:
	if int(_gesture.get("generation",-1))!=int(value.get("generation",-1)): _gesture.clear()
	appearance=value
	icon=value.get("texture")
	set_meta("identity",str(value.get("identity","")))
	set_meta("cell",value.get("cell",Vector2i(-1,-1)))
	tooltip_text=str(value.get("caption",""))+"\n"+str(value.get("reason",""))
	queue_redraw()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index==MOUSE_BUTTON_LEFT:
		if event.double_click:
			_activated=true
			if not _gesture.is_empty(): map_activated.emit(_gesture.duplicate())
			accept_event()
		else:
			_activated=false
			_gesture={} if disabled else appearance.duplicate()
	elif not disabled and event is InputEventKey and event.pressed and not event.echo:
		if event.keycode in [KEY_ENTER,KEY_KP_ENTER]:
			_activated=true; map_activated.emit(appearance.duplicate()); accept_event()
		elif event.keycode==KEY_SPACE: _gesture.clear(); _activated=false


func _accept_selection() -> void:
	if not _activated: cell_selected.emit((_gesture if not _gesture.is_empty() else appearance).duplicate())


func _draw() -> void:
	var rectangle := Rect2(Vector2.ZERO,size)
	draw_rect(rectangle,Color("0a1219"))
	if icon!=null: draw_texture_rect(icon,rectangle,false)
	else:
		var caption := str(appearance.get("state","Select cell"))
		var font := get_theme_default_font()
		var width := font.get_string_size(caption,HORIZONTAL_ALIGNMENT_LEFT,-1,10).x
		draw_string(font,Vector2(maxf(2,(size.x-width)*.5),size.y*.5+4),caption,HORIZONTAL_ALIGNMENT_LEFT,size.x-4,10,Color("9eb1c2"))
	draw_rect(rectangle.grow(-.5),Color("ffd37a") if appearance.get("selected",false) else Color("27313c"),false,2 if appearance.get("selected",false) else .5)
