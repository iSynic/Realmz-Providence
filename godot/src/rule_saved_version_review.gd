extends Window

signal accepted(document: Dictionary, context: Dictionary)
var _document: Dictionary = {}
var _context: Dictionary = {}
var _focus: Control

func _ready() -> void:
	close_requested.connect(cancel)
	%KeepDraft.pressed.connect(cancel)
	%UseSaved.pressed.connect(func():
		var document := _document.duplicate(true); var context := _context.duplicate(true)
		cancel(); accepted.emit(document, context))
	for index in 3: %Differences.set_column_title(index, ["Field", "Your local draft", "Saved version"][index])

func begin(local: Dictionary, document: Dictionary, context: Dictionary, focus: Control) -> void:
	_document = document.duplicate(true); _context = context.duplicate(true); _focus = focus
	%Destination.text = "%s %d · %s · saved revision %d" % [str(local.kind).capitalize(), int(document.authorId), str(local.definition.name), int(document.revision)]
	%Differences.clear()
	var root: TreeItem = %Differences.create_item()
	for family in ["definition", "nativeFields"]:
		for field in local.get(family, {}):
			var saved: Variant = document.draft.edit.get(family, {}).get(field)
			if local[family][field] == saved: continue
			var row: TreeItem = %Differences.create_item(root)
			row.set_text(0, field.capitalize()); row.set_text(1, str(local[family][field])); row.set_text(2, str(saved))
	popup_centered(Vector2i(850, 500)); %KeepDraft.grab_focus()

func cancel() -> void:
	hide(); _document.clear(); _context.clear()
	if is_instance_valid(_focus) and _focus.is_visible_in_tree(): _focus.grab_focus()
	_focus = null

func _input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("ui_cancel"): cancel(); set_input_as_handled()
