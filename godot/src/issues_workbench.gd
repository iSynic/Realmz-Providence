class_name ProvidenceIssuesWorkbench
extends PanelContainer

signal source_open_requested(finding: Dictionary)
signal route_requested(identity: String)
signal evidence_requested(native_path: String)
signal records_requested(identity: String)
signal find_uses_requested

const IssuesState = preload("res://src/issues_state.gd")
const IssuesTheme = preload("res://src/issues_theme.gd")
const FindingRow = preload("res://src/issues_finding_row.gd")
const Presentation = preload("res://src/issues_presentation.gd")
const LABELS := ["Links", "Resources", "Action settings", "Encounters and combat", "Other findings"]

var state := IssuesState.new()
var destination_resolver := Callable()
var repair_applied_revision := -1
var _severities: Array[Button] = []
var _rows: Array[Button] = []
var _rendered_page := ""
var _rendered_query := ""
var _page_input: LineEdit
var _go_button: Button
var _pager_focus := ""
var _pager_generation := -1
var _diagnostic := preload("res://src/issues_diagnostic_context.gd").new()
var _focus_finding: Dictionary = {}


func _ready() -> void:
	theme = IssuesTheme.new()
	visibility_changed.connect(func(): if not is_visible_in_tree(): _diagnostic.invalidate())
	_bind_categories()
	for pair in [[%IssuesRoute,"linter.issues"],[%RecordsRoute,"records.decoded-records"],[%EvidenceRoute,"records.evidence"]]: pair[0].pressed.connect(route_requested.emit.bind(pair[1]))
	%IssuesRoute.disabled=true
	%FindUses.pressed.connect(find_uses_requested.emit)
	%OpenRecords.pressed.connect(func(): records_requested.emit(str(state.selected_finding().get("entity",""))))
	%OpenEvidence.pressed.connect(func(): evidence_requested.emit(_diagnostic.native_path))
	state.refresh_completed.connect(_select_requested_finding)
	_bind_severity()
	%FilterBar.configure(state)
	%HideFinding.pressed.connect(func(): state.hide_selected(false))
	%HideType.pressed.connect(func(): state.hide_selected(true))
	%ShowAll.toggled.connect(state.set_show_all)
	%BackToGroups.pressed.connect(func(): state.open_group(""))
	%CheckAgain.pressed.connect(_refresh)
	%SearchProblems.text_submitted.connect(func(text: String): state.set_filters(text, state.severity, state.code))
	%SearchProblems.gui_input.connect(_search_input)
	%ClearFilters.pressed.connect(func(): %SearchProblems.text = ""; state.clear_filters(); %SearchProblems.grab_focus())
	%OpenFinding.pressed.connect(func(): _open_finding(state.selected_finding()))
	state.changed.connect(_render)
	state.refresh_completed.connect(_restore_pager_focus)
	_render()


func _exit_tree() -> void:
	if state.changed.is_connected(_render):
		state.changed.disconnect(_render)
	_diagnostic.invalidate()
	state.attach(null)


func _process(delta: float) -> void:
	state.poll(delta)


func route_identity() -> String:
	return "linter.issues"


func attach(bridge, revision: int = -1) -> void:
	state.attach(bridge)
	if bridge != null:
		state.refresh(revision)


func reload(_bridge, revision: int = -1) -> void:
	state.refresh(revision)


func focus_search() -> void:
	%SearchProblems.grab_focus()


func set_appearance(mode: String, density: String) -> void:
	theme.mode = mode
	theme.density = density
	_rendered_page = ""
	_render()


func _bind_categories() -> void:
	%CategoryFilter.add_item("All groups"); %CategoryFilter.set_item_metadata(0,"")
	for index in LABELS.size():
		%CategoryFilter.add_item(LABELS[index]); %CategoryFilter.set_item_metadata(index+1,IssuesState.CATEGORY_IDS[index])
	%CategoryFilter.item_selected.connect(func(index): state.open_category(str(%CategoryFilter.get_item_metadata(index))))


func _bind_severity() -> void:
	var names := ["All", "Errors", "Warnings", "Information"]
	for index in names.size():
		var button := %Severity.get_node(names[index]) as Button
		button.pressed.connect(func(): state.set_filters(state.query, IssuesState.SEVERITIES[index], state.code))
		_severities.append(button)


func _render() -> void:
	if not is_node_ready():
		return
	var unavailable := state.status in ["no-project", "checking", "failed"]
	%CheckAgain.disabled = state.status in ["no-project", "checking"]
	%CheckAgain.text = "Retry" if state.status == "failed" else "Check Again"
	if state.status == "failed" and repair_applied_revision >= 0: %CheckAgain.text = "Retry Check"
	%SearchProblems.editable = state.status != "no-project"
	%ShowAll.disabled = state.status == "no-project"
	%ReviewImport.disabled = state.status == "no-project"
	%ShowAll.set_pressed_no_signal(state.show_all)
	%BackToGroups.visible = not state.group_identity.is_empty()
	%ClearFilters.disabled = not state.filters_active() or state.status == "no-project"
	if _rendered_query != state.query or state.status == "no-project":
		%SearchProblems.text = state.query
		_rendered_query = state.query
	for index in _severities.size():
		_severities[index].set_pressed_no_signal(state.severity == IssuesState.SEVERITIES[index])
		_severities[index].disabled = state.status == "no-project"
	_render_counts()
	for index in %CategoryFilter.item_count:
		if %CategoryFilter.get_item_metadata(index)==state.category: %CategoryFilter.select(index)
	%CategoryFilter.disabled=state.status=="no-project"
	var render_key := JSON.stringify([state.page, state.category, state.status])
	if render_key != _rendered_page:
		_rendered_page = render_key
		_render_rows(unavailable)
	for index in _rows.size():
		_rows[index].update_selection(index == state.selected_index)
	_render_inspector()


func _render_counts() -> void:
	var counts: Dictionary = state.page.get("occurrenceCounts", state.page.get("unfilteredCounts", {}))
	var text := "%d errors · %d warnings" % [int(counts.get("errors", 0)), int(counts.get("warnings", 0))]
	if int(counts.get("information", 0)) > 0:
		text += " · %d information" % int(counts.information)
	if not state.page.is_empty(): text += " · %d rows" % int(state.page.get("unfilteredTotal", 0))
	if state.filters_active():
		text += " · %d matching problems" % int(state.page.get("matchedBeforeGroup", 0))
	match state.status:
		"no-project": text = "Open a scenario to check for problems."
		"checking": text = "Checking scenario…"
		"failed": text = "The checker is not responding. Try again."
		"clean": text = "No problems found."
	%Counts.text = text
	%Counts.add_theme_color_override("font_color", theme.get_color("problem" if int(counts.get("errors", 0)) > 0 else "secondary", "Issues"))


func _render_rows(unavailable: bool) -> void:
	_rows.clear()
	_page_input = null
	_go_button = null
	for host in [%FindingRows,%PagingHost]:
		for child in host.get_children(): host.remove_child(child); child.queue_free()
	var body: VBoxContainer=%FindingRows
	var rows: Array = state.page.get("items", [])
	if unavailable or rows.is_empty():
		var label := Label.new()
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.text = {
			"no-project": "Open a scenario to see its problems.", "checking": "Checking scenario…",
			"failed": "Your scenario has not been changed. Choose Retry to check again.",
			"clean": "No problems found by the current checks.",
			"no-matches": "No problems match these filters. Try another search or Clear Filters.",
			"category-empty": "No problems in this category.",
		}.get(state.status, "No problems on this page.")
		if state.status == "failed" and repair_applied_revision >= 0:
			label.text = "The repair was applied, but Issues could not be refreshed. Retry Check does not apply the repair again. Save remains a separate action."
		body.add_child(label)
		return
	for index in rows.size():
		var finding: Dictionary = rows[index]
		var row := FindingRow.new(false)
		row.name = "Finding%d" % index
		body.add_child(row)
		row.set_finding(Presentation.source_label(finding), finding, not _destination(finding).is_empty() or not str(finding.get("groupIdentity", "")).is_empty())
		row.pressed.connect(func(): state.select_row(index))
		row.open_requested.connect(func(): state.select_row(index); _open_finding(finding))
		row.gui_input.connect(_row_input.bind(index))
		_rows.append(row)
	_build_paging(%PagingHost)


func _build_paging(body: VBoxContainer) -> void:
	var pager := preload("res://src/issues_paging.tscn").instantiate()
	body.add_child(pager)
	var range_label := pager.get_node("Range") as Label
	range_label.text = "%d–%d of %d · %d per page" % [int(state.page.offset) + 1, int(state.page.offset) + state.page.items.size(), int(state.page.total), state.limit]
	_page_input = pager.get_node("PageNumber")
	_page_input.text = str(state.page_number())
	_page_input.tooltip_text = "Page number (1–%d). Press Enter to go." % state.page_count()
	_page_input.text_submitted.connect(func(_text: String): _go_to_page())
	_page_input.text_changed.connect(func(_text: String): _update_page_input())
	pager.get_node("Total").text = "/ %d" % state.page_count()
	_go_button = pager.get_node("Go")
	_go_button.pressed.connect(_go_to_page)
	var previous := pager.get_node("Previous") as Button
	previous.pressed.connect(_step_page.bind(-1))
	previous.disabled = state.page_number() == 1
	var next := pager.get_node("Next") as Button
	next.pressed.connect(_step_page.bind(1))
	next.disabled = state.page_number() >= state.page_count()
	_update_page_input()


func _update_page_input() -> void:
	var valid := _page_input.text.is_valid_int() and _page_input.text.to_int() >= 1 and _page_input.text.to_int() <= state.page_count()
	_go_button.disabled = not valid or _page_input.text.to_int() == state.page_number()


func _go_to_page() -> void:
	if _page_input != null and _page_input.text.is_valid_int():
		_pager_focus = "Page"
		_pager_generation = state.request_generation + 1
		if not state.go_to_page(_page_input.text.to_int()):
			_pager_focus = ""


func _step_page(direction: int) -> void:
	_pager_focus = "Next" if direction > 0 else "Previous"
	_pager_generation = state.request_generation + 1
	if not state.go_to_page(state.page_number() + direction):
		_pager_focus = ""


func _restore_pager_focus(generation: int, success: bool) -> void:
	var target := _pager_focus
	_pager_focus = ""
	if target.is_empty() or not success or generation != _pager_generation or _page_input == null or not is_visible_in_tree():
		return
	if get_viewport().gui_get_focus_owner() != null:
		return
	if target != "Page":
		var button := _page_input.get_parent().get_node(target) as Button
		if not button.disabled:
			button.grab_focus()
			return
	_page_input.grab_focus()


func _render_inspector() -> void:
	var finding := state.selected_finding()
	%HideFinding.disabled = finding.is_empty()
	%HideType.disabled = finding.is_empty()
	%HideFinding.text = "Hide group" if not str(finding.get("groupIdentity", "")).is_empty() else "Hide finding"
	var destination := _destination(finding)
	%InspectorHeading.add_theme_color_override("font_color", theme.get_color("gold", "Issues"))
	%FindingSource.text = Presentation.source_label(finding) if not finding.is_empty() else "Select a problem"
	%FindingMessage.text = Presentation.message(finding)
	%FindingSeverity.text=str(finding.get("severity","")).to_upper()
	%FindingSeverity.add_theme_color_override("font_color",theme.get_color("gold" if finding.get("severity")=="warning" else "problem","Issues"))
	%FindingDestination.text=Presentation.source_label(finding) if not finding.is_empty() else ""
	%FindingGuidance.text = Presentation.guidance(finding, destination) if not finding.is_empty() else ""
	%FindingGuidance.add_theme_color_override("font_color", theme.get_color("secondary", "Issues"))
	var grouped := not str(finding.get("groupIdentity", "")).is_empty()
	%OpenFinding.disabled = destination.is_empty() and not grouped
	%OpenFinding.text = "View affected fields" if grouped else ("Open action settings" if Presentation.action_slot(finding) >= 0 else ("Open owning field" if destination.get("exact",false) else "Open owning record"))
	_diagnostic.present(finding)


func _destination(finding: Dictionary) -> Dictionary:
	if finding.is_empty() or finding.has("preservationReason") or not destination_resolver.is_valid():
		return {}
	return destination_resolver.call(finding)


func _open_finding(finding: Dictionary) -> void:
	if not str(finding.get("groupIdentity", "")).is_empty():
		state.open_group(str(finding.groupIdentity))
		return
	if not owner_open_available(finding): return
	if str(finding.get("entity","")).begins_with("classic-source:") and not _diagnostic.native_path.is_empty() and not %OpenEvidence.disabled:
		evidence_requested.emit(_diagnostic.native_path)
		return
	if not _destination(finding).is_empty():
		source_open_requested.emit(finding.duplicate(true))

func owner_open_available(finding: Dictionary) -> bool:
	return not _diagnostic.owner_is_ambiguous(finding)


func _refresh() -> void:
	state.refresh()


func _row_input(event: InputEvent, index: int) -> void:
	if event is InputEventKey and event.pressed and event.keycode in [KEY_UP, KEY_DOWN]:
		var destination := clampi(index + (-1 if event.keycode == KEY_UP else 1), 0, _rows.size() - 1)
		state.select_row(destination)
		_rows[destination].grab_focus()
		accept_event()


func _search_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		%SearchProblems.text = ""
		state.set_filters("", state.severity, state.code)
		%SearchProblems.grab_focus()
		accept_event()


func _unhandled_key_input(event: InputEvent) -> void:
	if is_visible_in_tree() and event is InputEventKey and event.pressed and event.keycode == KEY_F and event.is_command_or_control_pressed():
		%SearchProblems.grab_focus()
		get_viewport().set_input_as_handled()


func configure_diagnostics(operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	_diagnostic.initialize(self,operations,read_bridge)

func restore_return_focus(name: String) -> void:
	var target:=find_child(name,true,false) as Control
	if target==null and state.selected_index>=0 and state.selected_index<_rows.size(): target=_rows[state.selected_index]
	if target==null or not target.is_visible_in_tree() or (target is BaseButton and target.disabled): target=%SearchProblems
	target.call_deferred("grab_focus")

func focus_finding(finding: Dictionary) -> void:
	_focus_finding=finding.duplicate(true)
	state.set_filters(str(finding.get("entity","")),"",str(finding.get("code","")))

func _select_requested_finding(_generation: int, success: bool) -> void:
	if not success or _focus_finding.is_empty(): return
	for index in (state.page.get("items",[]) as Array).size():
		if state.page.items[index]==_focus_finding: state.select_row(index); restore_return_focus("Finding%d" % index); break
	_focus_finding.clear()

func discovery_selection() -> Dictionary:
	return _diagnostic.selection.duplicate(true)

func read_navigation_state() -> Dictionary:
	var location:=state.read_navigation_state()
	var focus:=get_viewport().gui_get_focus_owner()
	location["focus"]=str(get_path_to(focus)) if focus!=null and is_ancestor_of(focus) else ""
	location["scroll"]=%FindingScroll.scroll_vertical
	return location

func restore_navigation_state(location: Dictionary) -> bool:
	if not state.restore_navigation_state(location): return false
	var generation:=state.request_generation
	while state.has_pending_refresh():
		await get_tree().process_frame
		if generation!=state.request_generation or not is_visible_in_tree(): return false
	if state.status not in ["ready","category-empty","clean","no-matches"]: return false
	%FindingScroll.scroll_vertical=int(location.get("scroll",0))
	var focus:=get_node_or_null(str(location.get("focus",""))) as Control
	if focus!=null: focus.grab_focus()
	return true
