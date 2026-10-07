extends SceneTree

func _initialize() -> void: call_deferred("_run")

func _run() -> void:
	var catalog := ProvidenceDivinityHelpCatalog.new()
	assert(catalog.load_bundled().is_empty())
	assert(catalog.sections.size() == 38 and catalog.entries.size() == 128)
	assert(str(catalog.entry_for_code(-1).get("title", "")) == "Display String")
	assert(not catalog.matching_entries("simple encounter").is_empty())
	assert(not catalog.matching_sections("Result #4").is_empty())
	var origin := Button.new(); root.add_child(origin)
	var helper := load("res://src/divinity_code_helper.tscn").instantiate() as ProvidenceDivinityCodeHelper
	root.add_child(helper); await process_frame
	helper.open_for_code(35, origin, false); await process_frame
	assert("35" in str(helper.get_node("%OriginalName").text))
	assert("Reference only" in str(helper.get_node("%Availability").text))
	var linked_page := [-1]
	helper.manual_requested.connect(func(page): linked_page[0] = page)
	helper.get_node("%OpenManual").pressed.emit()
	assert(linked_page[0] == 6)
	helper.open_for_code(24, origin)
	assert("no step selection" in str(helper.get_node("%Availability").text))
	(helper.get_node("%CodeSearch") as LineEdit).text_changed.emit("simple encounter")
	assert("no step selection" in str(helper.get_node("%Availability").text))
	var manual := load("res://src/divinity_manual_reader.tscn").instantiate() as ProvidenceDivinityManualReader
	root.add_child(manual); await process_frame
	manual.open_page(16, origin); await process_frame
	assert("16 / 38" in str(manual.get_node("%ManualTitle").text))
	assert("-4" in str(catalog.sections[15].text))
	assert(manual.get_node("%ManualPage").page.links.size() >= 2)
	helper.close_helper(); manual.close_reader()
	print("PROVIDENCE_DIVINITY_HELP_OK offline 38-sections 128-entries signed-search links focus-origin")
	quit()
