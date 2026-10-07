extends SceneTree

var _land: ProvidenceLandEditor
var _filters: Control
var _regions: Array = []


func _initialize() -> void: call_deferred("_run")


func _run() -> void:
	root.gui_embed_subwindows=true
	root.size=Vector2i(1600,900)
	_land=preload("res://src/land_editor.tscn").instantiate()
	root.add_child(_land)
	_land.size=Vector2(1200,820)
	await process_frame
	_filters=_land.get_node("%MapViewFilters")
	for slot in 20: _regions.append({"identity":"land:0:rect:%d" % slot,"left":slot,"top":2,"right":slot+10,"bottom":12})
	_land.document_identity="land:0"
	var tiles: Array=[]; tiles.resize(8100); tiles.fill(1)
	_land.set_document(tiles,[])
	_land.get_node("%RandomRegionOverlay").set_document("land:0",_regions)
	_land.set_view_projection({"map":{"identity":"land:0","runtime":{"randomRectangles":_regions}},"viewOverlays":{"playerMaps":[{"identity":"player-map:0","nativeId":0,"name":"Town","left":3,"top":4,"right":23,"bottom":24}]}})
	var before: Dictionary = _land.get_node("%LandMapCanvas").selected_cell()
	await _granular()
	await _popup()
	await _theme_bounds()
	_profile_controls()
	assert(_land.get_node("%LandMapCanvas").selected_cell()==before)
	_filters.state.set_flag("randomRectangles",true)
	_land.document_identity="land:1"
	_land.set_view_projection({"map":{"identity":"land:1","runtime":{}},"viewOverlays":{}})
	assert(_filters.state.entries.randomRectangles.is_empty() and _filters.get_node("%RandomAreasFilter").disabled)
	assert(not _filters.state.restore_navigation_state({"identity":"land:0"}))
	_land.set_view_projection({})
	assert(not _filters.get_node("%MapOverlayPopup").visible and _filters.get_node("%MapOverlayButton").disabled)
	_land.free()
	print("PROVIDENCE_WORLD_VIEW_FILTERS_OK twenty-rows bounded-scroll mixed-all last-off individual-on unavailable-context keyboard escape close focus view-only stale-restore")
	quit()


func _granular() -> void:
	var checkbox: CheckBox = _filters.get_node("%RandomAreasFilter")
	checkbox.button_pressed=true
	assert(_filters.state.visible_entries("randomRectangles").size()==20)
	_filters.state.set_all(false)
	var key := str(_regions[7].identity)
	_filters.state.set_entry("randomRectangles",key,true)
	assert(_filters.state.visible_entries("randomRectangles")==[_regions[7]])
	checkbox.button_pressed=false
	assert(_filters.state.visible_entries("randomRectangles").size()==20,"Mixed group acceptance must select all.")
	_filters.state.set_flag("randomRectangles",false)
	_filters.state.set_entry("randomRectangles",key,true)
	_filters.state.set_entry("randomRectangles",key,false)
	assert(not _filters.state.flags.randomRectangles and not _land.get_node("%RandomRegionOverlay").visible)
	_filters.state.set_entry("randomRectangles",key,true)
	var saved: Dictionary = _filters.state.read_navigation_state()
	_filters.state.set_flag("randomRectangles",true)
	assert(_filters.state.restore_navigation_state(saved))
	assert(_land.get_node("%RandomRegionOverlay").visible_ids.keys()==[key])
	assert(_filters.get_node("%PlayerMapsFilter").disabled==false)
	_filters.state.set_all(false)
	assert(_filters.get_node("%PlayerMapEntries").get_child_count()==1)
	assert(not _filters.get_node("%PlayerMapUnavailable").visible)


func _popup() -> void:
	_filters.open_menu()
	await process_frame
	assert(_filters.get_node("%MapOverlayPopup").visible)
	assert(_filters.get_node("%OverlayShowAll").has_focus())
	await _popup_key(KEY_TAB)
	assert(_filters.get_node("%OverlayHideAll").has_focus())
	await _popup_key(KEY_TAB,true)
	assert(_filters.get_node("%OverlayShowAll").has_focus())
	assert(_filters.get_node("%RandomEntries").get_child_count()==20)
	assert(_filters.get_node("%RandomEntryScroll").size.y<=100)
	_filters.get_node("%OverlayHideAll").grab_focus()
	var key := InputEventKey.new(); key.keycode=KEY_SPACE; key.physical_keycode=KEY_SPACE; key.pressed=true
	_filters.get_node("%MapOverlayPopup").push_input(key)
	key=key.duplicate(); key.pressed=false
	_filters.get_node("%MapOverlayPopup").push_input(key)
	await process_frame
	assert(not _filters.state.flags.realTiles)
	var escape := InputEventKey.new(); escape.keycode=KEY_ESCAPE; escape.pressed=true
	_filters.get_node("%MapOverlayPopup").window_input.emit(escape)
	await process_frame
	assert(not _filters.get_node("%MapOverlayPopup").visible)
	assert(_filters.get_node("%MapOverlayButton").has_focus())


func _popup_key(code: Key, shift := false) -> void:
	for pressed in [true,false]:
		var event := InputEventKey.new(); event.keycode=code; event.pressed=pressed; event.shift_pressed=shift
		_filters.get_node("%MapOverlayPopup").push_input(event)
		await process_frame


func _theme_bounds() -> void:
	var panel: PopupPanel = _filters.get_node("%MapOverlayPopup")
	var theme: Theme = panel.theme
	for mode in ["dark","light","high-contrast"]:
		for density in ["balanced","compact"]:
			theme.mode=mode; theme.density=density
			_filters.open_menu(); await process_frame
			assert(panel.get_theme_stylebox("panel").bg_color.a==1.0,"Map artwork must not show through the menu.")
			assert(panel.size.y<=650 and panel.size.x<=396,"Overlay controls must stay bounded in every theme and density.")
			_filters.close_menu()
	theme.mode="dark"; theme.density="balanced"


func _profile_controls() -> void:
	var samples: Array=[]
	for index in 40:
		var start := Time.get_ticks_usec()
		_filters.state.set_flag("randomRectangles",index%2==0)
		samples.append((Time.get_ticks_usec()-start)/1000.0)
	samples.sort()
	assert(float(samples.back())<125.0,"Local overlay controls blocked the UI thread beyond 125 ms.")
	print("WORLD_VIEW_LOCAL_CONTROLS samples=40 medianMs=%.3f maximumMs=%.3f boundary=synchronous-control-update-excludes-render-and-adapter" % [samples[20],samples.back()])
