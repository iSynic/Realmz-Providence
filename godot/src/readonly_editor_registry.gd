class_name ProvidenceReadonlyEditorRegistry
extends RefCounted

const Routes = preload("res://src/route_catalog.gd")


static func select_tab(tabs: TabContainer, index: int) -> void:
	var previous_focus := tabs.get_viewport().gui_get_focus_owner()
	tabs.current_tab = index
	if previous_focus == null or tabs.get_viewport().gui_get_focus_owner() != null:
		return
	var page := tabs.get_current_tab_control()
	var entries := {"rules.spells": "SpellSearch", "scenario.startup": "ScenarioName", "scenario.restrictions": "RaceChecklist", "scenario.contact": "ContactTitle", "scenario.registration": "CodeSegment1"}
	var identity := Routes.document_identity(index)
	var entry: Control = null
	if entries.has(identity):
		entry = page.find_child(str(entries[identity]), true, false) as Control
	if entry != null and entry.is_visible_in_tree() and entry.focus_mode == Control.FOCUS_ALL and not (entry is BaseButton and entry.disabled):
		entry.grab_focus()
		return
	for field in page.find_children("*", "Control", true, false):
		if field.is_visible_in_tree() and field.focus_mode == Control.FOCUS_ALL and not (field is BaseButton and field.disabled):
			field.grab_focus()
			return


static func configure_toolbar(editor: Control, title: Label, apply: Button) -> void:
	title.text = editor.workbench_title()
	apply.text = editor.apply_label()
	apply.disabled = true


static func bind_workbenches(editors: Array, documents: ProvidenceDocumentRegistry, operations: ProvidenceEditorOperation, read_bridge: Callable) -> void:
	for editor in editors:
		editor.configure_operations(operations, read_bridge)
		documents.register_controller(editor.route_identity(), ProvidenceWorkbenchController.new(
			editor.route_identity(), editor, editor.refresh_workbench, editor.teardown_session))
