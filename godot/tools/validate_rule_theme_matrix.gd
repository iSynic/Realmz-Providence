extends SceneTree

func _initialize() -> void: run.call_deferred()

func run() -> void:
	var rows: Array[Dictionary] = []
	for width in [1600, 1920]:
		root.size = Vector2i(width, 900 if width == 1600 else 1080)
		root.content_scale_size = root.size
		for kind in ["race", "caste"]:
			var view = load("res://src/" + kind + "_editor.tscn").instantiate()
			root.add_child(view)
			view.size = Vector2(width - 76, root.size.y - 116)
			await process_frame
			for mode in ["dark", "light", "high-contrast"]:
				for density in ["balanced", "compact"]:
					view.apply_theme(mode, density)
					for button in view.get_node("%SectionTabs").get_children():
						view.show_section(str(button.get_meta("section")))
						await process_frame; await process_frame
						if view.get_combined_minimum_size().x > view.size.x:
							push_error("Rule theme exceeds certified width: " + kind + "/" + mode + "/" + density); quit(1); return
						var scroll = view.get_node("%RuleDetailScroll")
						for page in view.form.get_children():
							if page.visible and page.get_combined_minimum_size().x > scroll.size.x:
								push_error("Rule section requires horizontal clipping: " + str(page.name)); quit(1); return
					rows.append({"route": view.route_identity(), "viewport": [width, root.size.y], "theme": mode,
						"density": density, "sections": view.get_node("%SectionTabs").get_child_count()})
			view.queue_free(); await process_frame
	var args := OS.get_cmdline_user_args()
	if args.size() > 1: quit(1); return
	if args.size() == 1:
		FileAccess.open(args[0], FileAccess.WRITE).store_string(JSON.stringify({"status": "passed", "cases": rows,
			"scope": "All section geometry at six theme/density combinations and both sizes; visual acceptance remains dark/balanced."}, "\t"))
	print("RULE_THEME_MATRIX_OK routes=2 viewports=2 themes=3 densities=2 sections=all"); quit()
