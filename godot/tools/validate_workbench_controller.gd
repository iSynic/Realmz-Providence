extends SceneTree

const Controller = preload("res://src/workbench_controller.gd")
const Changes = preload("res://src/document_changes.gd")
const Registry = preload("res://src/document_registry.gd")
const Interests = preload("res://src/document_interests.gd")

class DraftView extends Control:
	var draft := false
	func has_unapplied_changes() -> bool:
		return draft
	func discard_draft() -> void:
		draft = false

var _changes := Changes.new()
var _view := DraftView.new()
var _controller: Controller
var _succeed := true
var _calls := 0
var _interrupt := ""
var _context_received: Dictionary = {}


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_check_registry()
	_check_document_interests()
	root.add_child(_view)
	_controller = Controller.new("text.messages", _view, _refresh)
	_changes.register_document("text.messages", ["message"])
	assert((await _controller.activate(_changes)).ok)
	assert(_calls == 1 and not _changes.needs_refresh("text.messages"))
	assert((await _controller.activate(_changes)).ok)
	assert(_calls == 1)
	await _draft_and_failure()
	await _late_invalidation()
	await _check_contextual_refresh()
	_view.free()
	print("PROVIDENCE_WORKBENCH_CONTROLLER_OK registry-aliases drafts failures invalidation-tokens session-generation contextual-refresh")
	quit()


func _check_registry() -> void:
	var tabs: TabContainer = preload("res://src/document_pages.tscn").instantiate()
	root.add_child(tabs)
	var registry := Registry.new()
	registry.initialize(tabs)
	assert(tabs.get_tab_count() == 39)
	assert(registry.view("maps.special-land") == registry.view("assets.special-land"))
	assert(registry.tab_for_route("text.messages") == 0)
	assert(registry.tab_for_route("linter.issues") == 33)
	assert(registry.tab_for_route("linter.readiness") == 34)
	assert(registry.tab_for_route("export.export-plan") == 35)
	assert(registry.tab_for_route("export.benchmark") == 36)
	assert(registry.tab_for_route("records.decoded-records") == 37)
	assert(registry.tab_for_route("records.evidence") == 38)
	assert(registry.view("linter.readiness") != null)
	assert(registry.view("export.export-plan") != null)
	assert(registry.view("export.benchmark") != null)
	assert(registry.tab_for_route("economy.bag") == -1)
	assert(registry.view("assets.decoded-records") == registry.view("records.decoded-records"))
	tabs.free()


func _draft_and_failure() -> void:
	_changes.invalidate({"changedEntities": ["message:2"]}, "project")
	_view.draft = true
	assert(not (await _controller.activate(_changes)).ok and _calls == 1)
	assert(_changes.needs_refresh("text.messages") and _view.draft)
	_controller.discard_draft()
	_succeed = false
	assert(not (await _controller.activate(_changes)).ok)
	assert(_changes.needs_refresh("text.messages"))
	_succeed = true
	assert((await _controller.activate(_changes)).ok)


func _check_document_interests() -> void:
	var changes := Changes.new()
	var routes := ["maps.land", "maps.layout", "maps.special-land", "player-maps.map-records",
		"text.messages", "economy.items", "rules.spells", "combat.monsters", "scenario.contact"]
	for route in routes:
		changes.register_document(route, Interests.for_route(route))
		changes.refreshed(route)
	changes.invalidate({"changedEntities": ["land:9"]}, "project")
	for route in routes:
		assert(changes.needs_refresh(route) == (route in routes.slice(0, 4)), "Terrain invalidated an unrelated view: " + route)
		changes.refreshed(route)
	changes.invalidate({"changedEntities": ["classic.item.17"]}, "project")
	assert(changes.needs_refresh("economy.items") and changes.needs_refresh("combat.monsters"))
	assert(not changes.needs_refresh("maps.land") and not changes.needs_refresh("text.messages"))
	for route in routes: changes.refreshed(route)
	changes.invalidate({"changedEntities": ["special-land.-100"]}, "project")
	assert(changes.needs_refresh("maps.land") and changes.needs_refresh("maps.special-land"))
	assert(not changes.needs_refresh("text.messages"))
	for route in routes: changes.refreshed(route)
	# An absent new reference can mean a link was removed. Its old target's Uses
	# view still depends on the changed source family, not only referenceChanges.
	changes.invalidate({"changedEntities": ["action-point:land:0:4"], "referenceChanges": []}, "project")
	assert(changes.needs_refresh("text.messages"))
	for projection in [{"changedEntities": ["project"]}, {"truncated": true}, {"changedEntities": ["future-family:1"]}]:
		for route in routes: changes.refreshed(route)
		changes.invalidate(projection, "project")
		for route in routes: assert(changes.needs_refresh(route), "A broad or unknown change was missed")


func _late_invalidation() -> void:
	for interruption in ["invalidation", "session", "teardown"]:
		_interrupt = interruption
		_changes.invalidate({"changedEntities": ["message:2"]}, "project")
		assert(not (await _controller.activate(_changes)).ok)
		assert(_changes.needs_refresh("text.messages"))
		_interrupt = ""
		assert((await _controller.activate(_changes)).ok)


func _refresh(_operation: ProvidenceEditorOperation = null) -> Dictionary:
	_calls += 1
	await process_frame
	match _interrupt:
		"invalidation": _changes.invalidate({"changedEntities": ["message:3"]}, "project")
		"session": _controller.attach_session()
		"teardown": _controller.teardown()
	return {"ok": _succeed}


func _check_contextual_refresh() -> void:
	var changes := Changes.new()
	changes.register_document("maps.land", ["land"])
	var controller := Controller.new("maps.land", _view, _refresh_context, Callable(), true)
	var context := {"referencesUnchanged": true, "changedEntities": ["land:0"]}
	assert((await controller.activate(changes, null, context)).ok)
	assert(_context_received == context)


func _refresh_context(_operation: ProvidenceEditorOperation, context: Dictionary) -> Dictionary:
	_context_received = context.duplicate(true)
	return {"ok": true}
