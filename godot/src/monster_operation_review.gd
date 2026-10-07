extends Window

signal review_requested(kind: String, target: Variant)
signal commit_requested
signal use_open_requested(reference: Dictionary)
signal retarget_requested(reference: Dictionary)
signal membership_removed(identity: String)
signal destination_changed(identity: String, value: Variant)

const OPTIONS := {"Duplicate": [["duplicate", "Duplicate to an empty ID"]],
	"ClearSelection": [["clear", "Clear this set record"]], "Switch": [["switch", "Switch two set records"]],
	"NewMonster": [["create", "Create in the selected set"]],
	"Variants": [["generate-variants", "Generate Monster and Mega variants"], ["copy-all-sets", "Copy selected record unchanged to all sets"], ["generate-all-variants", "Generate variants for eligible Normal records"]]}
var _source_focus: Control
var _reviewed := false
var input_revision := 0
var _page := 0
var _use_edits: Dictionary = {}
var _transfer := false
const PAGE_SIZE := 128
const Labels = preload("res://src/monster_review_labels.gd")


func _ready() -> void:
	%Review.pressed.connect(_request_review)
	%Commit.pressed.connect(func(): if _reviewed: commit_requested.emit())
	%Cancel.pressed.connect(cancel)
	close_requested.connect(cancel)
	%Target.text_changed.connect(func(_text): _use_edits.clear(); invalidate())
	%Label.text_changed.connect(func(_text): _use_edits.clear(); invalidate())
	%Operation.item_selected.connect(func(_index): _use_edits.clear(); _update_target(); invalidate())
	%Sections.tab_changed.connect(_show_section)
	%Previous.pressed.connect(func(): _page = maxi(0, _page - 1); _render_page())
	%Next.pressed.connect(func(): _page += 1; _render_page())
	%Rows.item_selected.connect(_select_use)
	%AllocationEdit.remove_requested.connect(membership_removed.emit)
	%AllocationEdit.destination_requested.connect(destination_changed.emit)
	%AllocationEdit.input_changed.connect(invalidate.bind(false))
	%RetargetUse.pressed.connect(func():
		var row: TreeItem = %Rows.get_selected()
		if row != null and not %RetargetUse.disabled: retarget_requested.emit(row.get_metadata(0)))
	%KeepUse.pressed.connect(_keep_use)
	%OpenUse.pressed.connect(func():
		var row: TreeItem = %Rows.get_selected()
		if row != null and row.get_metadata(0) is Dictionary: use_open_requested.emit(row.get_metadata(0)))
	%Rows.set_column_title(0, "Record / field")
	%Rows.set_column_title(1, "Before")
	%Rows.set_column_title(2, "After")


func begin(action: String, destination: String, suggested_id: int, source_focus: Control = null) -> void:
	begin_options(OPTIONS.get(action, []), destination, suggested_id, "", source_focus)


func begin_options(options: Array, destination: String, suggested_id: int, label := "", source_focus: Control = null) -> void:
	set_transfer_mode(false)
	_use_edits.clear()
	_source_focus = source_focus
	%Destination.text = destination
	%Operation.clear()
	for option in options:
		%Operation.add_item(option[1])
		%Operation.set_item_metadata(%Operation.item_count - 1, option[0])
	%Target.text = str(suggested_id) if suggested_id > 0 else ""
	%Label.text = label
	_update_target()
	invalidate()
	popup_centered(Vector2i(1040, 660))
	(%Target if %Target.is_visible_in_tree() else %Review).grab_focus()


func set_transfer_mode(enabled: bool) -> void:
	_transfer = enabled
	%Sections.current_tab = 0
	%Sections.set_tab_title(2, "Membership & destinations" if enabled else "Excluded")
	%Sections.set_tab_hidden(3, not enabled)
	%AllocationEdit.hide()


func remove_transfer_member(identity: String) -> void:
	var sections: Dictionary = get_meta("sections", {})
	sections["excluded"] = sections.get("excluded", []).filter(func(row): return row.identity != identity)
	invalidate(false)
	_render_page()


func _update_target() -> void:
	%TargetRow.visible = selected_kind() in ["create", "duplicate", "switch", "create-library", "transfer-normal", "transfer-all", "transfer-generate", "transfer-replace"]
	%LabelRow.visible = selected_kind() in ["create-library", "duplicate-library", "customize", "copy-library"]
	%TargetLabel.text = "Other record ID" if selected_kind() == "switch" else "Destination ID"


func selected_kind() -> String:
	return str(%Operation.get_item_metadata(%Operation.selected)) if %Operation.selected >= 0 else ""


func _request_review() -> void:
	%Commit.disabled = true
	%Review.disabled = true
	%Status.text = "Preparing the complete impact preview…"
	var text: String = %Target.text
	review_requested.emit(selected_kind(), int(text) if text.is_valid_int() else text)


func invalidate(clear_rows := true) -> void:
	input_revision += 1
	_reviewed = false
	%Review.disabled = false
	%Commit.disabled = true
	%Status.text = "Review the complete changes before committing. %d explicit retargets are retained; other references keep their current IDs." % _use_edits.size()
	if clear_rows:
		%Rows.clear()
		set_meta("sections", {})
		%UseActions.hide()


func receive_review(response: Dictionary, sections: Dictionary = {}) -> void:
	%Review.disabled = false
	_reviewed = response.get("ok", false) and not sections.get("changes", []).is_empty()
	%Commit.disabled = not _reviewed
	if not response.get("ok", false):
		%Status.text = str(response.get("error", "The preview could not be prepared. No changes were made."))
		return
	set_meta("sections", sections)
	%Status.text = "%d field changes · %d existing uses · %d allocations / exclusions · %d explicit retargets" % [sections.changes.size(), sections.uses.size(), sections.excluded.size(), _use_edits.size()]
	_show_section(%Sections.current_tab)


func _show_section(index: int) -> void:
	_page = 0
	%UseActions.visible = index == 1
	%AllocationEdit.visible = _transfer and index == 2
	%AllocationEdit.bind_selection({}, false)
	_render_page()


func _render_page() -> void:
	%Rows.clear()
	%OpenUse.disabled = true
	%RetargetUse.disabled = true
	%KeepUse.disabled = true
	var root: TreeItem = %Rows.create_item()
	var index: int = %Sections.current_tab
	var rows: Array = get_meta("sections", {}).get(["changes", "uses", "excluded", "comparison"][index], [])
	if index == 0: rows = rows.filter(func(entry): return not _technical(entry.field))
	%Rows.columns = 4 if index == 3 else 3
	for column in %Rows.columns:
		%Rows.set_column_title(column, (["Record / field", "Library source", "Current scenario", "Proposed"] if index == 3 else ["Record / field", "Before", "After"])[column])
	_page = mini(_page, maxi(0, (rows.size() - 1) / PAGE_SIZE))
	%PageCount.text = "%d total · %d–%d shown" % [rows.size(), _page * PAGE_SIZE + 1, mini((_page + 1) * PAGE_SIZE, rows.size())] if not rows.is_empty() else "No entries in this section."
	%Previous.disabled = _page == 0
	%Next.disabled = (_page + 1) * PAGE_SIZE >= rows.size()
	for entry in rows.slice(_page * PAGE_SIZE, (_page + 1) * PAGE_SIZE):
		var row: TreeItem = %Rows.create_item(root)
		if index == 0:
			row.set_text(0, "%s · %s" % [Labels.owner(entry.entity), Labels.field(entry.field, entry.entity)])
			row.set_text(1, _value(entry.before))
			row.set_text(2, _value(entry.after))
		elif index == 1:
			row.set_text(0, "%s · %s" % [Labels.owner(entry.source), Labels.field(entry.field, entry.source)])
			row.set_text(1, str(entry.get("rawValue", entry.targetId)))
			var edit: Dictionary = _use_edits.get(_use_key(entry), {})
			row.set_text(2, "Keep current ID" if edit.is_empty() else "Retarget to %s · preserve sign" % edit.targetId)
			row.set_metadata(0, entry)
		elif index == 2:
			if entry is Dictionary:
				row.set_text(0, str(entry.get("label", "Library entry")))
				row.set_text(1, "Preferred %d" % int(entry.preferredId))
				row.set_text(2, "Monster %d · %s" % [int(entry.targetId), str(entry.reason).replace("-", " ")])
				row.set_metadata(0, entry)
			else:
				row.set_text(0, "Monster %s" % entry[0])
				row.set_text(2, str(entry[1]))
		else:
			row.set_text(0, "%s · %s" % [Labels.owner(entry.entity), Labels.field(entry.field, entry.entity)])
			row.set_text(1, _value(entry.source))
			row.set_text(2, _value(entry.before))
			row.set_text(3, _value(entry.after))
		for column in %Rows.columns: row.set_tooltip_text(column, row.get_text(column))
		if index == 1: row.set_tooltip_text(0, str(entry.get("context", "")))


func _use_key(entry: Dictionary) -> String:
	return "%s/%s" % [entry.source, entry.field]


func _select_use() -> void:
	var row: TreeItem = %Rows.get_selected()
	var entry: Variant = row.get_metadata(0) if row != null else null
	if not entry is Dictionary: return
	if _transfer and %Sections.current_tab == 2:
		%AllocationEdit.bind_selection(entry, not get_meta("sections", {}).get("excluded", []).is_empty())
		return
	if %Sections.current_tab != 1: return
	%OpenUse.disabled = use_open_requested.get_connections().is_empty()
	%RetargetUse.disabled = get_meta("owner", "") != "record" or not entry.get("canRetarget", false)
	%KeepUse.disabled = not _use_edits.has(_use_key(entry))
	%UseReason.text = str(entry.get("context", ""))


func accept_retarget(entry: Dictionary, choice: Dictionary) -> void:
	if not visible or not entry.get("canRetarget", false) or not choice.get("available", false): return
	if int(choice.get("value", 0)) < 1 or int(choice.value) > 32767: return
	if int(choice.value) == int(entry.targetId) and not _use_edits.has(_use_key(entry)): return
	_use_edits[_use_key(entry)] = {"source": entry.source, "field": entry.field, "targetId": int(choice.value)}
	invalidate(false)
	_render_page()


func _keep_use() -> void:
	var row: TreeItem = %Rows.get_selected()
	if row == null: return
	_use_edits.erase(_use_key(row.get_metadata(0)))
	invalidate(false)
	_render_page()


func use_edits() -> Array:
	return _use_edits.values().duplicate(true)


func set_committing() -> void:
	%Commit.disabled = true
	%Review.disabled = true
	%AllocationEdit.set_locked(true)
	%Status.text = "Committing the reviewed operation…"


func cancel() -> void:
	$ReplacementPicker.cancel(false)
	hide()
	invalidate()
	var closed_revision := input_revision
	var focus := _source_focus
	if is_instance_valid(focus):
		(func(): if not visible and input_revision == closed_revision and is_instance_valid(focus): focus.grab_focus()).call_deferred()


func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"):
		cancel()
		set_input_as_handled()


func _value(value: Variant) -> String:
	if value is float and value == floor(value): return str(int(value))
	if value is String:
		return {"built-in": "Protected stock", "custom": "Custom Library entry", "built-in-override": "Editable protected-source override", "scenario-copy": "Scenario copy"}.get(value, value)
	return "Empty" if value == null else str(value)


func _technical(field: String) -> bool:
	return field.begins_with("nativeMetadata") or field.begins_with("template.nativeMetadata") or field == "origin.sourceEntry" or field == "origin.sourceProject" or field == "origin.sourceRevision"
