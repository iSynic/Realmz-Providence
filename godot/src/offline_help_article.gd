extends VBoxContainer

signal link_requested(target: String)
signal image_requested(row: Dictionary, origin: Control)

const Section = preload("res://src/offline_help_section.tscn")
const ImageCard = preload("res://src/offline_help_image.tscn")
const ShortcutRow = preload("res://src/offline_help_shortcut.tscn")
var anchors: Dictionary = {}
var _entry: Dictionary = {}
var _commands: Array = []


func present(entry: Dictionary, commands: Array, availability: Dictionary) -> void:
	_entry = entry
	_commands = commands.duplicate(true)
	anchors.clear()
	for child in %Sections.get_children():
		%Sections.remove_child(child)
		child.queue_free()
	%ChapterKind.text = ("MANUAL CHAPTER · " if entry.group == "chapters" else "APPENDIX · ") + str(entry.title).to_upper()
	%Summary.text = str(entry.summary)
	set_availability(availability)
	if not entry.images.is_empty(): _gallery(entry.images)
	if entry.id == "shortcuts": _shortcuts(commands)
	elif entry.id == "about": _about()
	else:
		for section: Dictionary in entry.sections: _section(section.title, section.anchor, section.body)


func set_availability(availability: Dictionary) -> void:
	%OpenTool.visible = not str(_entry.get("route", "")).is_empty()
	%OpenTool.disabled = not availability.get("allowed", false)
	%OpenTool.tooltip_text = str(availability.get("reason", ""))
	%OpenTool.text = "Open %s →" % _entry.get("title", "Tool")


func refresh_commands(commands: Array) -> bool:
	if _entry.get("id") == "shortcuts" and commands != _commands:
		present(_entry, commands, {"allowed": false})
		return true
	return false


func _section(title: String, anchor: String, body: String) -> Control:
	var card := Section.instantiate()
	%Sections.add_child(card)
	card.get_node("Body/Heading").text = title.to_upper()
	var text: RichTextLabel = card.get_node("Body/Text")
	text.text = body
	text.visible = not body.is_empty()
	text.meta_clicked.connect(func(target): link_requested.emit(str(target)))
	anchors[anchor] = {"title": title, "control": card}
	return card


func _gallery(images: Array) -> void:
	var card := _section("Providence editor · chapter gallery", "gallery", "")
	for row: Dictionary in images:
		var gallery := ImageCard.instantiate()
		card.get_node("Body/Content").add_child(gallery)
		gallery.get_node("Caption").text = row.caption + "\nView image at actual size · click or press Enter"
		var button: Button = gallery.get_node("Open")
		var texture: Texture2D = load(row.path)
		gallery.get_node("Open/Image").texture = texture
		button.disabled = texture == null
		button.pressed.connect(func(): image_requested.emit(row, button))


func _shortcuts(commands: Array) -> void:
	var groups: Dictionary = {}
	for row: Dictionary in commands:
		if not groups.has(row.group): groups[row.group] = []
		groups[row.group].append(row)
	for group: String in groups:
		var card := _section(group, group.to_lower(), "")
		_shortcut_row(card, ["Command", "Shortcut", "Availability"], true)
		for row: Dictionary in groups[group]:
			var keys := " / ".join(row.shortcuts) if not row.shortcuts.is_empty() else "Unassigned"
			var state := "Available" if row.enabled else str(row.unavailableReason)
			_shortcut_row(card, [row.label, keys, state])


func _shortcut_row(card: Control, values: Array, heading := false) -> void:
	var row := ShortcutRow.instantiate()
	card.get_node("Body/Content").add_child(row)
	for index in 3:
		var label: Label = row.get_child(index)
		label.text = str(values[index])
		label.theme_type_variation = "HelpKicker" if heading else ""


func _about() -> void:
	_section("Providence", "providence", "Native Realmz scenario authoring with Godot and a platform-independent Rust compatibility core.")
	_section("Version", "version", "%s · %s · %s\nGodot %s" % [ProjectSettings.get_setting("application/config/version", "Development"), OS.get_name(), Engine.get_architecture_name(), Engine.get_version_info().string])
	_section("Source license", "source-license", "Original Rust and Godot source, tools and documentation: GPL-3.0-or-later.\n[url=chapter:licenses]Read the full licenses and attribution[/url].")
	_section("Realmz resources", "realmz-resources", "Realmz and Divinity resources retain CC BY-NC-SA 4.0 and original attribution. Third-party dependencies retain their separate notices.")
	_section("Offline support", "offline-support", "Documents, Keyboard Shortcuts, Compatibility Glossary, Source Evidence Guide, licenses and notices are included locally. Preview and playtest use a separate Rebuilt process.")
