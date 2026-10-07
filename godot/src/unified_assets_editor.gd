extends VBoxContainer

signal artwork_applied(projection: Dictionary, record_index: int)
signal scenario_changed(projection: Dictionary)
signal item_selection_cancelled
signal save_requested
signal save_as_requested
var _bridge
var scenario_importer: Callable
var _scope := "personal"
var _collection_offset := 0
var _collection_revision := -1
var _operations: ProvidenceEditorOperation
var _stale := true
var _generation := 0
@onready var _header_parts: Array[Node] = [$Header, $Body/Content/Scopes, %WorkspaceStatus]
var _media_commands := preload("res://src/media_command_controller.gd").new()


func _ready() -> void:
	apply_theme()
	if _operations == null:
		var owned := ProvidenceEditorOperation.new()
		add_child(owned)
		configure_operations(owned)
	%Gallery.authoring_requested.connect(_open_media_review)
	%MediaDialog.applied.connect(_media_applied)
	%MediaDialog.review_source_requested.connect(_open_review_source)
	_media_commands.changed.connect(_media_committed)
	_bind_media_recovery()
	%ReconcileMedia.pressed.connect(_reconcile_media)
	%AllCollections.pressed.connect(func(): await show_scope("personal"))
	%AllMedia.pressed.connect(%Gallery.show_kind.bind("all"))
	%MonsterArtwork.pressed.connect(func(): await %Gallery.show_kind("combat-icon"))
	for entry in [[%Pictures, "picture"], [%Icons, "icon"], [%Sounds, "sound"], [%SpecialLand, "special-land-tile"], [%TextResources, "all-text"], [%Music, "music"]]:
		entry[0].pressed.connect(%Gallery.show_kind.bind(entry[1]))
	%LibraryUndo.pressed.connect(_library_history.bind("undo"))
	%LibraryRedo.pressed.connect(_library_history.bind("redo"))
	%SaveAssetProject.pressed.connect(func(): save_requested.emit())
	%SaveAssetAs.pressed.connect(func(): save_as_requested.emit())
	for target in [%Gallery.get_node("%ItemTarget"), %Supplied.get_node("%ItemTarget")]:
		target.cancelled.connect(func(): item_selection_cancelled.emit())
	%Import.pressed.connect(_import_selected_scope)
	%NewText.pressed.connect(func(): await %NewTextDialog.open_new(_bridge))
	%NewTextDialog.created.connect(func(projection: Dictionary, identity: String):
		scenario_changed.emit(projection)
		await %Gallery.select_created_text(identity))
	%NewCollection.pressed.connect(func(): await %MediaDialog.open_review("new-collection", _bridge, _media_commands, {"scope": "personal", "origin": %NewCollection}))
	%Scenario.pressed.connect(func(): await show_scope("scenario"))
	%Stock.pressed.connect(func(): await show_scope("stock"))
	%Library.pressed.connect(func(): await show_scope("personal"))
	%Personal.pressed.connect(func(): await show_scope("personal"); _select_collection(%Personal); await %Gallery.show_collection("personal"))
	%Bag.pressed.connect(func(): _supplied("bag-item", "Bag of Holding"))
	%Vault.pressed.connect(func(): _supplied("vault-icon", "Vault of Arcana"))
	%PersonalCollections.item_selected.connect(_collection_selected)
	%MoreCollections.pressed.connect(_load_collections)
	%Gallery.library_changed.connect(_refresh_collections)
	%Gallery.scenario_changed.connect(func(projection): scenario_changed.emit(projection))
	%Gallery.artwork_applied.connect(func(projection, record_index): artwork_applied.emit(projection, record_index))
	%Supplied.artwork_applied.connect(func(projection, record_index): artwork_applied.emit(projection, record_index))
	%Supplied.scenario_changed.connect(func(projection): scenario_changed.emit(projection))


func _bind_media_recovery() -> void:
	_media_commands.recovery_finished.connect(func(outcome: String, pending: Dictionary):
		%MediaDialog.discard_draft()
		if outcome == "not-committed" and pending.context.has("action"):
			await %MediaDialog.restore_review(_bridge, _media_commands, pending))
	_media_commands.status_changed.connect(func(message: String): %WorkspaceStatus.text = message; %WorkspaceStatus.show())
	_media_commands.recovery_changed.connect(func(locked: bool):
		%ReconcileMedia.visible = locked
		%Gallery.set_authoring_locked(locked)
		%Import.disabled = locked
		%NewCollection.disabled = locked
		%NewText.disabled = locked
		%LibraryUndo.disabled = locked
		%LibraryRedo.disabled = locked)


func configure_operations(operations: ProvidenceEditorOperation) -> void:
	_operations = operations
	if not operations.recovery_required.is_connected(_lock_from_shared_recovery): operations.recovery_required.connect(_lock_from_shared_recovery)
	_media_commands.operations = operations
	%Gallery.configure_operations(operations)
	%Supplied.configure_operations(operations)
	%NewTextDialog.configure_operations(operations)


func _lock_from_shared_recovery(message: String) -> void:
	%Gallery.set_authoring_locked(true)
	for button: Button in [%Import, %NewCollection, %NewText, %LibraryUndo, %LibraryRedo]: button.disabled = true
	%WorkspaceStatus.text = message
	%WorkspaceStatus.show()


func reload(bridge) -> void:
	_generation += 1
	_bridge = bridge
	_media_commands.attach_session(bridge)
	if bridge == null:
		discard_draft()
		await %Gallery.reload(null)
		await %Supplied.reload(null)
	%Import.disabled = bridge == null
	%NewCollection.disabled = bridge == null
	await show_scope(_scope)
	show_save_state("", false)


func attach_session(bridge) -> void:
	_generation += 1
	_bridge = bridge
	_media_commands.attach_session(bridge)
	_stale = true


func mark_stale() -> void:
	_stale = true


func current_scope() -> String:
	return _scope


func selected_asset_kind() -> String:
	return %Gallery.selected_asset_kind()


func selected_asset_identity() -> String:
	return %Gallery.selected_asset_identity()


func set_resource_opener(opener: Callable) -> void:
	%Gallery.resource_opener = opener


func show_save_state(message: String, unsaved: bool, failed := false) -> void:
	%SaveAssetNotice.text = message
	%SaveAssetState.visible = unsaved or not message.is_empty()
	%SaveAssetActions.visible = unsaved
	%SaveAssetProject.text = "Retry Save" if failed else "Save Project"
	%SaveAssetAs.visible = failed


func text_dialog() -> Window:
	if %NewTextDialog.visible: return %NewTextDialog
	return %Gallery.get_node("%TextDialog")


func begin_item_selection(bridge, definition: Dictionary, revision: int) -> void:
	await end_item_selection()
	await %Gallery.set_icons_only(true, false)
	_scope = "scenario"
	await reload(bridge)
	var generation := _generation
	var preview := await _run_read("Read current item artwork", func(operation):
		return await preload("res://src/item_artwork_lookup.gd").resolve(bridge.request if operation == null else operation.request, int(definition.get("iconId", 0))))
	if generation != _generation: return
	if preview.get("outcomeUnknown", false):
		%WorkspaceStatus.text = "The current item could not be confirmed. Reopen the project before applying artwork."
		%WorkspaceStatus.show()
		return
	var picture: Texture2D = preview.get("texture")
	for target in [%Gallery.get_node("%ItemTarget"), %Supplied.get_node("%ItemTarget")]:
		target.begin(definition, revision, picture)
	%Gallery.get_node("%UseStock").text = "Apply Artwork"
	%Supplied.get_node("%UseInItem").text = "Apply Artwork"
	_header_parts[0].get_node("Heading/Titles/Title").text = "Choose artwork · Item %d" % int(definition.get("classicId", 0))
	_header_parts[0].get_node("Heading/Titles/Subtitle").text = "Select a picture, then Apply. Cancel changes nothing."
	_configure_item_selection()


func end_item_selection() -> void:
	if _operations != null and _operations.busy: return
	_generation += 1
	%Gallery.discard_draft()
	await %Gallery.set_icons_only(false, false)
	%Gallery.get_node("%ItemTarget").clear()
	%Supplied.get_node("%ItemTarget").clear()


func set_item_opener(opener: Callable) -> void:
	%Gallery.get_node("%ItemUsesMenu").item_opener = opener
	%Gallery.get_node("%CopyDialog").item_opener = opener
	%Supplied.get_node("%CopyDialog").item_opener = opener


func activate() -> void:
	if _stale: await recheck_selection()


func recheck_selection() -> void:
	await refresh_after_history(_bridge)


func uses_async_catalog() -> bool:
	return %Gallery.visible or _operations != null


func refresh_after_history(bridge, operation: ProvidenceEditorOperation = null) -> Dictionary:
	if has_unapplied_changes(): return {"ok": false, "draft": true, "error": "Finish or cancel the open asset dialog before refreshing."}
	_bridge = bridge
	_media_commands.attach_session(bridge)
	if %Supplied.visible:
		var supplied: Dictionary = await %Supplied.reload(bridge, operation)
		_stale = not supplied.get("ok", false)
		return supplied
	var response: Dictionary = await %Gallery.refresh_after_history(bridge, operation)
	_stale = not response.get("ok", false)
	return response


func set_source_opener(opener: Callable) -> void:
	%Gallery.get_node("%ItemUsesMenu").source_opener = opener


func set_scenario_remover(remover: Callable) -> void:
	%Gallery.scenario_remover = remover


func show_scope(scope: String) -> void:
	if _operations != null and _operations.busy: return
	if has_unapplied_changes():
		%WorkspaceStatus.text = "Finish or cancel the open asset dialog before switching collections."
		%WorkspaceStatus.show()
		return
	_scope = scope
	_select_collection(%AllCollections if scope == "personal" else null)
	%Scenario.set_pressed_no_signal(scope == "scenario")
	%Stock.set_pressed_no_signal(scope == "stock")
	%Library.set_pressed_no_signal(scope == "personal")
	_configure_collections(scope)
	%Import.visible = scope != "stock"
	%NewText.visible = scope == "scenario"
	%NewText.disabled = _bridge == null or _media_commands.is_locked() or not _bridge.is_project_backed()
	%Import.text = "Import to Scenario…" if scope == "scenario" else "Import to My Library…"
	%Import.disabled = _bridge == null or _media_commands.is_locked() or scope == "scenario" and not _bridge.is_project_backed()
	%Import.tooltip_text = "Open a persistent scenario to import media." if %Import.disabled else ""
	%Supplied.clear()
	%Supplied.hide()
	%Gallery.show()
	%Gallery.set_authoring_locked(_media_commands.is_locked())
	var loaded: Dictionary = await %Gallery.show_scope(_bridge, scope)
	_stale = not loaded.get("ok", false)
	%Gallery.get_node("%Import").hide()
	%Gallery.get_node("%NewCollection").hide()
	%WorkspaceStatus.visible = _media_commands.is_locked()
	if not _media_commands.is_locked(): %WorkspaceStatus.text = ""
	if scope == "personal":
		await _refresh_collections()
	_configure_item_selection()


func open_stock_asset(identity: String) -> Dictionary:
	return await open_catalog_asset(identity, "stock")


func open_scenario_asset(identity: String) -> Dictionary:
	return await open_catalog_asset(identity, "scenario")


func open_catalog_asset(identity: String, scope: String) -> Dictionary:
	await show_scope(scope)
	return await %Gallery.refresh_selection(identity)


func _refresh_collections() -> void:
	%PersonalCollections.clear()
	%MoreCollections.hide()
	_collection_offset = 0
	await _load_collections()


func _load_collections() -> void:
	if _bridge == null:
		return
	var generation := _generation
	var offset := _collection_offset
	var response := await _run_read("Load library collections", func(operation):
		return _bridge.request("personal-library.collections", {"offset": offset, "limit": 25}) if operation == null else await operation.request("personal-library.collections", {"offset": offset, "limit": 25}))
	if generation != _generation or offset != _collection_offset or _scope != "personal" or not %Gallery.visible: return
	if not bool(response.get("ok", false)):
		%WorkspaceStatus.text = str(response.get("error", "Personal collections unavailable."))
		%WorkspaceStatus.show()
		return
	var result: Dictionary = response.get("result", {})
	var revision := int(result.get("revision", -1))
	if _collection_offset > 0 and revision != _collection_revision:
		await _refresh_collections()
		return
	_collection_revision = revision
	var history: Dictionary = await _run_read("Read library history", func(operation): return await operation.request("personal-library.describe", {}))
	%LibraryUndo.disabled = _media_commands.is_locked() or not history.get("ok", false) or int(history.get("result", {}).get("undo", 0)) == 0
	%LibraryRedo.disabled = _media_commands.is_locked() or not history.get("ok", false) or int(history.get("result", {}).get("redo", 0)) == 0
	var rows: Array = (result.get("items", []) as Array).slice(0, 25)
	for row: Dictionary in rows:
		var index: int = %PersonalCollections.add_item(str(row.name))
		%PersonalCollections.set_item_metadata(index, row.identity)
	_collection_offset += rows.size()
	%PersonalCollections.visible = %Gallery.visible and %PersonalCollections.item_count > 0
	%MoreCollections.visible = bool(result.get("truncated", false)) and not rows.is_empty()


func _collection_selected(index: int) -> void:
	if _operations != null and _operations.busy: return
	if has_unapplied_changes(): return
	_select_collection(null)
	%Supplied.clear()
	%Supplied.hide()
	%Gallery.show()
	await %Gallery.show_scope(_bridge, "personal")
	await %Gallery.show_collection(str(%PersonalCollections.get_item_metadata(index)))
	%Gallery.get_node("%Import").hide()
	%Gallery.get_node("%NewCollection").hide()
	_configure_item_selection()


func _supplied(kind: String, label: String) -> void:
	if %Gallery.get_node("%ItemTarget").item.is_empty():
		await show_scope("personal")
		await %Gallery.show_collection(kind)
		_select_collection(%Bag if kind == "bag-item" else %Vault)
		return
	if _operations != null and _operations.busy: return
	if has_unapplied_changes(): return
	%NewText.hide()
	_scope = "personal"
	%Import.show()
	%Import.text = "Import to My Library…"
	%Import.disabled = _bridge == null
	%Import.tooltip_text = ""
	_configure_collections("personal")
	%Scenario.set_pressed_no_signal(false)
	%Stock.set_pressed_no_signal(false)
	%Library.set_pressed_no_signal(true)
	%WorkspaceStatus.hide()
	%PersonalCollections.hide()
	%MoreCollections.hide()
	_select_collection(%Bag if kind == "bag-item" else %Vault)
	await %Gallery.reload(null)
	%Gallery.hide()
	%Supplied.show()
	await %Supplied.show_collection(_bridge, kind, label)
	_configure_item_selection()


func _configure_item_selection() -> void:
	if %Gallery.get_node("%ItemTarget").item.is_empty():
		return
	%Import.hide()
	%NewText.hide()
	%NewCollection.hide()
	%Gallery.get_node("%Import").hide()
	%Gallery.get_node("%NewCollection").hide()
	%Supplied.get_node("%CopyToScenario").hide()
	%Gallery.get_node("%ItemTarget").show_zoom(_scope == "personal")
	%Supplied.get_node("%ItemTarget").show_zoom(true)
	for name in ["PreviewHost", "PreviewScaleLabel", "PreviewScale", "UseStock"]:
		%Gallery.get_node("InspectorInset/Selection/" + name).hide()
	for name in ["Matte", "PreviewLabel", "Zoom", "UseInItem"]:
		%Supplied.get_node("InspectorInset/Selection/" + name).hide()
	for name in ["Rename", "Remove", "Move", "Copy", "ReplaceScenario", "AddToLibrary", "RemoveScenario", "ScenarioUses", "FindScenarioUses"]:
		%Gallery.get_node("%" + name).hide()


func _configure_collections(scope: String) -> void:
	$Body/Collections.show()
	$Body/Collections/Inset/Sections/Title.text = "COLLECTIONS"
	$Body/Collections/Inset/Sections/LibraryCaption.hide()
	%AllCollections.text = "All collections"
	%AllCollections.tooltip_text = "Search personal additions and protected supplied collections together."
	for control: Control in [%Personal, %Bag, %Vault, %NewCollection]: control.show()
	%NewCollection.disabled = scope != "personal" or _bridge == null or _media_commands.is_locked()
	%NewCollection.tooltip_text = "Create a collection in My Library." if scope == "personal" else "Switch to My Library to create a collection."
	%PersonalCollections.visible = scope == "personal"
	%LibraryHistory.visible = scope == "personal"
	%MoreCollections.hide()


func _select_collection(selected: Button) -> void:
	for button: Button in [%AllCollections, %Personal, %Bag, %Vault]:
		button.set_pressed_no_signal(button == selected)
	if selected != null:
		%PersonalCollections.deselect_all()


func _manage_library(create_collection: bool) -> void:
	await show_scope("personal")
	if create_collection:
		await %MediaDialog.open_review("new-collection", _bridge, _media_commands, {"scope": "personal", "origin": %NewCollection})
	else: await _import_selected_scope()


func _import_selected_scope() -> void:
	if %Import.disabled or _media_commands.is_locked(): return
	await %MediaDialog.open_review("import", _bridge, _media_commands, {"scope": _scope, "kind": selected_asset_kind() if selected_asset_kind() != "all" else "picture", "origin": %Import})





func _run_read(label: String, workflow: Callable) -> Dictionary:
	if _operations == null: return await workflow.call(null)
	return await _operations.browse_media(_bridge, workflow)


func has_unapplied_changes() -> bool:
	return %MediaDialog.has_draft() or %NewTextDialog.visible or %Gallery.has_unapplied_changes() or %Supplied.has_unapplied_changes()


func discard_draft() -> void:
	%MediaDialog.discard_draft()
	%NewTextDialog.discard_draft()
	%Gallery.discard_draft()
	%Supplied.discard_draft()


func _open_media_review(action: String, context: Dictionary) -> void:
	if _media_commands.is_locked(): return
	await %MediaDialog.open_review(action, _bridge, _media_commands, context)


func _media_committed(result: Dictionary, domain: String) -> void:
	if domain == "project": scenario_changed.emit(result)


func _media_applied(_result: Dictionary, domain: String, identity: String) -> void:
	if domain == "personal": await _refresh_collections()
	await %Gallery.refresh_selection(identity if domain == "project" else %Gallery.selected_asset_identity())


func _library_history(direction: String) -> void:
	if has_unapplied_changes() or _media_commands.is_locked(): return
	var state: Dictionary = await _media_commands.prepare("personal-library.describe", {})
	if not state.get("ok", false): return
	var response: Dictionary = await _media_commands.perform("personal-library." + direction, {"expectedRevision": int(state.result.revision)}, "personal", {})
	if response.get("ok", false): await refresh_after_history(_bridge)


func _reconcile_media() -> void:
	var response: Dictionary = await _media_commands.reconcile()
	if response.get("mediaRecoveryConfirmed", false): await refresh_after_history(_bridge)


func read_navigation_state() -> Dictionary:
	return {"scope": _scope, "browser": %Gallery.read_navigation_state()}

func discovery_selection() -> Dictionary:
	return {"kind":selected_asset_kind(), "identity":selected_asset_identity(), "nativeId":"", "scope":current_scope()}


func restore_navigation_state(state: Dictionary) -> bool:
	await show_scope(str(state.get("scope", "scenario")))
	var restored: bool = await %Gallery.restore_navigation_state(state.get("browser", {}))
	await %MediaDialog.resume_review()
	return restored


func _open_review_source(reference: Dictionary) -> void:
	var opener: Callable = %Gallery.get_node("%ItemUsesMenu").source_opener
	if opener.is_valid(): await opener.call(reference)
	else:
		await %MediaDialog.resume_review()
		%WorkspaceStatus.text = "Open this media through the scenario workspace to repair its owning field."
		%WorkspaceStatus.show()


func apply_theme(mode := "dark", density := "balanced") -> void:
	var controls = preload("res://src/media_theme.gd").new()
	controls.mode = mode; controls.density = density
	theme = controls
	%MediaDialog.get_node("Inset").theme = controls
	%Gallery.get_node("%MediaPreview").get_node("Inset").theme = controls
	%Gallery.get_node("%TextDialog").apply_theme(mode, density)
	%NewTextDialog.apply_theme(mode, density)

func configure_text_links(source_opener: Callable, preview_opener: Callable) -> void:
	%Gallery.configure_text_links(source_opener,preview_opener)
