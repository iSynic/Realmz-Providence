class_name ProvidenceProblemsDock
extends VBoxContainer

signal tab_changed(tab: int)
signal expansion_changed(expanded: bool)

var _diagnostics: Array = []

@onready var tabs: TabBar = %BottomTabs
@onready var content: ScrollContainer = %ProblemsContent
@onready var problem_rows: VBoxContainer = %ProblemRows
@onready var toggle: Button = %ToggleProblemsDock


func _ready() -> void:
	set_expanded(false)


func is_expanded() -> bool:
	return content.visible


func set_expanded(expanded: bool) -> void:
	content.visible = expanded
	toggle.text = "Collapse" if expanded else "Expand"
	toggle.tooltip_text = "Collapse Problems and output" if expanded else "Expand Problems and output"
	expansion_changed.emit(expanded)


func _on_tab_changed(tab: int) -> void:
	if not is_expanded():
		set_expanded(true)
	tab_changed.emit(tab)


func _on_toggle_pressed() -> void:
	set_expanded(not is_expanded())


func selected_tab() -> int:
	return tabs.current_tab


func open_surface(tab: int) -> void:
	show()
	if tabs.current_tab == tab: _on_tab_changed(tab)
	else: tabs.current_tab = tab


func diagnostic_count() -> int:
	return _diagnostics.size()


func reset() -> void:
	_diagnostics.clear()
	show_selected_local()


func set_diagnostics(items: Array) -> void:
	_diagnostics = items.duplicate(true)
	if selected_tab() == 0: _render_diagnostics()


func merge_projection(projection: Dictionary) -> void:
	var affected := {}
	for identity in projection.get("affectedEntities", []): affected[str(identity)] = true
	var retained: Array = []
	for diagnostic: Dictionary in _diagnostics:
		if not affected.has(str(diagnostic.get("entity", ""))): retained.append(diagnostic)
	retained.append_array(projection.get("affectedDiagnostics", []))
	set_diagnostics(retained)


func show_selected_local() -> void:
	if selected_tab() == 0: _render_diagnostics()
	else: _render_empty(tabs.get_tab_title(selected_tab()))


func show_compatibility(targets: Array) -> void:
	_clear_rows()
	for target: Dictionary in targets:
		var heading := Label.new()
		heading.text = "%s  ·  %s" % [str(target.get("target", "target")).replace("-", " ").to_upper(), str(target.get("status", "incomplete")).to_upper()]
		heading.add_theme_color_override("font_color", Color("7dcaa2") if str(target.get("status", "")) == "ready" else Color("e5b567"))
		problem_rows.add_child(heading)
		for blocker: Dictionary in target.get("blockers", []):
			var label := Label.new()
			label.text = "  %s  ·  %s" % [str(blocker.get("code", "blocker")), str(blocker.get("message", ""))]
			label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			label.add_theme_color_override("font_color", Color("b8c3ce"))
			problem_rows.add_child(label)


func _render_diagnostics() -> void:
	_clear_rows()
	if _diagnostics.is_empty():
		var clear := Label.new()
		clear.text = "✓ No reference problems in the affected projection"
		clear.add_theme_color_override("font_color", Color("7dcaa2"))
		problem_rows.add_child(clear)
		return
	for row: Dictionary in _diagnostics:
		var label := Label.new()
		label.text = "●  %s   %s" % [str(row.get("code", "problem")), str(row.get("message", ""))]
		label.add_theme_color_override("font_color", Color("f09a82"))
		problem_rows.add_child(label)


func _render_empty(surface: String) -> void:
	_clear_rows()
	var label := Label.new()
	label.text = "%s has no output for the current native session." % surface
	label.add_theme_color_override("font_color", Color("8fa0ad"))
	problem_rows.add_child(label)


func _clear_rows() -> void:
	for child in problem_rows.get_children():
		problem_rows.remove_child(child)
		child.queue_free()
