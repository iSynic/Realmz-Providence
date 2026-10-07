extends RefCounted


const SourceNavigation = preload("res://src/issues_source_navigation.gd")
const Presentation = preload("res://src/issues_presentation.gd")
const DraftGuard = preload("res://src/issues_draft_guard.gd")
const RepairDialog = preload("res://src/action_settings_repair_dialog.gd")
const Routes = preload("res://src/route_catalog.gd")
const ROUTE := "linter.issues"

var workbench: Control
var repair: Window
var _import_repair: ProvidenceImportRepairDialog
var _repair_shade: ColorRect
var guard: ConfirmationDialog
signal status_changed(message: String)
signal projection_applied(projection: Dictionary)
signal domain_requested(domain: String)
signal route_header_requested(title: String)
signal menu_state_changed
signal restore_domain_requested

var _root: Control
var _tabs: TabContainer
var _bridge: RefCounted
var _drafts: RefCounted
var _read_context: Callable
var _select_document: Callable
var _open_script: Callable
var _menu_command: Callable
var _layout: ProvidenceLayoutCoordinator
var _operations: ProvidenceEditorOperation
var _back: Button
var _return_available := false
var _saved_revision := -1
var _pending_source: Dictionary = {}
var _pending_source_generation := -1
var _repair_check_pending := false
var _repair_revision := -1
var _source_open_in_progress := false
var _navigation: WeakRef
var _session_generation := 0
var _return_focus := ""
var _opened_finding: Dictionary = {}


func initialize(parent: Control, tabs: TabContainer, documents_host: Control, drafts: RefCounted, dialog_resolver: Callable, document: Control, operations: ProvidenceEditorOperation) -> void:
	_root = parent
	_tabs = tabs
	_drafts = drafts
	_operations = operations
	_repair_shade = ColorRect.new()
	_repair_shade.color = Color(0, 0, 0, 0.53)
	_repair_shade.hide()
	parent.add_child(_repair_shade)
	_repair_shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_initialize_repair(parent, operations)
	workbench = document
	_import_repair = preload("res://src/import_repair_dialog.tscn").instantiate()
	_import_repair.operations = operations
	parent.add_child(_import_repair)
	_import_repair.applied.connect(_repair_applied)
	workbench.get_node("%ReviewImport").pressed.connect(func(): if _bridge != null: _import_repair.review(_bridge))
	workbench.state.configure_operations(operations)
	workbench.destination_resolver = describe_destination
	workbench.source_open_requested.connect(request_source)
	workbench.state.refresh_completed.connect(_refresh_completed)
	workbench.get_node("%SearchProblems").text_changed.connect(_cancel_source_open)
	workbench.get_node("%SearchProblems").focus_entered.connect(_cancel_source_open)
	guard = DraftGuard.new()
	guard.name = "IssuesDraftGuard"
	guard.initialize(tabs, drafts, dialog_resolver)
	parent.add_child(guard)
	_back = Button.new()
	_back.name = "BackToIssues"
	_back.text = "← Back to Issues"
	_back.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_back.pressed.connect(request_show)
	_back.hide()
	documents_host.add_child(_back)


func _initialize_repair(parent: Control, operations: ProvidenceEditorOperation) -> void:
	repair = RepairDialog.new()
	repair.operations = operations
	repair.name = "ActionSettingsRepair"
	repair.hide()
	parent.add_child(repair)
	repair.visibility_changed.connect(func(): _repair_shade.visible = repair.visible)
	repair.applied.connect(_repair_applied)
	repair.returned.connect(func():
		workbench.state.refresh(_current_revision())
		workbench.restore_return_focus(_return_focus))


func configure_navigation(layout: ProvidenceLayoutCoordinator, read_context: Callable, select_document: Callable, menu_command: Callable, open_script: Callable, navigation = null) -> void:
	_layout = layout
	_read_context = read_context
	_select_document = select_document
	_menu_command = menu_command
	_open_script = open_script
	_navigation = weakref(navigation) if navigation != null else null


func set_appearance(mode: String, density: String) -> void:
	workbench.set_appearance(mode, density)
	repair.apply_theme(mode, density)
	_import_repair.apply_theme(mode, density)
	if is_selected():
		_enter_layout()


func session_changed(bridge, revision: int) -> void:
	_import_repair.cancel_review()
	_session_generation += 1
	_opened_finding.clear()
	_return_focus = ""
	_bridge = bridge
	_pending_source.clear()
	_repair_check_pending = false
	workbench.repair_applied_revision = -1
	_saved_revision = revision
	_return_available = false
	_back.hide()
	workbench.state.attach(bridge)
	workbench.state.minimum_revision = revision
	if is_selected():
		workbench.state.refresh(revision)
		_update_status()


func project_changed(revision: int) -> void:
	workbench.repair_applied_revision = revision if _repair_check_pending else -1
	workbench.state.minimum_revision = maxi(workbench.state.minimum_revision, revision)
	if is_selected() and not repair.visible:
		workbench.state.refresh(revision)
		_update_status()


func project_saved(revision: int) -> void:
	_saved_revision = revision
	if is_selected():
		_update_status()


func is_selected() -> bool:
	return Routes.document_identity(_tabs.current_tab) == ROUTE


func request_show() -> void:
	guard.prepare_pending_input()
	if _drafts.has_draft():
		restore_domain_requested.emit()
	guard.request(_show, "Issues")


func _show() -> void:
	while _operations.busy:
		await _operations.completed
	if is_selected():
		workbench.state.refresh(_current_revision())
	else:
		_tabs.current_tab = Routes.tab_for_route(ROUTE)
	_update_status()
	if _return_focus.is_empty(): workbench.focus_search()


func tab_changed(tab: int) -> bool:
	if Routes.document_identity(tab) != ROUTE:
		_pending_source.clear()
		workbench.state.cancel_refresh()
		_layout.leave_issues()
		_back.visible = _return_available
		_update_status()
		return false
	domain_requested.emit("linter")
	route_header_requested.emit("  VALIDATE  /  ISSUES")
	_back.hide()
	_enter_layout()
	workbench.state.refresh(_current_revision())
	_update_status()
	menu_state_changed.emit()
	return true


func apply_layout() -> void:
	if is_selected():
		_layout.activate("issues", _root.size.x)


func request_source(finding: Dictionary) -> void:
	if SourceNavigation.destination(finding).is_empty():
		return
	guard.request(_open_source.bind(finding.duplicate(true)), Presentation.source_label(finding))


func _open_source(finding: Dictionary) -> void:
	_pending_source.clear()
	if not workbench.state.refresh(_current_revision()):
		return
	if workbench.state.has_pending_refresh():
		_pending_source = finding
		_pending_source_generation = workbench.state.request_generation
		return
	_complete_source_open(finding)


func _refresh_completed(generation: int, success: bool) -> void:
	if success and is_selected() and not _return_focus.is_empty() and _pending_source.is_empty():
		workbench.restore_return_focus(_return_focus)
		if not _opened_finding.is_empty() and workbench.state.selected_finding() != _opened_finding:
			status_changed.emit("Findings refreshed · the previous problem changed or was resolved.")
		_opened_finding.clear()
		_return_focus=""
		_update_status()
	if _repair_check_pending and not workbench.state.has_pending_refresh():
		_repair_check_pending = false
		status_changed.emit("Repair applied · Unsaved · Issues refreshed" if success else "Repair applied · Unsaved · Check failed. Use Retry Check; do not apply the repair again.")
	if _pending_source.is_empty():
		return
	var finding := _pending_source
	_pending_source = {}
	if success and generation == _pending_source_generation and is_selected():
		_complete_source_open(finding)


func _cancel_source_open(_query: String = "") -> void:
	_pending_source.clear()


func _complete_source_open(finding: Dictionary) -> void:
	_source_open_in_progress = true
	var generation := _session_generation
	while _operations.busy:
		await _operations.completed
		if generation != _session_generation or not is_selected():
			_source_open_in_progress = false
			return
	var retained: Dictionary = workbench.state.selected_finding()
	if retained != finding or not workbench.owner_open_available(finding):
		status_changed.emit("The findings changed. Choose a current problem to open.")
		_source_open_in_progress = false
		return
	var focus := _root.get_viewport().gui_get_focus_owner()
	_return_focus = str(focus.name) if focus != null and workbench.is_ancestor_of(focus) else "SearchProblems"
	_opened_finding = finding.duplicate(true)
	await _open_retained_source(retained)
	_source_open_in_progress = false


func _open_retained_source(finding: Dictionary) -> void:
	if SourceNavigation.is_settings_finding(finding):
		workbench.state.cancel_refresh()
		var response: Dictionary = await repair.open_repair(_bridge, _current_revision(), str(finding.entity), Presentation.action_slot(finding))
		if not response.get("ok", false): status_changed.emit("Could not open this repair. Choose a current finding. " + str(response.get("error", "")))
		return
	_return_available = true
	var generation := _session_generation
	var navigation = _navigation.get_ref() if _navigation != null else null
	if not await SourceNavigation.open(_tabs, _select_document, _open_script, finding, SourceNavigation.destination(finding), navigation):
		_show()
		status_changed.emit("This source could not be opened. Your scenario has not been changed.")
		return
	if generation != _session_generation: return
	_back.show()
	status_changed.emit(("Opened " if describe_destination(finding).get("exact",false) else "Opened owning record: ") + Presentation.source_label(finding) + "")


func _repair_applied(projection: Dictionary) -> void:
	_repair_revision = int(projection.get("revision", _current_revision()))
	_repair_check_pending = true
	projection_applied.emit(projection)
	workbench.focus_search()


func active_authoring_dialog() -> Window:
	if repair.visible: return repair
	for document in _tabs.get_children():
		if document.get_meta("owns_asset_workspace", false) and document.text_dialog().visible:
			return document.text_dialog()
	return null


func guard_repair_command(command: StringName) -> bool:
	if _import_repair.visible:
		_import_repair.get_node("%Status").text = "Apply or Cancel this recovery before changing projects."
		return true
	if not repair.visible: return false
	if command in [&"file.new-project", &"file.open-project", &"file.close-project", &"file.exit", &"file.import-scenario"]:
		repair.request_navigation(_menu_command.bind(command))
	else:
		repair.ui.status.text = "Finish this repair before using other scenario commands."
	return true


func _current_revision() -> int:
	return int(_read_context.call().get("revision", -1)) if _read_context.is_valid() else -1


func _enter_layout() -> void:
	var context: Dictionary = _read_context.call()
	_layout.enter_issues(workbench.theme, str(context.projectId) if context.connected else "No project open")


func _update_status() -> void:
	if not _read_context.is_valid(): return
	var context: Dictionary = _read_context.call()
	var save_state := "Unsaved" if int(context.revision) != _saved_revision else "Saved"
	status_changed.emit("%s%s    %s" % [context.projectId if context.connected else "No project open", " · Validate · Issues" if is_selected() else "", save_state if context.connected else ""])


func inspector_visible() -> bool:
	return workbench.get_node("%SelectedProblemInspector").visible


func set_inspector_visible(visible: bool) -> void:
	workbench.get_node("%SelectedProblemInspector").visible = visible


func focus_search() -> void:
	workbench.get_node("%SearchProblems").grab_focus()

func describe_destination(finding: Dictionary) -> Dictionary:
	var destination:=SourceNavigation.destination(finding)
	var navigation=_navigation.get_ref() if _navigation!=null else null
	if navigation!=null and not destination.is_empty():
		var capability:Dictionary=navigation.describe_source(finding)
		if not capability.is_empty(): destination.merge(capability,true)
	return destination
