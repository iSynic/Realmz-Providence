class_name ProvidenceDocumentRegistry
extends RefCounted
## Owns the fixed document tabs. Each tab starts as a lazy placeholder and is
## realized, once, into its page the first time `view()` needs it.

signal realized(identity: String, page: Control)

const Routes = preload("res://src/route_catalog.gd")
const LazyPage = preload("res://src/lazy_document_page.gd")
## Pages realized at startup: Action Points, the startup page, and Land and Dungeon,
## around which the map workspace is composed. Every other page is realized on
## first use (see lazy-workbench-pages.md).
const EAGER_ROUTES := ["maps.land", "maps.dungeon", "scripts.action-points"]

var _tabs: TabContainer
var _route_tabs: Dictionary = {}
var _page_identities: Dictionary = {}
var _pages: Dictionary = {}
var _binders: Dictionary = {}
var _groups: Array[Dictionary] = []
var _controllers: Dictionary = {}


func initialize(tabs: TabContainer) -> void:
	_tabs = tabs
	_route_tabs.clear()
	_page_identities.clear()
	_pages.clear()
	_binders.clear()
	_groups.clear()
	_controllers.clear()
	for page in tabs.get_children():
		var identity := str(page.get_meta("route_identity", ""))
		var tab := tabs.get_tab_idx_from_control(page)
		assert(not identity.is_empty() and not _route_tabs.has(identity), "Each document needs one stable route identity")
		assert(Routes.tab_for_route(identity) == tab, "Document scene order must preserve existing route destinations")
		_route_tabs[identity] = tab
		_page_identities[tab] = identity
		if not page is LazyPage: _pages[tab] = page
	# Multiple donor routes may intentionally share one native document.
	for domain in Routes.ROUTES.values():
		for route in domain.routes:
			var tab := int(route[1])
			if tab >= 0: _route_tabs[str(route[3])] = tab
	# Connected before any presentation listener, so the current tab is always a real page.
	if not tabs.tab_changed.is_connected(realize_tab): tabs.tab_changed.connect(realize_tab)


## Realizes a tab's page if it is still a placeholder and returns the tab's page.
func realize_tab(tab: int) -> Control:
	if tab < 0 or tab >= _tabs.get_tab_count(): return null
	if _pages.has(tab): return _pages[tab]
	return _realize(tab) if _tabs.get_tab_control(tab) is LazyPage else _tabs.get_tab_control(tab)


## The page for a route, realized first if it is still a placeholder.
func view(identity: String) -> Control:
	var tab := tab_for_route(identity)
	if tab < 0: return null
	return _pages[tab] if _pages.has(tab) else _realize(tab)


## The page for a route only if it is already realized; never creates one.
func peek(identity: String) -> Control:
	return _pages.get(tab_for_route(identity))


## Runs `binder(page)` once when the route's page is realized, or now if it already is.
func on_realize(identity: String, binder: Callable) -> void:
	var page := peek(identity)
	if page != null:
		binder.call(page)
		return
	var key := page_identity(identity)
	if not _binders.has(key): _binders[key] = []
	_binders[key].append(binder)


## Pages bound together: realizing any of them realizes the rest, then runs
## `binder(pages)` once with the pages in route order.
func on_realize_group(identities: Array, binder: Callable) -> void:
	var group := {"routes": identities, "binder": binder, "bound": false}
	_groups.append(group)
	if identities.any(func(identity): return peek(identity) != null): _bind_group(group)


func realize_eager() -> void:
	for identity in EAGER_ROUTES: view(identity)


func realize_all() -> void:
	for tab in _tabs.get_tab_count():
		if not _pages.has(tab): _realize(tab)


func realized_pages() -> Array[Control]:
	var pages: Array[Control] = []
	for tab in _pages: pages.append(_pages[tab])
	return pages


func page_identity(identity: String) -> String:
	return str(_page_identities.get(tab_for_route(identity), ""))


func tab_for_route(identity: String) -> int:
	return int(_route_tabs.get(identity, -1))


func identity_for_tab(tab: int) -> String:
	if tab < 0 or tab >= _tabs.get_tab_count(): return ""
	return str(_tabs.get_tab_control(tab).get_meta("route_identity", "assets.project-assets"))


func register_controller(identity: String, controller: RefCounted) -> void:
	assert(_route_tabs.has(identity), "A workbench controller must belong to an existing document")
	_controllers[identity] = controller


func controller(identity: String) -> RefCounted:
	return _controllers.get(page_identity(identity))


func attach_session() -> void:
	for owner in _controllers.values(): owner.attach_session()


func teardown() -> void:
	for owner in _controllers.values(): owner.teardown()


func views_for_routes(identities: Array) -> Array[Control]:
	var result: Array[Control] = []
	for identity in identities:
		var page := view(str(identity))
		assert(page != null, "Unknown document route")
		result.append(page)
	return result


# Swap the placeholder for its page in the same tab slot, as detaching a tool does,
# without emitting a tab change or moving the current tab.
func _realize(tab: int) -> Control:
	var placeholder: Control = _tabs.get_tab_control(tab)
	assert(placeholder is LazyPage, "Only a lazy placeholder can be realized")
	var page := (placeholder as LazyPage).instantiate_page()
	page.name = placeholder.name
	for meta in placeholder.get_meta_list(): page.set_meta(meta, placeholder.get_meta(meta))
	var current := _tabs.current_tab
	var blocked := _tabs.is_blocking_signals()
	_tabs.set_block_signals(true)
	_tabs.remove_child(placeholder)
	placeholder.free()
	_tabs.add_child(page)
	_tabs.move_child(page, tab)
	_tabs.current_tab = current
	page.visible = tab == current
	_tabs.set_block_signals(blocked)
	_pages[tab] = page
	var identity: String = _page_identities[tab]
	for binder: Callable in _binders.get(identity, []): binder.call(page)
	_binders.erase(identity)
	for group in _groups:
		if not group.bound and group.routes.any(func(route): return tab_for_route(route) == tab): _bind_group(group)
	realized.emit(identity, page)
	return page


func _bind_group(group: Dictionary) -> void:
	group.bound = true
	group.binder.call(views_for_routes(group.routes))
