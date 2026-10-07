extends SceneTree

const Catalog = preload("res://src/route_catalog.gd")


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var shell := (load("res://src/editor_shell.tscn") as PackedScene).instantiate() as Control
	root.add_child(shell)
	await _settle(shell)
	var tabs := _verified_tabs(shell)
	await shell._navigation.select_tab(32)
	shell._workbenches.vault.get_node("%VaultSearch").grab_focus()
	await shell._navigation.select_tab(4)
	var restored_focus := root.gui_get_focus_owner()
	if restored_focus == null or not tabs.get_current_tab_control().is_ancestor_of(restored_focus):
		_fail("Returning from Vault must restore focus inside Items without a named-entry mapping")
		return
	for viewport in [Vector2i(1600, 900), Vector2i(1920, 1080)]:
		root.size = viewport
		root.content_scale_size = viewport
		for monster_tab in [30, 31]:
			await shell._navigation.select_tab(3)
			await shell._navigation.select_tab(monster_tab)
			await _settle(shell)
			var combat := shell._domain_navigation.domain_buttons["combat"] as Button
			if str(shell._navigation.active_domain) != "combat" or not combat.button_pressed:
				_fail("Direct Monster navigation retained another activity at %s" % viewport)
				return
		for domain in Catalog.ROUTES:
			var mapped: Array[int] = []
			for route in Catalog.ROUTES[domain]["routes"]:
				if int(route[1]) >= 0:
					mapped.append(int(route[1]))
			if mapped.is_empty():
				continue
			await shell._navigation.select_tab(28 if domain != "scenario" else 4)
			var navigation = shell.get("_domain_navigation")
			var button := navigation.domain_buttons[domain] as Button
			button.grab_focus()
			await _enter()
			await _settle(shell)
			var expected: int = Catalog.tabs_for_domain(domain)[0]
			if domain == "assets":
				expected = shell._assets.library_workbench.get_index()
				if shell._assets.library_workbench._scope != "scenario":
					_fail("Assets activity did not open the shared Scenario scope")
					return
			if tabs.current_tab != expected or str(shell._navigation.active_domain) != domain:
				_fail("%s activity opened tab %d, expected %d at %s" % [domain, tabs.current_tab, expected, viewport])
				return
			for destination in mapped:
				await shell._navigation.select_tab(destination)
				shell._navigation.activate_domain(domain, false)
				button.grab_focus()
				await _enter()
				await _settle(shell)
				var retained_destination: int = shell._assets.library_workbench.get_index() if domain == "assets" else destination
				if tabs.current_tab != retained_destination or str(shell._navigation.active_domain) != domain:
					_fail("%s activity discarded its selected tab %d at %s" % [domain, destination, viewport])
					return
				if destination in [30, 31] and not await _verify_monster(shell, tabs, destination, viewport): return
	shell.queue_free()
	await process_frame
	print("PROVIDENCE_DOMAIN_NAVIGATION_OK viewports=2 scope=mapped-activity-entry-and-retention")
	quit(0)


func _verify_monster(shell: Control, tabs: TabContainer, destination: int, viewport: Vector2i) -> bool:
	var editor := tabs.get_current_tab_control()
	var workbench = editor.get_node("Workbench")
	workbench.form.show()
	await process_frame; await process_frame
	if editor.route_identity() != ("combat.monsters" if destination == 30 else "combat.scrapbook"):
		_fail("Monster route identity is wrong"); return false
	var detail: Control = workbench.get_node("DetailScroll")
	var body: Control = workbench.get_node("DetailScroll/Details")
	# The accepted authoring form owns detail navigation; its width follows the viewport.
	if body.size.x < 600 or body.get_global_rect().end.x > viewport.x + 1 or detail.global_position.x < 0:
		_fail("Monster authoring detail clips at %s: %s" % [viewport, body.get_global_rect()]); return false
	if not workbench.form.is_visible_in_tree():
		_fail("Monster authoring form is not reachable"); return false
	workbench.form.hide()
	return true


func _settle(shell: Control) -> void:
	var deadline := Time.get_ticks_msec() + 30000
	var stable := 0
	while Time.get_ticks_msec() < deadline:
		await process_frame
		stable = stable + 1 if not shell._operations.busy and not shell._bridge.operation_busy() else 0
		if stable >= 4: return
	_fail("Navigation did not settle within its bounded wait")


func _verified_tabs(shell: Control) -> TabContainer:
	var economy_routes := Catalog.ROUTES.economy.routes
	assert(economy_routes.size() == 3)
	assert(economy_routes.all(func(route): return str(route[3]) in ["economy.treasure", "economy.items", "economy.shops"]))
	assert(Catalog.ROUTES.assets.routes.any(func(route): return str(route[3]) == "assets.project-assets"))
	return shell.get("_document_tabs") as TabContainer


func _enter() -> void:
	for down in [true, false]:
		var event := InputEventKey.new()
		event.keycode = KEY_ENTER
		event.pressed = down
		root.push_input(event)
		await process_frame


func _fail(message: String) -> void:
	push_error("PROVIDENCE_DOMAIN_NAVIGATION_FAILED: %s" % message)
	quit(1)
