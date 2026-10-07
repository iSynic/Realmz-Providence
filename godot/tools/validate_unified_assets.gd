extends SceneTree

const Fixture = preload("res://tools/assets/fixture_bridge.gd")
var workbench: Control
var bridge: RefCounted
var panel: Control


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(1600, 900); root.gui_embed_subwindows = true
	create_timer(30).timeout.connect(func(): push_error("Unified asset checks timed out"); quit(1))
	workbench = load("res://src/unified_assets_editor.tscn").instantiate()
	root.add_child(workbench); workbench.size = Vector2(1480, 800)
	bridge = Fixture.new()
	var image := Image.create(1, 1, false, Image.FORMAT_RGBA8); image.fill(Color.WHITE)
	bridge.png = Marshalls.raw_to_base64(image.save_png_to_buffer())
	panel = workbench.get_node("%Gallery")
	await workbench.reload(bridge)
	await _browse()
	await _filters_and_paging()
	await _failure_and_return()
	await _uses()
	var applied: Array = []
	workbench.artwork_applied.connect(func(projection, index): applied.append([projection, index]))
	await preload("res://tools/assets/item_context_checks.gd").run(workbench, bridge, applied)
	workbench.queue_free(); await process_frame
	await preload("res://tools/assets/preview_checks.gd").run(self, bridge)
	bridge.stop()
	print("PROVIDENCE_UNIFIED_ASSETS_OK bounded-gallery scopes protected-collections contextual-acceptance failure-return exact-uses full-media-previews")
	quit()


func _browse() -> void:
	assert(workbench.get_node("Header").get_parent() == workbench)
	for viewport in [Vector2(1480, 800), Vector2(1800, 980)]:
		workbench.size = viewport; await process_frame
		assert(workbench.get_combined_minimum_size().x <= viewport.x)
	for scope in ["scenario", "stock", "personal"]:
		await workbench.show_scope(scope)
		assert(panel.get_node("%Gallery").item_count == 1)
		await panel._select(0)
		assert(panel.get_node("%Preview").texture != null)
		assert(panel.get_node("%UseStock").disabled)
		assert(workbench.get_node("%Import").visible == (scope != "stock"))
		assert(workbench.get_node("%Bag").is_visible_in_tree())
	for collection in ["bag-item", "vault-icon"]:
		await workbench._supplied(collection, collection)
		assert(panel.visible and not workbench.get_node("%Supplied").visible)
		await panel._select(0)
		assert(panel.selection_context().scope == "supplied")
		assert(panel.get_node("%Rename").disabled and panel.get_node("%Remove").disabled)
	for call: Dictionary in bridge.calls:
		assert(call.method.ends_with(".list") or call.method.ends_with(".preview") or call.method.ends_with(".collections") or call.method.ends_with(".describe") or call.method == "personal-library.open")


func _filters_and_paging() -> void:
	await workbench.show_scope("scenario")
	await panel.show_kind("picture")
	assert(panel.selected_asset_kind() == "picture")
	panel._operations.busy = true
	await panel.show_kind("sound")
	assert(panel.selected_asset_kind() == "picture")
	var kind: OptionButton = panel.get_node("BrowseInset/Browse/FilterInset/Filters/Kind")
	kind.select(4); await panel._kind_selected(4)
	assert(kind.get_item_metadata(kind.selected) == "picture")
	panel._operations.busy = false
	panel.get_node("%Search").text = "no results"
	await panel.reload(bridge)
	assert(panel.get_node("%Gallery").item_count == 0 and panel.get_node("%Preview").texture == null)
	assert(panel.get_node("%OpenPreview").disabled)
	assert(panel.get_node("%ReplaceScenario").disabled and panel.get_node("%AddToLibrary").disabled)
	panel.get_node("%Search").text = ""; bridge.catalog_total = 63
	await panel.reload(bridge)
	assert(panel.get_node("%Gallery").item_count == 25)
	assert(panel.get_node("%Paging/Previous").disabled and not panel.get_node("%Paging/Next").disabled)
	await panel._load_page(25)
	assert(panel.get_node("%Gallery").item_count == 25 and not panel.get_node("%Paging/Previous").disabled)
	await panel._load_page(50)
	assert(panel.get_node("%Gallery").item_count == 13 and panel.get_node("%Paging/Next").disabled)
	bridge.catalog_total = 1
	await panel.reload(bridge)
	await panel.set_icons_only(true)
	assert(panel.selected_asset_kind() == "icon")
	await panel.set_icons_only(false)
	assert(panel.selected_asset_kind() == "all")


func _failure_and_return() -> void:
	await workbench.show_scope("scenario")
	panel.get_node("%Search").text = "Ruby"
	await panel.reload(bridge); await panel._select(0)
	var state: Dictionary = workbench.read_navigation_state()
	bridge.failed_method = "project-asset.list"
	await panel.reload(bridge)
	assert(panel.get_node("%Gallery").item_count == 1 and panel.get_node("%Preview").texture != null)
	assert(panel.get_node("%EditResource").disabled and panel.get_node("%Status").text.contains("unavailable"))
	assert(panel.get_node("%ReplaceScenario").disabled and panel.get_node("%AddToLibrary").disabled and panel.get_node("%OpenPreview").disabled)
	bridge.failed_method = ""
	assert(await workbench.restore_navigation_state(state))
	assert(panel.get_node("%Search").text == "Ruby" and panel.selected_asset_identity() == "Scenario Ruby")
	panel.set_authoring_locked(true)
	await panel._select(0)
	assert(panel.get_node("%EditResource").disabled and panel.get_node("%ReplaceScenario").disabled)
	assert(not panel.get_node("%OpenPreview").disabled)
	panel.set_authoring_locked(false)


func _uses() -> void:
	var opened: Array = []
	var sources: Array = []
	workbench.set_item_opener(func(identity): opened.append(identity))
	workbench.set_source_opener(func(reference): sources.append(reference))
	var menu = panel.get_node("%ItemUsesMenu")
	await menu.show_uses(bridge, "Scenario Ruby", panel.get_node("%FindScenarioUses"))
	await menu._activate(0)
	assert(opened == ["classic.item.800"])
	bridge.changed_use = true; bridge.mixed_uses = true
	await menu.show_uses(bridge, "Scenario Ruby", panel.get_node("%FindScenarioUses"))
	bridge.changed_use = false
	await menu._activate(0)
	assert(sources.is_empty() and menu.is_item_disabled(0))
	await menu.show_uses(bridge, "Scenario Ruby", panel.get_node("%FindScenarioUses"))
	for index in 3: await menu._activate(index)
	assert(sources.size() == 3)
	bridge.mixed_uses = false; bridge.paged_uses = true
	await menu.show_uses(bridge, "Scenario Ruby", panel.get_node("%FindScenarioUses"))
	assert(menu._rows.size() == 32)
	await menu._activate(100); await menu._activate(0)
	assert(opened == ["classic.item.800", "classic.item.832"])
	bridge.paged_uses = false
	await workbench.show_scope("stock")
	assert(menu._rows.is_empty())
