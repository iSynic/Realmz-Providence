class_name ProvidenceLayoutCoordinator
extends RefCounted

signal inspector_width_dragged(width: int)

# Workbenches choose a profile; only this component writes shared shell dimensions.
var _navigation: Control
var _sidebar: Control
var _explorer_host: Container
var _primary: SplitContainer
var _document_split: SplitContainer
var _inspector_host: Control
var _profile := "standard"
var _inspector_width := 300
var _domain := "scripts"
var _root: Control
var _commands: Control
var _tabs: TabContainer
var _status: Label
var _dock: Control
var _output_split: VSplitContainer
var _output_dock: ProvidenceProblemsDock
var _workspace: Control
var _centered := false
const PREFERENCES := "user://workspace-layout.cfg"


func initialize(navigation: Control, sidebar: Control, primary: SplitContainer,
		document_split: SplitContainer, inspector_host: Control) -> void:
	_navigation = navigation
	_sidebar = sidebar
	_explorer_host = navigation.get_parent()
	_primary = primary
	_document_split = document_split
	_inspector_host = inspector_host
	_document_split.resized.connect(resize_inspector)
	_document_split.dragged.connect(_inspector_dragged)


func _inspector_dragged(offset: int) -> void:
	if _profile != "land": return
	_inspector_width = clampi(int((_document_split.size.x - _document_split.get_theme_constant("separation")) / 2) - offset, 136, 640)
	inspector_width_dragged.emit(_inspector_width)


func set_domain(domain: String) -> void:
	_domain = domain
	if _profile == "standard": _apply_standard()


func activate(profile: String, viewport_width: float = 1920) -> void:
	_profile = profile
	_inspector_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL if profile == "land" else Control.SIZE_FILL
	if _output_dock != null: _output_dock.visible = profile in ["issues", "diagnostics"]
	if profile != "issues": _navigation.remove_theme_stylebox_override("panel")
	_sidebar.visible = profile not in ["assets", "monsters", "issues", "economy-authoring", "item-authoring", "encounter-authoring"]
	match profile:
		"land", "world":
			_sidebar.custom_minimum_size.x = 208
			_set_explorer_width(284, 300)
			set_inspector_width(352)
			set_inspector_visible(profile == "land")
		"assets", "monsters":
			var panel: StyleBox = _navigation.get_theme_stylebox("panel").duplicate()
			panel.content_margin_left = 0
			panel.content_margin_right = 0
			_navigation.add_theme_stylebox_override("panel", panel)
			_set_explorer_width(76, 76)
			set_inspector_visible(false)
		"economy-authoring", "item-authoring":
			var panel: StyleBox = _navigation.get_theme_stylebox("panel").duplicate()
			panel.content_margin_left = 0
			panel.content_margin_right = 0
			_navigation.add_theme_stylebox_override("panel", panel)
			_set_explorer_width(76, 76)
			set_inspector_visible(profile == "economy-authoring")
		"story-authoring", "script-steps", "encounter-authoring", "player-scenario", "diagnostics", "issues":
			_sidebar.hide()
			_set_explorer_width(76, 76)
			set_inspector_width(300)
			set_inspector_visible(profile == "story-authoring" and viewport_width >= 1900)
		"publish":
			_apply_standard()
			set_inspector_visible(false)
		_:
			_apply_standard()


func reset() -> void:
	_explorer_host.show()
	activate(_profile)
	resize_inspector()


func set_inspector_width(width: int) -> void:
	_inspector_width = width
	_inspector_host.custom_minimum_size.x = mini(width, 352) if _profile == "land" else width
	resize_inspector()


func set_inspector_visible(show: bool) -> void:
	_inspector_host.visible = show
	if show: resize_inspector()


func resize_inspector() -> void:
	if not is_instance_valid(_document_split) or not _inspector_host.visible: return
	var offset := maxi(600, int(_document_split.size.x) - _inspector_width)
	if _profile == "land": offset = int((_document_split.size.x - _document_split.get_theme_constant("separation")) / 2) - _inspector_width
	if _document_split.split_offset != offset: _document_split.split_offset = offset


func _apply_standard() -> void:
	var map_context := _domain in ["maps", "player-maps"]
	# The shared panel style contributes 16 px to the donor's contextual region.
	_sidebar.custom_minimum_size.x = 304 if map_context else 264
	_set_explorer_width(380 if map_context else 340, 396 if map_context else 356)


func _set_explorer_width(minimum: int, split: int) -> void:
	if _navigation.custom_minimum_size.x != minimum: _navigation.custom_minimum_size.x = minimum
	if _primary.split_offset != split: _primary.split_offset = split
	# A profile switch can resize a child even when its host keeps the same size.
	_explorer_host.queue_sort()


func configure_output_dock(split: VSplitContainer, dock: ProvidenceProblemsDock) -> void:
	_output_split = split
	_output_dock = dock
	dock.hide()
	dock.expansion_changed.connect(_set_output_expanded)
	split.resized.connect(_resize_output)


func _set_output_expanded(expanded: bool) -> void:
	_output_split.split_offset = maxi(360, int(_output_split.size.y) - 220) if expanded else 100000


func _resize_output() -> void:
	if _output_dock.is_node_ready() and _output_dock.is_expanded(): _set_output_expanded(true)


func configure_issues_chrome(root: Control, commands: Control, tabs: TabContainer, status: Label, dock: Control, _open_issues: Callable) -> void:
	_root = root
	_workspace = root.get_node("Workspace")
	var preferences := ConfigFile.new()
	if preferences.load(PREFERENCES) == OK: _centered = bool(preferences.get_value("workspace", "centered16By9", false))
	root.resized.connect(_resize_workspace)
	_resize_workspace()
	_commands = commands
	_navigation.resized.connect(func(): _align_header_rail.call_deferred())
	_navigation.get_node("Layout/DomainRail").item_rect_changed.connect(func(): _align_header_rail.call_deferred())
	_align_header_rail.call_deferred()
	_tabs = tabs
	_status = status
	_dock = dock

func enter_issues(_issues_theme: Theme, _project_label: String) -> void:
	activate("issues", _root.size.x)


func leave_issues() -> void:
	if _output_dock != null: _output_dock.hide()

func centered_workspace() -> bool: return _centered

func workspace_width() -> float: return _workspace.size.x if _workspace != null else _root.size.x

func set_centered_workspace(centered: bool) -> Error:
	_centered = centered
	_resize_workspace()
	var preferences := ConfigFile.new()
	preferences.load(PREFERENCES)
	preferences.set_value("workspace", "centered16By9", centered)
	return preferences.save(PREFERENCES)

func _resize_workspace() -> void:
	if _workspace == null: return
	var width := minf(_root.size.x, _root.size.y * 16.0 / 9.0) if _centered else _root.size.x
	var inset := (_root.size.x - width) / 2.0
	_workspace.offset_left = inset
	_workspace.offset_right = -inset


func _align_header_rail() -> void:
	if _commands == null or not _commands.is_node_ready(): return
	var rail: Control = _navigation.get_node("Layout/DomainRail")
	var inset := rail.global_position.x - _commands.global_position.x
	_commands.set_rail_width(rail.size.x + inset * 2)
