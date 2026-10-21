extends SceneTree
## Lazy workbench pages: startup realizes only the eager pages; a first visit
## realizes, binds and refreshes a page group once (see lazy-workbench-pages.md).

const Registry = preload("res://src/document_registry.gd")

var _failures: Array[String] = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var shell = load("res://src/editor_shell.tscn").instantiate()
	root.add_child(shell)
	await _settle(shell)
	var documents = shell._documents
	var lazy: Array[String] = []
	for tab in shell._document_tabs.get_tab_count():
		var route: String = documents.identity_for_tab(tab)
		if route in Registry.EAGER_ROUTES: _check(documents.peek(route) != null, "eager page %s was not realized" % route)
		else: lazy.append(route)
	_check(lazy.size() == 36, "expected 36 lazy pages, found %d" % lazy.size())
	for route in lazy:
		_check(documents.peek(route) == null, "%s was realized at startup" % route)
		_check(documents.controller(route) == null, "%s was bound at startup" % route)
		_check(shell._document_changes.needs_refresh(route), "%s is not stale before its first visit" % route)
	_check(not shell._draft_apply.has_any_draft(), "unrealized pages reported a draft")
	shell._workbenches.reset_projection()
	shell._workbenches.clear_vault()

	var realized: Array[String] = []
	documents.realized.connect(func(identity: String, _page: Control): realized.append(identity))
	await shell._navigation.select_route("combat.battles")
	await _settle(shell)
	_check(shell._navigation.current_route() == "combat.battles", "Battles did not open")
	_check(documents.controller("combat.battles") != null, "Battles was not bound on its first visit")
	_check(not shell._document_changes.needs_refresh("combat.battles"), "Battles was not refreshed on its first visit")
	await shell._navigation.select_route("rules.races")
	await _settle(shell)
	for route in ["rules.spells", "rules.races", "rules.castes"]:
		_check(documents.peek(route) != null and documents.controller(route) != null, "%s was not realized with its group" % route)
	await shell._navigation.select_route("combat.battles")
	await _settle(shell)
	_check(realized.count("combat.battles") == 1, "Battles was realized more than once")
	_check(documents.peek("combat.monsters") == null, "Monsters was realized without a visit")
	await _check_script_pages(shell)
	await _check_strings(shell)
	await _check_world_pages(shell)
	await _check_media_pages(shell)
	await _check_items(shell)
	await _check_diagnostics(shell)

	if _failures.is_empty():
		print("PROVIDENCE_LAZY_PAGES_OK startup=eager-only first-visit=bound-and-refreshed group=together revisit=once fan-out=realized-only")
	else:
		push_error("PROVIDENCE_LAZY_PAGES_FAILED " + "; ".join(_failures))
	shell.queue_free()
	await process_frame
	quit(0 if _failures.is_empty() else 1)


# Script and encounter pages bind one at a time: a visit binds only its page, and a
# record opened by navigation realizes its page in the current session.
func _check_script_pages(shell) -> void:
	var documents = shell._documents
	await shell._navigation.select_route("scripts.global-macros")
	await _settle(shell)
	_check(documents.controller("scripts.global-macros") != null, "Global Macros was not bound on its first visit")
	_check(not shell._document_changes.needs_refresh("scripts.global-macros"), "Global Macros was not refreshed on its first visit")
	for route in ["scripts.macros", "scripts.quests", "encounters.simple", "encounters.complex"]:
		_check(documents.peek(route) == null, "%s was realized by another script page" % route)
	var listed: Dictionary = shell._bridge.request("encounter.list-simple", {"offset": 0, "limit": 1})
	var items: Array = listed.get("result", {}).get("items", [])
	_check(not items.is_empty(), "the demo project has no Simple Encounter to open")
	if items.is_empty(): return
	var identity := str(items[0].identity)
	_check(await shell._scripts.open_source("simple-encounter", identity), "%s did not open before its page was visited" % identity)
	_check(documents.controller("encounters.simple") != null, "opening a Simple Encounter did not bind its page")
	await shell._navigation.select_route("encounters.simple")
	await _settle(shell)
	_check(str(documents.peek("encounters.simple").current_encounter().get("identity", "")) == identity, "the opened Simple Encounter was lost on its first visit")


# Strings binds on its first visit and joins the open session.
func _check_strings(shell) -> void:
	await shell._navigation.select_route("text.messages")
	await _settle(shell)
	var strings: Control = shell._documents.peek("text.messages")
	_check(shell._documents.controller("text.messages") != null, "Strings was not bound on its first visit")
	_check(strings != null and strings.total_messages() > 0, "Strings did not load the session's messages on its first visit")


# Layout and Player Maps bind their workbench controllers, World section bars and
# the Player Maps tool window on first visit.
func _check_world_pages(shell) -> void:
	for route in ["maps.layout", "player-maps.map-records"]:
		await shell._navigation.select_route(route)
		await _settle(shell)
		_check(shell._documents.controller(route) != null, "%s was not bound on its first visit" % route)
		_check(not shell._document_changes.needs_refresh(route), "%s was not refreshed on its first visit" % route)
	_check(shell._maps.context_tools.windows._tools.has("player"), "the Player Maps tool window was not registered")


# Media pages bind one at a time, and the Special Land catalog joins the open session.
func _check_media_pages(shell) -> void:
	await shell._navigation.select_route("assets.icons")
	await _settle(shell)
	_check(shell._documents.controller("assets.icons") != null, "Icons was not bound on its first visit")
	_check(not shell._document_changes.needs_refresh("assets.icons"), "Icons was not refreshed on its first visit")
	for route in ["assets.pictures", "assets.sounds", "maps.special-land"]:
		_check(shell._documents.peek(route) == null, "%s was realized by another media page" % route)
	await shell._navigation.open_special_land(true)
	await _settle(shell)
	_check(shell._documents.controller("maps.special-land") != null, "Special Land was not bound on its first visit")
	_check(shell._maps.world_special._bridge != null, "the Special Land catalog did not join the open session")


# Items keeps the project's save state while unrealized and shows it on its first visit.
func _check_items(shell) -> void:
	shell._project_became_dirty()
	await shell._navigation.select_route("economy.items")
	await _settle(shell)
	var items: Control = shell._documents.peek("economy.items")
	_check(shell._documents.controller("economy.items") != null, "Items was not bound on its first visit")
	_check(items != null and items.get_node("%SaveNotice").visible, "Items lost the project's unsaved state before its first visit")


# Issues joins the open session on its first visit; its linked diagnostic pages stay unrealized.
func _check_diagnostics(shell) -> void:
	_check(shell._documents.peek("linter.issues") == null, "tab changes realized Issues")
	await shell._navigation.select_route("linter.issues")
	await _settle(shell)
	var issues: Control = shell._documents.peek("linter.issues")
	_check(issues != null and issues.state._bridge != null, "Issues did not join the open session on its first visit")
	for route in ["records.decoded-records", "records.evidence"]:
		_check(shell._documents.peek(route) == null, "%s was realized by Issues" % route)


func _settle(shell) -> void:
	var deadline := Time.get_ticks_msec() + 15000
	var stable := 0
	while Time.get_ticks_msec() < deadline and stable < 4:
		await process_frame
		var idle: bool = shell._session_view.context().connected and not shell._operations.busy and not shell._bridge.operation_busy()
		stable = stable + 1 if idle else 0


func _check(condition: bool, message: String) -> void:
	if not condition: _failures.append(message)
