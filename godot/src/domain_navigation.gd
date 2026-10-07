class_name ProvidenceDomainNavigation
extends PanelContainer

signal domain_selected(domain_id: String)
signal route_requested(identity: String, action: String, label: String)
signal map_requested(identity: String)
signal special_land_requested

var _route_buttons: Array[Button] = []
var _domain := ""

@onready var sidebar_heading: Label = %DomainHeading
@onready var sidebar_subtitle: Label = %DomainSubtitle
@onready var route_list: VBoxContainer = %DomainRoutes
@onready var project_tree: Tree = %ProjectTree
@onready var project_search: LineEdit = %ProjectSearch
@onready var domain_buttons: Dictionary = {
	"maps": %MapsDomain,
	"player-maps": %PlayerMapsDomain,
	"scripts": %ScriptsDomain,
	"text": %TextDomain,
	"encounters": %EncountersDomain,
	"scenario": %ScenarioDomain,
	"rules": %RulesDomain,
	"combat": %CombatDomain,
	"economy": %EconomyDomain,
	"assets": %AssetsDomain,
	"linter": %LinterDomain,
	"export": %ExportDomain,
}


func _ready() -> void:
	for domain_id: String in domain_buttons:
		var button := domain_buttons[domain_id] as Button
		button.pressed.connect(_select_domain.bind(domain_id))
	project_tree.item_activated.connect(activate_explorer_selection)


func set_selected_domain(domain_id: String) -> void:
	for key: String in domain_buttons:
		var button := domain_buttons[key] as Button
		button.set_pressed_no_signal(key == domain_id)
		if button is ProvidenceDomainToolButton:
			(button as ProvidenceDomainToolButton).sync_visual_state()


func _select_domain(domain_id: String) -> void:
	set_selected_domain(domain_id)
	domain_selected.emit(domain_id)


func configure_domain(domain_id: String) -> void:
	if _domain != domain_id or _route_buttons.is_empty(): _build_routes(domain_id)
	_domain = domain_id
	set_selected_domain(domain_id)
	%DomainRoutesScroll.custom_minimum_size.y = 222 if domain_id in ["linter", "export"] else 180
	%MapContextSidebar.visible = domain_id == "maps"
	sidebar_subtitle.hide()
	for control in [sidebar_heading, %DomainRoutesScroll, %ProjectHeading, project_search, project_tree]:
		control.visible = domain_id != "maps"


func buttons() -> Array[Button]:
	return _route_buttons.duplicate()


func action_button(action: String) -> Button:
	for button in _route_buttons:
		if str(button.get_meta("route_action", "")) == action: return button
	return null


func select_route(identity: String, library_selected: bool, dungeon: bool, special_land_world: bool) -> void:
	var selected: Button = null
	for button in _route_buttons:
		var action := str(button.get_meta("route_action", ""))
		if library_selected and action == "asset-scenario":
			selected = button
			break
		var candidate := str(button.get_meta("route_id"))
		if ProvidenceRouteCatalog.tab_for_route(candidate) < 0: continue
		if ProvidenceRouteCatalog.tab_for_route(candidate) != ProvidenceRouteCatalog.tab_for_route(identity): continue
		if action == "first-land-map" and dungeon: continue
		if action == "first-dungeon-map" and not dungeon: continue
		if action == "special-land-world" and not special_land_world: continue
		if action == "special-land-media" and special_land_world: continue
		selected = button
		break
	for button in _route_buttons: button.button_pressed = button == selected


func _build_routes(domain_id: String) -> void:
	var configuration: Dictionary = ProvidenceRouteCatalog.ROUTES[domain_id]
	sidebar_heading.text = str(configuration.heading)
	sidebar_subtitle.text = ""
	for child in route_list.get_children():
		route_list.remove_child(child)
		child.queue_free()
	_route_buttons.clear()
	var group := ButtonGroup.new()
	for data: Array in configuration.get("sidebarRoutes", configuration.routes):
		var route := Button.new()
		route.text = str(data[0])
		route.alignment = HORIZONTAL_ALIGNMENT_LEFT
		route.custom_minimum_size.y = 34
		route.toggle_mode = true
		route.button_group = group
		route.set_meta("document_tab", int(data[1]))
		route.set_meta("route_action", str(data[2]))
		route.set_meta("route_id", str(data[3]))
		if int(data[1]) < 0 and str(data[2]) not in ["asset-scenario", "asset-stock"]:
			route.tooltip_text = "Route retained from Providence; its native workbench has not migrated yet."
		route.pressed.connect(func(): route_requested.emit(str(data[3]), str(data[2]), str(data[0])))
		_route_buttons.append(route)
		route_list.add_child(route)


func render_project(project_id: String, maps: Array, message_count: int, item_count: int, problem_count: int) -> void:
	project_tree.clear()
	var root_item := project_tree.create_item()
	var project := project_tree.create_item(root_item)
	project.set_text(0, project_id if not project_id.is_empty() else "No Project")
	var world := project_tree.create_item(project)
	world.set_text(0, "World · %d maps" % maps.size())
	for map: Dictionary in maps:
		var map_item := project_tree.create_item(world)
		map_item.set_text(0, "%s · %s %d" % [str(map.get("name", "Unnamed Map")), str(map.get("levelType", "land")).capitalize(), int(map.get("nativeIndex", 0))])
		map_item.set_metadata(0, {"route": "map", "identity": str(map.get("identity", ""))})
	var special_land := project_tree.create_item(world)
	special_land.set_text(0, "Special Land Tiles · negative cicn")
	special_land.set_metadata(0, "special-land")
	var story := project_tree.create_item(project)
	story.set_text(0, "Story")
	project_tree.create_item(story).set_text(0, "Messages · %d" % message_count)
	project_tree.create_item(story).set_text(0, "Action Points · Data DD")
	project_tree.create_item(story).set_text(0, "Extra Action Points · Data ED3")
	project_tree.create_item(story).set_text(0, "Global Macros · Global")
	var systems := project_tree.create_item(project)
	systems.set_text(0, "Actors & Systems")
	project_tree.create_item(systems).set_text(0, "Scenario Items · %d" % item_count)
	# Saved searches are not yet authored project objects. Problems remains in its
	# owning Validate route instead of appearing as a fabricated tree record.


func activate_explorer_selection() -> void:
	var item := project_tree.get_selected()
	if item == null: return
	var metadata: Variant = item.get_metadata(0)
	if metadata is Dictionary and str(metadata.get("route", "")) == "map":
		map_requested.emit(str(metadata.get("identity", "")))
	elif str(metadata) == "special-land": special_land_requested.emit()
