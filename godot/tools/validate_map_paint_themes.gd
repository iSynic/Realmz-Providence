extends "res://tools/validate_map_paint_resources.gd"


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size()!=1 or not args[0].get_file().begins_with("providence-ui-paint-"): quit(1); return
	var prior := OS.get_environment("PROVIDENCE_PROJECT_PATH")
	OS.set_environment("PROVIDENCE_PROJECT_PATH","")
	root.gui_embed_subwindows=true
	var shell: Control=load("res://src/editor_shell.tscn").instantiate()
	shell.set_script(CheckedShell)
	root.add_child(shell)
	await _frames(3)
	shell._bridge.stop()
	shell._bridge=ResourceBridge.new(args[0].path_join("theme-settings.cfg"))
	var created: Dictionary=shell._bridge.create_project("world-themes",args[0].path_join("theme-project"))
	if _check(created.get("ok",false),"Theme fixture could not create a project"):
		await shell._activate_session(created)
		await _setup(shell)
		_mutate(shell,"map.create",{"levelType":"dungeon"})
		await shell._reload_map_catalog()
		await _measure_routes(shell)
	shell.free()
	await _frames(2)
	OS.set_environment("PROVIDENCE_PROJECT_PATH",prior)
	if not _failed: print("PROVIDENCE_MAP_PAINT_THEMES_OK four-route-layout both-viewports six-catalog-skins readable-heading-contrast no-visual-approval-claim")
	quit(1 if _failed else 0)


func _measure_routes(shell: Control) -> void:
	var view: Control=shell._maps.world_special._view
	view.theme=view.theme.duplicate(true)
	for viewport in [Vector2i(1920,1080),Vector2i(1600,900)]:
		root.size=viewport
		root.content_scale_size=viewport
		for mode in ["dark","light","high-contrast"]:
			for density in ["balanced","compact"]:
				view.theme.mode=mode
				view.theme.density=density
				await _frames(3)
				for route in ["maps.land","maps.dungeon","maps.layout","maps.special-land"]:
					if route=="maps.land": await shell._navigation.open_map("land:1")
					elif route=="maps.dungeon": await shell._navigation.open_map("dungeon:0")
					else: await shell._navigation.select_route(route)
					await _settle(shell)
					var document: Control=shell._documents.view(route)
					_check(document.get_global_rect().end.x<=viewport.x+2 and document.get_global_rect().end.y<=viewport.y+2,
						"World route exceeded viewport in %s/%s: %s viewport=%s bounds=%s minimum=%s" % [mode,density,route,viewport,document.get_global_rect(),document.get_combined_minimum_size()])
				var background: Color=view.get_theme_stylebox("panel","WorldSection").bg_color
				for name in ["SpecialHeading","SpecialName"]:
					var label: Label=view.get_node("%"+name)
					_check(_contrast(label.get_theme_color("font_color"),background)>=4.5,"World catalog heading lost contrast in "+mode)
				_check(view.get_node("%SpecialNext").get_global_rect().end.y<=viewport.y,"Catalog paging footer clipped")


func _luminance(color: Color) -> float:
	var channels: Array=[color.r,color.g,color.b]
	for index in channels.size():
		channels[index]=channels[index]/12.92 if channels[index]<=0.04045 else pow((channels[index]+0.055)/1.055,2.4)
	return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722


func _contrast(first: Color, second: Color) -> float:
	var a:=_luminance(first)
	var b:=_luminance(second)
	return (maxf(a,b)+0.05)/(minf(a,b)+0.05)
