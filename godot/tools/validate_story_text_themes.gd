extends SceneTree
const SCENES := ["global_macro_editor", "string_editor", "text_export_check", "text_resource_dialog", "new_text_dialog"]
func _initialize() -> void: call_deferred("_run")
func _run() -> void:
    root.size = Vector2i(1600,900)
    root.gui_embed_subwindows = true
    for scene in SCENES:
        var view = load("res://src/%s.tscn" % scene).instantiate()
        if view is Control: view.set_anchors_preset(Control.PRESET_TOP_LEFT)
        root.add_child(view)
        for mode in ["dark","light","high-contrast"]:
            for density in ["balanced","compact"]:
                print("Theme probe: "+scene+" "+mode+" "+density)
                var controls = preload("res://src/story_text_theme.gd").new()
                controls.mode = mode; controls.density = density
                if view.has_method("apply_theme"):
                    view.apply_theme(mode,density)
                else: view.theme = controls
                if view is Window: view.popup_centered(Vector2i(1120,740))
                else: view.size = Vector2(1476,760)
                await create_timer(0.15).timeout
                var body: Control = view.get_child(0) if view is Window else view
                assert(body.get_combined_minimum_size().x <= (1120 if view is Window else 1476),"Theme/density overflows the compact width: " + scene + mode + density)
                if scene == "new_text_dialog":
                    assert(view.get_node("%Create").get_global_rect().end.y <= view.size.y,"Theme/density clipped Create")
                    assert(view.get_node("%Cancel").get_global_rect().end.y <= view.size.y,"Theme/density clipped Cancel")
                var colors: Array = controls.ITEM_COLORS[mode]
                assert(_contrast(Color(colors[3]),Color(colors[0]))>=4.5,"Body text contrast regressed")
                assert(_contrast(Color(colors[4]),Color(colors[0]))>=4.5,"Secondary text contrast regressed")
                if view is Window: view.hide()
        view.queue_free()
        await create_timer(0.15).timeout
    print("PROVIDENCE_STORY_TEXT_THEMES_OK five-scenes six-combinations compact-geometry body-secondary-contrast visible-create-cancel no-visual-acceptance-claim")
    quit()
func _luminance(color: Color) -> float:
    var values := PackedFloat64Array()
    for channel in [color.r,color.g,color.b]: values.append(channel/12.92 if channel<=0.04045 else pow((channel+0.055)/1.055,2.4))
    return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722
func _contrast(first: Color, second: Color) -> float:
    var a := _luminance(first);var b := _luminance(second)
    return (maxf(a,b)+0.05)/(minf(a,b)+0.05)
