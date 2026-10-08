class_name ProvidenceIssuesState
extends RefCounted

signal changed
signal refresh_completed(generation: int, success: bool)

const ValidationJob = preload("res://src/issues_validation_job.gd")
const CATEGORY_IDS := ["links", "resources", "action-settings", "records", "other"]
const SEVERITIES := ["", "error", "warning", "information"]

var query := ""
var severity := ""
var code := ""
var category := ""
var show_all := false
var group_identity := ""
var expanded := true
var limit := 50
var filters := preload("res://src/issues_filters.gd").new()
var revision := -1
var minimum_revision := -1
var page: Dictionary = {}
var selected_index := -1
var status := "no-project"
var error := ""
var _bridge
var _pages: Dictionary = {}
var _selections: Dictionary = {}
var _positions: Dictionary = {}
var request_generation := 0
var _job := ValidationJob.new()
var _pending_params: Dictionary = {}
var _pending_locate := false
var _poll_wait := 0.0


func configure_operations(operations: ProvidenceEditorOperation) -> void:
	cancel_refresh()
	_job = preload("res://src/issues_validation_transport.gd").new()
	_job.operations = operations


func attach(bridge) -> void:
	cancel_refresh()
	_bridge = bridge
	query = ""
	severity = ""
	code = ""
	category = ""
	show_all = false
	filters.reset()
	group_identity = ""
	expanded = true
	minimum_revision = -1
	_pages.clear()
	_selections.clear()
	_positions.clear()
	_clear_page()
	status = "no-project" if bridge == null else "checking"
	changed.emit()


func refresh(at_least_revision := -1) -> bool:
	minimum_revision = maxi(minimum_revision, at_least_revision)
	return _load(true)


func set_filters(next_query: String, next_severity: String = "", next_code: String = "") -> bool:
	if next_severity not in SEVERITIES:
		return false
	query = next_query.strip_edges()
	severity = next_severity
	code = next_code.strip_edges()
	_pages.clear()
	_selections.clear()
	_positions.clear()
	expanded = true
	return _load(false)


func clear_filters() -> bool:
	filters.reset()
	category = ""
	group_identity = ""
	return set_filters("", "", "")


func set_show_all(enabled: bool) -> bool:
	show_all = enabled
	group_identity = ""
	_pages.clear()
	_selections.clear()
	_positions.clear()
	return _load(false)


func open_group(identity: String) -> bool:
	group_identity = identity
	_pages.clear()
	_selections.clear()
	_positions.clear()
	return _load(false)


func filters_active() -> bool:
	return not query.is_empty() or not severity.is_empty() or not code.is_empty() or not category.is_empty() or not filters.rules.is_empty() or filters.hide_uncalled_warnings


func hide_selected(by_type: bool) -> bool:
	filters.add(selected_finding(), by_type)
	return reload_filters()


func reload_filters() -> bool:
	return set_filters(query, severity, code)


func open_category(next_category: String) -> bool:
	if not next_category.is_empty() and next_category not in CATEGORY_IDS:
		return false
	category = next_category
	group_identity = ""
	expanded = true
	return _load(true)


func toggle_category(next_category: String) -> bool:
	if next_category == category and expanded:
		expanded = false
		changed.emit()
		return true
	return open_category(next_category)


func set_capacity(capacity: int) -> bool:
	var bounded := clampi(capacity, 1, 128)
	if limit == bounded:
		return true
	limit = bounded
	for id in _pages:
		_pages[id] = int(_pages[id]) / limit * limit
	return _load(true) if _bridge != null else true


func go_to_page(number: int) -> bool:
	if status not in ["ready", "category-empty"] or number < 1 or number > page_count():
		return false
	_pages[category] = (number - 1) * limit
	_positions[category] = 0
	return _load(false)


func page_count() -> int:
	return maxi(1, ceili(float(page.get("total", 0)) / limit))


func page_number() -> int:
	return int(page.get("offset", 0)) / limit + 1


func select_row(index: int) -> void:
	var rows: Array = page.get("items", [])
	selected_index = index if index >= 0 and index < rows.size() else -1
	if selected_index >= 0:
		_selections[category] = selection_key(rows[index])
		_positions[category] = index
	else:
		_selections.erase(category)
	changed.emit()


func selected_finding() -> Dictionary:
	var rows: Array = page.get("items", [])
	return rows[selected_index].duplicate(true) if selected_index >= 0 and selected_index < rows.size() else {}


static func selection_key(finding: Dictionary) -> Dictionary:
	return {"code": finding.get("code", ""), "entity": finding.get("entity"), "field": finding.get("field")}


func _load(locate: bool) -> bool:
	request_generation += 1
	_clear_page()
	if _bridge == null:
		status = "no-project"
		changed.emit()
		return false
	status = "checking"
	changed.emit()
	var params := {
		"query": query, "category": category, "code": code,
		"showAll": show_all,
		"groupIdentity": group_identity,
		"offset": int(_pages.get(category, 0)), "limit": limit,
		"groupLimit": 64, "clampOffset": true, "locateSelection": locate,
	}
	params.merge(filters.parameters())
	if not severity.is_empty():
		params["severity"] = severity
	if _selections.has(category):
		params["selection"] = _selections[category].duplicate(true)
	_pending_locate = locate
	if ValidationJob.supported(_bridge):
		_pending_params = params.duplicate(true)
		_poll_wait = 0.0
		var accepted: Dictionary = _job.start(_bridge, params)
		return true if bool(accepted.get("ok", false)) else _fail(str(accepted.get("error", "Validation unavailable.")))
	return _accept(_bridge.request("validation.list", params), locate)


func has_pending_refresh() -> bool:
	return _job.active()


func cancel_refresh() -> void:
	request_generation += 1
	_job.cancel()
	_pending_params.clear()


func poll(delta: float) -> void:
	_poll_wait -= delta
	if _bridge != null and _bridge.has_method("operation_busy") and _bridge.operation_busy(): return
	# Consume worker replies immediately. The interval limits new native polls,
	# not delivery of a response that has already completed.
	var reply_ready: bool = _job.has_ready_response()
	if _poll_wait > 0.0 and not reply_ready:
		return
	if not reply_ready: _poll_wait = 0.05
	var response: Dictionary = _job.poll()
	if response.is_empty():
		return
	if response.has("retryRevision"):
		minimum_revision = maxi(minimum_revision, int(response.retryRevision))
		var accepted: Dictionary = _job.start(_bridge, _pending_params)
		if not bool(accepted.get("ok", false)):
			_fail(str(accepted.get("error", "Validation unavailable.")))
		return
	_pending_params.clear()
	_accept(response, _pending_locate)


func _accept(response: Dictionary, locate: bool) -> bool:
	if not bool(response.get("ok", false)):
		return _fail(str(response.get("error", "Validation unavailable.")))
	var result: Dictionary = response.get("result", {})
	if not _valid_page(result):
		return _fail("Validation returned an incomplete, outdated or unexpected page.")
	page = result.duplicate(true)
	revision = int(page.revision)
	minimum_revision = maxi(minimum_revision, revision)
	_pages[category] = int(page.offset)
	_select_refreshed_row(locate)
	status = "ready"
	if int(page.unfilteredTotal) == 0:
		status = "clean"
	elif int(page.matchedBeforeGroup) == 0:
		status = "no-matches"
	elif int(page.total) == 0:
		status = "category-empty"
	changed.emit()
	refresh_completed.emit(request_generation, true)
	return true


func _select_refreshed_row(locate: bool) -> void:
	var rows: Array = page.items
	var global_index: Variant = page.get("selectionIndex")
	if global_index != null:
		var local_index := int(global_index) - int(page.offset)
		if local_index >= 0 and local_index < rows.size():
			selected_index = local_index
	if selected_index < 0 and not rows.is_empty():
		selected_index = mini(int(_positions.get(category, 0)), rows.size() - 1) if locate else 0
	if selected_index >= 0:
		_selections[category] = selection_key(rows[selected_index])
		_positions[category] = selected_index
	else:
		_selections.erase(category)


func _valid_page(result: Dictionary) -> bool:
	if int(result.get("revision", -1)) < minimum_revision or int(result.get("revision", -1)) < 0:
		return false
	if not result.get("items") is Array or not result.get("categories") is Array or not result.get("unfilteredCounts") is Dictionary:
		return false
	var rows: Array = result.items
	var facets: Array = result.categories
	var offset := int(result.get("offset", -1))
	var total := int(result.get("total", -1))
	if rows.size() > limit or int(result.get("limit", -1)) != limit or offset < 0 or total < 0 or offset + rows.size() > total:
		return false
	if rows.size() != mini(limit, maxi(0, total - offset)) or facets.size() != CATEGORY_IDS.size():
		return false
	var scenario_total := int(result.get("unfilteredTotal", -1))
	var matching_total := int(result.get("matchedBeforeGroup", -1))
	if total > matching_total or matching_total > scenario_total or matching_total < 0 or _count_sum(result.unfilteredCounts) != scenario_total:
		return false
	var facet_total := 0
	for index in facets.size():
		if not facets[index] is Dictionary or str(facets[index].get("id", "")) != CATEGORY_IDS[index]:
			return false
		var count := _count_sum(facets[index])
		if count < 0 or count != int(facets[index].get("total", -1)):
			return false
		facet_total += count
	if facet_total != matching_total:
		return false
	for row in rows:
		if not row is Dictionary or not row.get("code") is String or not row.get("message") is String or row.get("severity") not in SEVERITIES.slice(1):
			return false
	return true


func _count_sum(counts: Dictionary) -> int:
	var total := 0
	for key in ["errors", "warnings", "information"]:
		var value := int(counts.get(key, -1))
		if value < 0:
			return -1
		total += value
	return total


func _clear_page() -> void:
	page.clear()
	revision = -1
	selected_index = -1
	error = ""


func _fail(message: String) -> bool:
	error = message
	status = "failed"
	changed.emit()
	refresh_completed.emit(request_generation, false)
	return false

func read_navigation_state() -> Dictionary:
	return {"query":query,"severity":severity,"code":code,"category":category,"showAll":show_all,"groupIdentity":group_identity,"pages":_pages.duplicate(),"selections":_selections.duplicate(true),"positions":_positions.duplicate()}

func restore_navigation_state(location: Dictionary) -> bool:
	query=str(location.get("query","")); severity=str(location.get("severity","")); code=str(location.get("code","")); category=str(location.get("category",""))
	show_all=bool(location.get("showAll",false)); group_identity=str(location.get("groupIdentity",""))
	if severity not in SEVERITIES or (not category.is_empty() and category not in CATEGORY_IDS): return false
	_pages=location.get("pages",{}).duplicate(); _selections=location.get("selections",{}).duplicate(true); _positions=location.get("positions",{}).duplicate()
	return _load(false)
