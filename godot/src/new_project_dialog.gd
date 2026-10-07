class_name ProvidenceNewProjectDialog
extends ConfirmationDialog

signal project_create_requested(project_id: String, project_path: String)

@onready var _project_name: LineEdit = %ProjectName
@onready var _project_path: LineEdit = %ProjectLocation
@onready var _project_id: Label = %ProjectIdentityPreview
@onready var _validation: Label = %NewProjectValidation
@onready var _directory_dialog: FileDialog = %ProjectDirectoryPicker


func _ready() -> void:
	name = "NewProjectDialog"
	title = "New Providence Project"
	ok_button_text = "Create Project"
	cancel_button_text = "Cancel"
	wrap_controls = false
	min_size = Vector2i(760, 520)
	_project_name.text_changed.connect(func(_text: String) -> void: _update_validation())
	_project_path.text_changed.connect(func(_text: String) -> void: _update_validation())
	%BrowseProjectLocation.pressed.connect(_browse_location)
	_directory_dialog.dir_selected.connect(_select_location)
	confirmed.connect(_submit)
	custom_action.connect(_on_custom_action)
	add_button("Validate", true, "validate")
	_update_validation()


func popup_new() -> void:
	_project_name.text = ""
	_project_path.text = ""
	_update_validation()
	popup_centered(Vector2i(760, 520))
	_project_name.call_deferred("grab_focus")


func _browse_location() -> void:
	var documents := OS.get_system_dir(OS.SYSTEM_DIR_DOCUMENTS)
	if not documents.is_empty():
		_directory_dialog.current_dir = documents
	_directory_dialog.popup_centered_ratio(0.72)


func _select_location(path: String) -> void:
	_project_path.text = path
	_update_validation()


func _on_custom_action(action: StringName) -> void:
	if action == &"validate":
		_update_validation()


func _submit() -> void:
	var project_id := _slug(_project_name.text)
	if project_id.is_empty() or _project_path.text.strip_edges().is_empty():
		return
	project_create_requested.emit(project_id, _project_path.text.strip_edges())


func _update_validation() -> void:
	var project_id := _slug(_project_name.text)
	var path := _project_path.text.strip_edges()
	_project_id.text = ""
	_project_id.hide()
	var valid := not project_id.is_empty() and not path.is_empty()
	get_ok_button().disabled = not valid
	if project_id.is_empty():
		_validation.text = "Enter a project name containing at least one ASCII letter or digit."
		_validation.add_theme_color_override("font_color", Color("e5b567"))
	elif path.is_empty():
		_validation.text = "Choose the new project directory. Existing non-empty directories are never overwritten."
		_validation.add_theme_color_override("font_color", Color("e5b567"))
	else:
		_validation.text = ""
		_validation.add_theme_color_override("font_color", Color("7dcaa2"))


func _slug(value: String) -> String:
	var output := ""
	var pending_hyphen := false
	for index: int in range(value.length()):
		var code := value.unicode_at(index)
		if code >= 65 and code <= 90:
			code += 32
		if (code >= 97 and code <= 122) or (code >= 48 and code <= 57):
			if pending_hyphen and not output.is_empty():
				output += "-"
			pending_hyphen = false
			output += char(code)
		elif not output.is_empty():
			pending_hyphen = true
	return output.left(64).trim_suffix("-")
