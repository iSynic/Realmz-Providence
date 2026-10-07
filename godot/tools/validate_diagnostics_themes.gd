extends SceneTree

func _initialize() -> void: call_deferred("_run")
func _run() -> void:
	root.size=Vector2i(1600,900)
	for scene in ["issues_workbench","decoded_records_workbench","source_evidence_workbench"]:
		var view=load("res://src/%s.tscn" % scene).instantiate();root.add_child(view)
		for mode in ["dark","light","high-contrast"]:
			for density in ["balanced","compact"]:
				view.set_appearance(mode,density);view.size=Vector2(1496,766)
				await create_timer(.15).timeout
				assert(view.get_combined_minimum_size().x<=1496,"Diagnostic scene overflows compact width")
				var colors:Array=preload("res://src/item_theme.gd").ITEM_COLORS[mode]
				assert(_contrast(Color(colors[3]),Color(colors[0]))>=4.5,"Body text contrast")
				assert(_contrast(Color(colors[4]),Color(colors[0]))>=4.5,"Secondary text contrast")
		view.queue_free();await process_frame
	print("PROVIDENCE_DIAGNOSTICS_THEMES_OK three-scenes six-combinations compact-geometry contrast no-visual-acceptance-claim");quit()

func _contrast(first: Color, second: Color) -> float:
	var a:=_luminance(first);var b:=_luminance(second)
	return (maxf(a,b)+.05)/(minf(a,b)+.05)
func _luminance(color: Color) -> float:
	var values:=PackedFloat64Array()
	for channel in [color.r,color.g,color.b]: values.append(channel/12.92 if channel<=.04045 else pow((channel+.055)/1.055,2.4))
	return values[0]*.2126+values[1]*.7152+values[2]*.0722
