extends SceneTree

var _samples: Array[float] = []
var _cold: Array[float] = []


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var args := OS.get_cmdline_user_args()
	assert(args.size() == 1)
	var host := Control.new(); root.add_child(host)
	var view = load("res://src/item_editor.tscn").instantiate(); host.add_child(view)
	var rows: Array = []
	for index in 8:
		rows.append({"identity": "classic.item.%d" % (800 + index), "classicId": 800 + index, "name": "A long identified name that must not hide its metadata", "scope": "scenario", "usedBy": index, "problems": 0})
	view.bind_document({"item": {"id": "classic.item.800", "classicId": 800, "name": "Presentation fixture", "unidentifiedName": "Unknown", "special": [0, 0, 0, 0, 0]}, "revision": 1, "editable": true})
	for size in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = size; root.content_scale_size = size; host.size = size; view.size = size
		for mode in ["dark", "light", "high-contrast"]:
			for density in ["balanced", "compact"]:
				var start := Time.get_ticks_usec()
				view.apply_theme(mode, density)
				await process_frame; await RenderingServer.frame_post_draw
				_cold.append(float(Time.get_ticks_usec() - start) / 1000.0)
				for index in 25:
					start = Time.get_ticks_usec()
					view.show_catalog({"items": rows, "total": 999, "offset": 0})
					await process_frame; await RenderingServer.frame_post_draw
					if index >= 5: _samples.append(float(Time.get_ticks_usec() - start) / 1000.0)
				await _check_geometry(view, size)
	_samples.sort(); _cold.sort()
	var p95 := _samples[ceili(_samples.size() * 0.95) - 1]
	assert(p95 < 100, "Warm visible inventory refresh exceeds the existing 100ms control budget")
	var receipt := {"themes": 3, "densities": 2, "viewports": 2, "samples": _samples, "warmP95Ms": p95, "coldMaximumMs": _cold.back(), "budgetMs": 100, "scope": "Native eight-row inventory refresh to rendered frame; semantic-theme geometry smoke only, no extra visual acceptance."}
	var file := FileAccess.open(args[0], FileAccess.WRITE); file.store_string(JSON.stringify(receipt, "\t")); file.close()
	view.queue_free(); host.queue_free(); await process_frame
	print("PROVIDENCE_ITEM_PRESENTATION_OK themes=3 densities=2 viewports=2 warm-p95-ms=%f" % p95); quit()


func _check_geometry(view: Control, size: Vector2i) -> void:
	assert(view.get_combined_minimum_size().x <= size.x)
	var list = view.get_node("%ItemCollection")
	assert(list.item_count == 8)
	var first: Button = list.get_child(0)
	assert(first.get_node("Margin/Body/Labels/Name").size.x > 100 and first.get_node("Margin/Body/Labels/Context").text.contains("Scenario"))
	first.grab_focus()
	var key := InputEventKey.new(); key.keycode = KEY_DOWN; key.pressed = true
	list._key(key, 0)
	assert(list.get_selected_items() == PackedInt32Array([1]))
	view.set_locked(true); assert(list.get_child(0).disabled)
	view.set_locked(false)
	for section in ["Identity", "Equipment", "Restrictions", "Special"]:
		view.form.show_section(section); await process_frame
		assert(view.form.get_global_rect().end.x <= size.x)
		for name in ["Identity", "Equipment", "Special", "Restrictions"]:
			assert(view.form.get_node("BodyScroll/Sections/" + name).visible)
		assert(view.form.get_node("BodyScroll").scroll_vertical > 0 or section == "Identity")
		assert(Rect2(Vector2.ZERO, Vector2(size)).encloses(view.get_node("%CommitItemEdit").get_global_rect()))
