extends VBoxContainer

signal source_requested(source: String)
signal configure_requested
const SOURCES := ["authoring", "selected", "scenario", "application"]
var _source := "authoring"

func _ready() -> void:
	for label in ["Standard + scenario custom", "Castle-selected rules", "Retained scenario table", "Application reference"]: %SourceChoice.add_item(label)
	%SourceChoice.item_selected.connect(func(index: int):
		%SourceChoice.select(SOURCES.find(_source))
		if SOURCES[index] != _source: source_requested.emit(SOURCES[index]))
	%ConfigureSources.pressed.connect(configure_requested.emit)

func set_source(source: String) -> void:
	_source = source if source in SOURCES else "selected"
	%SourceChoice.select(SOURCES.find(_source))

func show_context(context: Dictionary) -> void:
	%SourceNotice.text = str(context.get("notice", ""))
	%SourceNotice.visible = not %SourceNotice.text.is_empty()

func set_locked(locked: bool) -> void:
	%SourceChoice.disabled = locked
	%ConfigureSources.disabled = locked
