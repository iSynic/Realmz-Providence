extends Window

const CATEGORIES := ["pictures", "icons", "portraits", "monster-artwork", "tilesets", "special-land", "sounds", "music", "text", "other"]
var _bridge: RefCounted
var _operations: ProvidenceEditorOperation
var _inventory := {}
var _prepared := {}
var _identity := ""
var _scope := "scenario"
var _generation := 0
var _busy := false
var _writing := false
var _loading := false
var _directory := ""


func _ready() -> void:
	close_requested.connect(_close)
	%Cancel.pressed.connect(_close)
	%Export.pressed.connect(func(): %Destination.popup_centered())
	%Destination.dir_selected.connect(export_to)
	%Destination.canceled.connect(func(): %Export.grab_focus())
	%OpenFolder.pressed.connect(func(): OS.shell_open(_directory))
	%Refresh.pressed.connect(_describe)
	%PrepareDelay.timeout.connect(_prepare)
	for checkbox in _checkboxes(): checkbox.toggled.connect(func(_enabled): _changed())


func open_export(bridge: RefCounted, operations: ProvidenceEditorOperation, scope: String, identity := "") -> void:
	if _busy: return
	_generation += 1
	_bridge = bridge; _operations = operations
	_scope = "library" if scope == "personal" else scope
	_identity = identity; _directory = ""; _prepared.clear(); _inventory.clear()
	_loading = true
	for node in _checkboxes(): node.disabled = false
	%Cancel.text = "Cancel"
	for entry in [[%Scenario, "scenario"], [%Library, "library"], [%Stock, "stock"]]:
		entry[0].set_pressed_no_signal(entry[1] == _scope)
		entry[0].disabled = not identity.is_empty()
	for node in %Categories.get_children(): node.set_pressed_no_signal(true)
	%Originals.set_pressed_no_signal(true); %Converted.set_pressed_no_signal(true)
	%Scopes.visible = identity.is_empty(); %CategorySection.visible = identity.is_empty()
	%Selection.text = "Export selected asset" if not identity.is_empty() else "Export asset categories"
	%OpenFolder.hide(); %Issues.hide(); %Export.show(); %Refresh.show()
	%Formats.show()
	%Export.disabled = true; _loading = false
	min_size = Vector2i(680, 620 if identity.is_empty() else 380)
	popup_centered(Vector2i(720, 650 if identity.is_empty() else 420))
	await _describe()


func _describe() -> void:
	if _busy or _bridge == null: return
	_busy = true; %Export.disabled = true; %Summary.text = "Reading available assets…"
	for node in _checkboxes(): node.disabled = true
	var generation := _generation
	var response := await _request("asset-export.describe", {})
	_busy = false
	if generation != _generation or not visible: return
	if not response.get("ok", false): _error(response); return
	_inventory = response.result
	%Originals.disabled = false; %Converted.disabled = false
	for node in %Categories.get_children(): node.disabled = false
	for entry in [[%Scenario, "scenario"], [%Library, "library"], [%Stock, "stock"]]:
		for row: Dictionary in _inventory.scopes:
			if row.id == entry[1]:
				entry[0].disabled = not _identity.is_empty() or not row.configured
				entry[0].text = {"scenario": "Scenario", "library": "My Library", "stock": "Stock"}[entry[1]] + " (%d)" % int(row.total)
	_update_counts()
	await _prepare()


func _checkboxes() -> Array:
	return [%Scenario, %Library, %Stock, %Originals, %Converted] + %Categories.get_children()


func _selection() -> Dictionary:
	var scopes: Array = []
	for entry in [[%Scenario, "scenario"], [%Library, "library"], [%Stock, "stock"]]:
		if entry[0].button_pressed: scopes.append(entry[1])
	var categories: Array = []
	for index in CATEGORIES.size():
		if %Categories.get_child(index).button_pressed: categories.append(CATEGORIES[index])
	return {"scopes": scopes, "categories": categories, "identity": _identity if not _identity.is_empty() else null,
		"originals": %Originals.button_pressed, "converted": %Converted.button_pressed}


func _changed() -> void:
	if _loading or _writing: return
	_generation += 1; _prepared.clear(); %Export.disabled = true
	_update_counts(); %Summary.text = "Updating export selection…"
	%PrepareDelay.start()


func _update_counts() -> void:
	var scopes: Array = _selection().scopes
	for index in _inventory.get("categories", []).size():
		var row: Dictionary = _inventory.categories[index]
		var count := 0
		for item: Dictionary in row.counts:
			if item.scope in scopes: count += int(item.count)
		%Categories.get_child(index).text = "%s (%d)" % [row.label, count]


func _prepare() -> void:
	if _busy or _writing:
		%PrepareDelay.start(); return
	if _bridge == null or not visible: return
	_busy = true; %Export.disabled = true
	var generation := _generation
	var response := await _request("asset-export.plan", {"selection": _selection()})
	_busy = false
	if generation != _generation or not visible: return
	if not response.get("ok", false): _error(response); return
	_prepared = response.result
	%Selection.text = str(_prepared.selectionLabel)
	%Summary.text = "%d %s selected · %d available %s" % [int(_prepared.assets), "asset" if int(_prepared.assets) == 1 else "assets", int(_prepared.convertible), "conversion" if int(_prepared.convertible) == 1 else "conversions"]
	if int(_prepared.unsupportedConversions) > 0:
		%Summary.text += "\n%d assets have no supported conversion; original files can still be exported." % int(_prepared.unsupportedConversions)
	%Export.disabled = false


func export_to(directory: String) -> void:
	if _prepared.is_empty() or _busy: return
	_busy = true; _writing = true; %PrepareDelay.stop()
	for node in _checkboxes(): node.disabled = true
	%Export.disabled = true; %Cancel.disabled = true; %Refresh.disabled = true
	%Summary.text = "Exporting selected assets…"
	var generation := _generation
	var response := await _request("asset-export.write", {"selection": _selection(), "reviewHash": _prepared.reviewHash, "directory": directory})
	_busy = false; _writing = false; %Cancel.disabled = false; %Refresh.disabled = false
	_prepared.clear()
	if generation != _generation or not visible: return
	if not response.get("ok", false):
		_error(response); %Refresh.grab_focus(); return
	var result: Dictionary = response.result
	_directory = str(result.directory)
	%Scopes.hide(); %CategorySection.hide(); %Formats.hide()
	%Summary.text = "Exported %d %s from %d selected %s.\n%s" % [int(result.files), "file" if int(result.files) == 1 else "files", int(result.assets), "asset" if int(result.assets) == 1 else "assets", _directory]
	%Issues.text = ""
	for issue: Dictionary in result.get("issues", []):
		%Issues.text += "%s — %s: %s\n" % [issue.label, issue.format, issue.reason]
	%Issues.visible = int(result.issueCount) > 0
	if int(result.issueCount) > 0:
		%Summary.text += "\n%d export %s. The complete report is in export-manifest.json." % [int(result.issueCount), "issue" if int(result.issueCount) == 1 else "issues"]
	%Export.hide(); %Refresh.hide(); %OpenFolder.show(); %OpenFolder.grab_focus()
	%Cancel.text = "Close"


func _request(method: String, params: Dictionary) -> Dictionary:
	return await _operations.run_workflow(_bridge, "Export assets", func(operation):
		return await operation.request(method, params))


func _error(response: Dictionary) -> void:
	%Summary.text = str(response.get("error", "Asset export failed."))
	if response.get("outcomeUnknown", false):
		%Summary.text += "\nThe reply was lost. Check the destination for a complete export-manifest.json before trying again."
	%Export.disabled = true


func _close() -> void:
	if _writing: return
	_generation += 1; %PrepareDelay.stop(); %Destination.hide(); hide()


func detach_session() -> void:
	_generation += 1; _bridge = null; _prepared.clear(); %PrepareDelay.stop()
	%Destination.hide(); hide()
