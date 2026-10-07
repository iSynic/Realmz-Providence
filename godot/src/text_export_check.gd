extends HSplitContainer

var _operations: ProvidenceEditorOperation
var _read_bridge: Callable
var _navigation
var _accept: Callable
var _applied: Callable
var _rows: Array = []
var _selected: Dictionary = {}
var _generation := 0
var _offset := 0
var _matched := 0
var _reading := false

func configure_navigation(navigation, accept: Callable, applied: Callable) -> Control:
	_navigation = navigation
	%TextRepair.configure_link_actions(navigation.open_script_source if navigation != null and navigation.has_method("open_script_source") else Callable(),Callable())
	_accept = accept
	_applied = applied
	return self

func configure_operations(operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	_operations = operations
	_read_bridge = read_bridge
	%TextRepair.configure_operations(operations)

func _ready() -> void:
	theme = preload("res://src/story_text_theme.tres")
	%IssueSearch.text_changed.connect(func(_text): _changed())
	%IssueFamily.item_selected.connect(func(_index): _changed())
	%IncludeClean.toggled.connect(func(_pressed): _changed())
	%Refresh.pressed.connect(refresh_workbench)
	%FilterTimer.timeout.connect(refresh_workbench)
	%Previous.pressed.connect(func(): _offset = maxi(0,_offset-64); refresh_workbench())
	%Next.pressed.connect(func(): _offset += 64; refresh_workbench())
	%ExportIssueTable.item_selected.connect(_select_row)
	%ExportIssueTable.item_activated.connect(func(index): _select_row(index); open_owner())
	%OpenOwner.pressed.connect(open_owner)
	%IssueIndex.value_changed.connect(func(_value): _show_details())
	%TextRepair.applied.connect(func(projection, _identity): _accept.call(projection); _applied.call(projection); refresh_workbench())
	_clear("Choose Refresh to check Classic text encoding.")

func route_identity() -> String: return "text.spell-check"
func workbench_title() -> String: return "Check Text Export"
func apply_label() -> String: return "Refresh"
func command_state(command: String) -> String: return "working" if command in ["text.export-check","message.open","option-label.open","text-resource.open"] else "visible-disabled"
func has_unapplied_changes() -> bool: return %TextRepair.has_unapplied_changes()
func discard_draft() -> void: %TextRepair.discard_draft()

func teardown_session() -> void:
	_generation += 1
	%FilterTimer.stop()
	%TextRepair.discard_draft()
	_clear("Open a scenario to check its text.")

func _changed() -> void:
	_generation += 1
	_offset = 0
	_clear("Checking updated filters…")
	%FilterTimer.start()

func refresh_workbench(borrowed: ProvidenceEditorOperation = null) -> Dictionary:
	if not _read_bridge.is_valid(): return {"ok":false,"error":"Open a scenario first."}
	var generation := _generation
	if borrowed == null:
		while _reading or _operations.busy:
			await get_tree().process_frame
			if generation != _generation: return {"ok":false,"discarded":true}
	_reading = true
	_clear("Checking text encoding…")
	var params := {"query":%IssueSearch.text,"family":["all","message","option-label","text-resource"][%IssueFamily.selected],"includeReady":%IncludeClean.button_pressed,"offset":_offset,"limit":64}
	var response: Dictionary = await _operations.run_workflow(_read_bridge.call(),"Check Text Export",func(operation): return await operation.request("text.export-check",params),borrowed)
	_reading = false
	if generation != _generation: return {"ok":false,"discarded":true}
	if not response.get("ok",false):
		_clear("Could not check text. Your project is unchanged. " + str(response.get("error","Choose Refresh to retry.")))
		return response
	_present(response.result)
	return response

func _present(result: Dictionary) -> void:
	_rows = result.get("items",[])
	_offset = int(result.get("offset",0))
	_matched = int(result.get("matched",0))
	var summary: Dictionary = result.get("summary",{})
	%ExportSummary.text = "%d clean · %d need review · %d Strings · %d Option Labels · %d TEXT" % [int(summary.get("ready",0)),int(summary.get("issues",0)),int(summary.get("messages",0)),int(summary.get("optionLabels",0)),int(summary.get("textResources",0))]
	%ExportIssueTable.clear()
	for row in _rows:
		%ExportIssueTable.add_item("%s %d · %s · %s" % [_family_name(row.family),int(row.nativeId),str(row.status).capitalize(),str(row.preview).replace("\n"," ")])
	%IssueCount.text = "%d shown · %d matching" % [_rows.size(),_matched]
	%Previous.disabled = _offset <= 0
	%Next.disabled = not bool(result.get("truncated",false))
	%Refresh.disabled = false
	if not _rows.is_empty(): %ExportIssueTable.select(0); _select_row(0)
	else: %IssueIdentity.text = "No matching text needs review"; %MessagePreview.text = "Include clean text to inspect all supported families."

func _clear(message: String) -> void:
	_rows.clear()
	_selected.clear()
	%ExportIssueTable.clear()
	%ExportSummary.text = ""
	%IssueCount.text = message
	%IssueIdentity.text = "CHECK TEXT EXPORT"
	%MessagePreview.text = ""
	%IssueDetails.text = ""
	%IssueIndex.set_value_no_signal(1)
	%IssueIndex.editable = false
	%OpenOwner.disabled = true
	%Previous.disabled = true
	%Next.disabled = true
	%Refresh.disabled = _reading

func _select_row(index: int) -> void:
	if index < 0 or index >= _rows.size(): return
	_selected = _rows[index].duplicate(true)
	var label := str(_selected.get("label",""))
	%IssueIdentity.text = "%s %d%s" % [_family_name(_selected.family),int(_selected.nativeId)," · "+label if not label.is_empty() else ""]
	%MessagePreview.text = str(_selected.preview) + ("\n\nOpen the owning field for the complete text." if _selected.get("previewTruncated",false) else "")
	var issues: Array = _selected.get("issues",[])
	%IssueIndex.max_value = maxi(1,issues.size())
	%IssueIndex.set_value_no_signal(1)
	%IssueIndex.editable = not issues.is_empty()
	%OpenOwner.disabled = _selected.has("readError")
	_show_details()

func _show_details() -> void:
	if _selected.is_empty(): return
	var maximum = _selected.get("classicMaximumBytes")
	%IssueDetails.text = "%d Classic bytes%s · %s" % [int(_selected.encodedBytes)," / %d" % int(maximum) if maximum != null else " · no fixed-row limit",str(_selected.status).capitalize()]
	var issues: Array = _selected.get("issues",[])
	if not issues.is_empty():
		var issue: Dictionary = issues[mini(int(%IssueIndex.value)-1,issues.size()-1)]
		%IssueDetails.text += "\nIssue %d of %d · Line %d, column %d: %s" % [int(%IssueIndex.value),issues.size(),int(issue.line),int(issue.column),str(issue.get("reason", "Unsupported character " + str(issue.get("character",""))))]
		if issue.has("context"): %IssueDetails.text += "\n" + str(issue.context)
		if _selected.get("feedback",{}).get("issuesTruncated",false): %IssueDetails.text += "\nFirst 128 unsupported characters shown. Refresh after repair for remaining issues."
	if _selected.has("readError"): %IssueDetails.text += "\n" + str(_selected.readError)

func open_owner() -> void:
	if _selected.is_empty() or %OpenOwner.disabled: return
	var row := _selected.duplicate(true)
	var generation := _generation
	var issue_index := int(%IssueIndex.value)
	var issue: Dictionary = row.issues[mini(issue_index-1,row.issues.size()-1)].duplicate(true) if not row.get("issues",[]).is_empty() else {}
	if row.family == "text-resource":
		var response: Dictionary = await %TextRepair.open_text(_read_bridge.call(),row.identity)
		if generation != _generation or _selected.get("identity") != row.identity or issue_index != int(%IssueIndex.value):
			%TextRepair.discard_draft(); return
		if response.get("ok",false): _highlight(%TextRepair.editor,issue)
		else: %IssueDetails.text = str(response.get("error","Could not open this text."))
	elif _navigation != null:
		if await _navigation.open_script_target(row.family,int(row.nativeId),row.identity,{}):
			var view: Control = _navigation.current_view()
			if view.has_method("highlight_occurrence"):
				if generation != _generation or _selected.get("identity") != row.identity or issue_index != int(%IssueIndex.value): return
				view.highlight_occurrence({"characterIndex":int(issue.get("characterIndex",0)),"characterLength":1 if issue.has("characterIndex") else 0})

func _highlight(edit: TextEdit, issue: Dictionary) -> void:
	if issue.is_empty(): return
	var prefix := edit.text.left(int(issue.characterIndex))
	var line := prefix.count("\n")
	var column := prefix.length()-prefix.rfind("\n")-1
	edit.set_caret_line(line)
	edit.set_caret_column(column)
	edit.select(line,column,line,mini(column+1,edit.get_line(line).length()))
	edit.grab_focus()

func _family_name(family: String) -> String:
	return {"message":"String","option-label":"Option Label","text-resource":"Text"}.get(family,family)

func read_navigation_state() -> Dictionary:
	return {"query":%IssueSearch.text,"family":%IssueFamily.selected,"includeClean":%IncludeClean.button_pressed,"offset":_offset,"identity":str(_selected.get("identity","")),"issueIndex":int(%IssueIndex.value),"scroll":%ExportIssueTable.get_v_scroll_bar().value,"focus":str(get_path_to(get_viewport().gui_get_focus_owner())) if get_viewport().gui_get_focus_owner()!=null and is_ancestor_of(get_viewport().gui_get_focus_owner()) else ""}

func restore_navigation_state(state: Dictionary) -> bool:
	_generation += 1
	%IssueSearch.text = str(state.get("query",""))
	%IssueFamily.select(int(state.get("family",0)))
	%IncludeClean.set_pressed_no_signal(bool(state.get("includeClean",false)))
	_offset = int(state.get("offset",0))
	var response := await refresh_workbench()
	if not response.get("ok",false): return false
	for index in _rows.size():
		if str(_rows[index].identity)==str(state.get("identity","")): %ExportIssueTable.select(index); _select_row(index); break
	%IssueIndex.value = mini(int(state.get("issueIndex",1)),int(%IssueIndex.max_value))
	%ExportIssueTable.get_v_scroll_bar().value = float(state.get("scroll",0))
	var focus := get_node_or_null(str(state.get("focus",""))) as Control
	if focus != null: focus.grab_focus()
	return true

func configure_text_preview(preview_opener: Callable) -> void:
	%TextRepair.configure_link_actions(_navigation.open_script_source if _navigation != null else Callable(),preview_opener)
