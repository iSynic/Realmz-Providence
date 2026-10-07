class_name ProvidenceDocumentRegistry
extends RefCounted

const Routes = preload("res://src/route_catalog.gd")

var _tabs: TabContainer
var _views: Dictionary = {}
var _controllers: Dictionary = {}


func initialize(tabs: TabContainer) -> void:
	_tabs = tabs
	_views.clear()
	_controllers.clear()
	for page in tabs.get_children():
		var identity := str(page.get_meta("route_identity", ""))
		assert(not identity.is_empty() and not _views.has(identity), "Each document needs one stable route identity")
		assert(Routes.tab_for_route(identity) == tabs.get_tab_idx_from_control(page), "Document scene order must preserve existing route destinations")
		_views[identity] = page
	# Multiple donor routes may intentionally share one native document.
	for domain in Routes.ROUTES.values():
		for route in domain.routes:
			var tab := int(route[1])
			if tab >= 0:
				_views[str(route[3])] = tabs.get_tab_control(tab)


func view(identity: String) -> Control:
	return _views.get(identity)


func tab_for_route(identity: String) -> int:
	var page := view(identity)
	return _tabs.get_tab_idx_from_control(page) if page != null else -1


func identity_for_tab(tab: int) -> String:
	if tab < 0 or tab >= _tabs.get_tab_count(): return ""
	return str(_tabs.get_tab_control(tab).get_meta("route_identity", "assets.project-assets"))


func register_controller(identity: String, controller: RefCounted) -> void:
	assert(_views.has(identity), "A workbench controller must belong to an existing document")
	_controllers[identity] = controller


func controller(identity: String) -> RefCounted:
	var page := view(identity)
	if page == null: return null
	return _controllers.get(str(page.get_meta("route_identity")))


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
