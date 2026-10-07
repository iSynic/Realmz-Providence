class_name EditorHelpBinding
extends RefCounted


static func bind_scripts(scripts: RefCounted, code_helper: Window, manual_reader: Window) -> void:
	scripts.code_help_requested.connect(func(code: int, origin: Control): code_helper.open_for_code(code, origin))
	scripts.manual_requested.connect(func(page: int, origin: Control): manual_reader.open_page(page, origin))


static func bind_commands(commands: Node, code_helper: Window, manual_reader: Window, mark: Button = null) -> void:
	commands.configure_help(manual_reader, code_helper)
	code_helper.manual_requested.connect(func(page: int): manual_reader.open_page(page))
	if mark != null:
		mark.pressed.connect(func(): manual_reader.open_page(1, mark))
