extends Window

signal applied(result: Dictionary, domain: String, identity: String)
signal review_source_requested(reference: Dictionary)

const Decoder = preload("res://src/asset_preview_decoder.gd")
const Presentation = preload("res://src/media_review_presentation.gd")
const KINDS := [["Picture", "picture"], ["Item icon", "icon"], ["Monster artwork pair", "combat-icon"], ["Special Land", "special-land-tile"], ["Sound", "sound"], ["Scrolling TEXT", "text-resource"], ["Music · standard MOD", "music"]]
var _commands: RefCounted
var _bridge: RefCounted
var _context := {}
var _action := ""
var _base := {}
var _prepared := {}
var _busy := false
var _generation := 0
var _origin: Control
var _text_ready := false
var _loading := false
var _collection_offset := 0
var _last_family := ""
var _suspended_review := {}


func _ready() -> void:
	close_requested.connect(_cancel)
	%Cancel.pressed.connect(_cancel)
	%Review.pressed.connect(_prepare)
	%Accept.pressed.connect(_accept)
	%ChooseFile.pressed.connect(func(): %SourceFile.popup_centered())
	%ChooseReverse.pressed.connect(func(): %ReverseFile.popup_centered())
	%SourceFile.file_selected.connect(func(path: String): %Path.text = path; _text_ready = false; _changed())
	%ReverseFile.file_selected.connect(func(path: String): %ReversePath.text = path; _changed())
	%Path.text_changed.connect(func(_text): _text_ready = false; _changed())
	for node: LineEdit in [%ReversePath, %DraftName]: node.text_changed.connect(func(_text): _changed())
	for node: SpinBox in [%Number, %LandLook, %BaseTile]: node.value_changed.connect(func(_value): _changed())
	for node: OptionButton in [%Family, %OutputMode, %Fit, %Quality, %Transparency, %Reduction, %Canvas, %Collection]: node.item_selected.connect(func(_index): _changed())
	for node: CheckButton in [%OverrideLandLook, %OverrideBaseTile]: node.toggled.connect(func(_enabled): _changed())
	%Text.text_changed.connect(func():
		if not _loading: _text_ready = true; _changed())
	%PrepareDelay.timeout.connect(_prepare)
	%MusicAllocation.changed.connect(_changed)
	%Play.pressed.connect(func():
		if %Audio.playing: _stop_audio(false)
		else: %Audio.play(); %Play.text = "Stop output")
	%Audio.finished.connect(func(): %Play.text = "Play output")
	%AffectedUses.source_requested.connect(_open_affected_source)
	%AffectedUses.refresh_requested.connect(_refresh_review)
	%MoreCollections.pressed.connect(func(): await _load_collections(_generation))
	for entry in KINDS: %Family.add_item(entry[0]); %Family.set_item_metadata(%Family.item_count - 1, entry[1])
	_options(%OutputMode, [["Realmz-ready", "ready"], ["Keep original", "original"]])
	_options(%Fit, [["Fit with padding", "pad"], ["Crop center", "crop"], ["Stretch", "stretch"]])
	_options(%Quality, [["Crisp pixels", "crisp"], ["Smooth", "smooth"]])
	_options(%Transparency, [["Keep transparent", "keep"], ["Fill white", "white"], ["Fill black", "black"]])
	_options(%Reduction, [["Adaptive 256", false], ["Adaptive 256 · Floyd-Steinberg", true]])
	_options(%Canvas, [["32 × 32", Vector2i(32,32)], ["32 × 64", Vector2i(32,64)], ["64 × 32", Vector2i(64,32)], ["64 × 64", Vector2i(64,64)]])


func _options(node: OptionButton, entries: Array) -> void:
	for entry in entries:
		node.add_item(str(entry[0]))
		node.set_item_metadata(node.item_count - 1, entry[1])


func open_review(action: String, bridge: RefCounted, commands: RefCounted, context: Dictionary) -> void:
	if commands.is_locked(): return
	_generation += 1
	_commands = commands
	_bridge = bridge
	_context = context.duplicate(true)
	_context["sourceEpoch"] = bridge.connection_epoch()
	_context["sourcePath"] = str(bridge.current_project_path())
	_origin = context.get("origin")
	_action = "import" if action == "prepare-original" else action
	if action == "prepare-original":
		_context["sourceLibraryIdentity"] = str(context.row.identity)
		_context["destination"] = "scenario"
	_base.clear()
	_prepared.clear()
	Presentation.clear_output(self)
	_text_ready = false
	_stop_audio()
	%AffectedUses.clear_review()
	_loading = true
	_set_read_only(false)
	%Cancel.text = "Cancel"
	%Review.text = "Review output"
	%Path.text = ""
	%ReversePath.text = ""
	%Text.text = ""
	%Incoming.texture = null
	%IncomingReverse.texture = null
	%IncomingReverse.hide()
	%CurrentReverse.texture = null
	%CurrentReverse.hide()
	%Current.texture = context.get("preview", {}).get("texture")
	%CurrentText.text = str(context.get("preview", {}).get("text", ""))
	var row: Dictionary = context.get("row", {})
	%DraftName.text = str(row.get("name", row.get("label", "")))
	%Number.value = _number(row)
	%MusicAllocation.configure(context.get("scope") == "personal" and action != "prepare-original" or action == "transfer", action == "replace", int(context.get("initialMusicSlot", _number(row))))
	_collection_offset = 0
	%Collection.clear()
	%Collection.add_item("No collection")
	%Collection.set_item_metadata(0, null)
	var kind := str(row.get("kind", context.get("kind", "picture")))
	_last_family = kind
	for index in %Family.item_count:
		if str(%Family.get_item_metadata(index)) == kind: %Family.select(index)
	%OutputMode.select(0)
	%CurrentText.visible = not %CurrentText.text.is_empty()
	%Transparency.select(1 if kind in ["picture", "tileset"] else 0)
	%Reduction.select(1 if kind in ["picture", "tileset"] else 0)
	%OverrideLandLook.button_pressed = row.get("landlook") != null
	%LandLook.value = int(row.get("landlook", 0)) if row.get("landlook") != null else 0
	%OverrideBaseTile.button_pressed = row.get("baseTile") != null
	%BaseTile.value = int(row.get("baseTile", 0)) if row.get("baseTile") != null else 0
	_configure()
	_loading = false
	popup_centered()
	%DraftName.grab_focus()
	await _load_context()


func _load_context() -> void:
	var generation := _generation
	_busy_state(true)
	var response: Dictionary = await _commands.prepare("session.describe", {})
	if generation != _generation: return
	if not response.get("ok", false): _failure(response); return
	_base["expectedRevision"] = int(response.get("result", {}).get("revision", 0))
	var scope := str(_context.get("scope", "scenario"))
	if scope == "personal" or _action in ["transfer", "new-collection"]:
		response = await _commands.prepare("personal-library.describe", {})
		if generation != _generation: return
		if not response.get("ok", false) or not response.get("result", {}).get("configured", false):
			_failure({"error": "Open My Library before using this operation."}); return
		_base["expectedLibraryRevision"] = int(response.result.revision)
		if _context.has("row") and scope == "personal" and int(_context.get("revision", -1)) != int(response.result.revision):
			_failure({"error": "My Library changed. Reselect the current entry before editing."}); return
		await _load_collections(generation)
		var current_collection: Variant = _context.get("row", {}).get("collection", _context.get("collection"))
		if current_collection is String and _collection_index(current_collection) < 0:
			await _load_collections(generation, current_collection)
		elif current_collection is String: %Collection.select(_collection_index(current_collection))
		if generation != _generation: return
	var row: Dictionary = _context.get("row", {})
	if _kind() == "music":
		response = await %MusicAllocation.load_slots(_commands, int(_base.expectedRevision))
		if generation != _generation: return
		if not response.get("ok", false): _failure(response); return
	if not row.is_empty():
		_base["identity"] = str(row.identity)
		if scope == "scenario":
			if int(_context.get("revision", -1)) != int(_base.expectedRevision):
				_failure({"error": "The scenario changed. Reselect the current resource before editing."}); return
			response = await _commands.prepare("project-asset.open", {"identity": row.identity, "expectedRevision": _base.expectedRevision})
			if generation != _generation: return
			if not response.get("ok", false): _failure(response); return
			var asset: Dictionary = response.result.get("asset", {})
			_context.row = asset.duplicate(true)
			%OverrideLandLook.button_pressed = asset.get("landlook") != null
			%LandLook.value = int(asset.get("landlook", 0)) if asset.get("landlook") != null else 0
			%OverrideBaseTile.button_pressed = asset.get("baseTile") != null
			%BaseTile.value = int(asset.get("baseTile", 0)) if asset.get("baseTile") != null else 0
	if scope == "scenario" and not row.is_empty() and _kind() != "text-style-resource":
		await _load_current_media(generation, row)
		if generation != _generation: return
	_busy_state(false)
	if _action not in ["import", "replace"]: await _prepare()


func _load_collections(generation: int, seek_identity := "") -> void:
	var response: Dictionary = await _commands.prepare("personal-library.collections", {"limit": 128, "offset": _collection_offset, "seekIdentity": seek_identity})
	if generation != _generation or not response.get("ok", false): return
	var rows: Array = response.result.get("items", [])
	for row: Dictionary in rows:
		var index := _collection_index(str(row.identity))
		if index < 0:
			%Collection.add_item(str(row.name))
			index = %Collection.item_count - 1
			%Collection.set_item_metadata(index, row.identity)
		if row.identity == seek_identity: %Collection.select(index)
	if seek_identity.is_empty():
		_collection_offset = int(response.result.get("offset", _collection_offset)) + rows.size()
		%MoreCollections.visible = response.result.get("truncated", false) and not rows.is_empty()


func _collection_index(identity: String) -> int:
	for index in %Collection.item_count:
		if %Collection.get_item_metadata(index) == identity: return index
	return -1


func _configure() -> void:
	var importing := _action in ["import", "replace"]
	var source_library := _context.has("sourceLibraryIdentity")
	var personal: bool = _context.get("scope", "scenario") == "personal" and not source_library
	title = {"import": "Import media", "replace": "Replace media", "transfer": "Add to My Library", "copy": "Copy to Scenario", "edit": "Edit media", "organize": "Name and Collection", "remove": "Remove media", "remove-personal": "Remove from My Library", "new-collection": "New collection"}.get(_action, "Media review")
	%Title.text = title
	%Destination.text = str("Scenario" if source_library else _context.get("destination", "My Library" if personal or _action == "transfer" else "Scenario")) + (" · " + str(_context.get("row", {}).get("name", _context.get("row", {}).get("label", ""))) if _context.has("row") else "")
	_destination_details()
	%SourceRow.visible = importing and not source_library
	%ReverseRow.visible = importing and (_kind() == "combat-icon" or _context.get("paired", false))
	%FamilyGroup.visible = importing
	%Family.disabled = _action == "replace"
	%OutputGroup.visible = importing and personal
	%CollectionGroup.visible = _action in ["organize", "transfer"] or importing and personal
	%NumberGroup.visible = _action in ["copy", "edit", "replace"] or importing and not personal
	%Number.editable = _action == "copy" or _action == "import"
	%DraftName.editable = _action not in ["copy", "remove", "remove-personal"]
	%RasterSettings.visible = importing and _kind() in ["picture", "tileset", "icon", "combat-icon", "special-land-tile"]
	%CanvasGroup.visible = importing and _kind() == "combat-icon" and _action != "replace"
	%LandSettings.visible = _action in ["edit", "import"] and _kind() == "special-land-tile"
	%Text.visible = importing and _kind() == "text-resource"
	%Text.editable = not (personal and %OutputMode.selected == 1) and not _commands.is_locked()
	%Comparison.visible = _action not in ["organize", "new-collection"]
	%Proposed.visible = _action in ["import", "replace", "transfer", "copy"]
	var raster := _kind() not in ["sound", "text-resource", "text-style-resource", "music"]
	%MusicAllocation.visible = _kind() == "music" and _action in ["import", "replace", "copy", "transfer"]
	if _kind() == "music": %NumberGroup.hide()
	%SourceFrame.visible = raster
	%ProposedFrame.visible = raster
	%Accept.text = {"import":"Import", "replace":"Replace", "transfer":"Add to My Library", "copy":"Copy", "edit":"Apply", "organize":"Apply", "remove":"Remove", "remove-personal":"Remove", "new-collection":"Create collection"}.get(_action,"Apply")
	%Accept.disabled = true
	%Review.visible = _action in ["import", "replace", "copy", "transfer", "remove"]
	%Impact.text = ""


func _destination_details() -> void:
	var row: Dictionary = _context.get("row", {})
	var key: Dictionary = row.get("classicResource") if row.get("classicResource") is Dictionary else {}
	if not key.is_empty():
		%Destination.text += " · %s %d" % [str(key.get("resourceType", "")).strip_edges(), int(key.resourceId)]
		if _context.get("companionResource") is Dictionary: %Destination.text += " + %d" % int(_context.companionResource.resourceId)


func _kind() -> String:
	return str(_context.get("row", {}).get("kind", %Family.get_item_metadata(%Family.selected))) if _action == "replace" else str(%Family.get_item_metadata(%Family.selected))


func _number(row: Dictionary) -> int:
	var key: Dictionary = row.get("classicResource") if row.get("classicResource") is Dictionary else {}
	if key.is_empty() and row.get("media") is Dictionary: key = row.media.get("primary", {}).get("classicResource", {})
	var kind := str(row.get("kind", _context.get("kind", "picture")))
	return int(key.get("resourceId", {"picture": 30000, "sound": 200, "music": 1, "special-land-tile": -1000, "text-resource": -200, "icon": 30000, "combat-icon": 1000}.get(kind, 30000)))


func _changed() -> void:
	if _loading: return
	_stop_audio()
	%AffectedUses.clear_review()
	_prepared.clear()
	Presentation.clear_output(self, _action == "import" and not _context.has("sourceLibraryIdentity"))
	%Accept.disabled = true
	%Incoming.texture = null
	%IncomingReverse.hide()
	if _kind() != _last_family and _action == "import":
		_last_family = _kind()
		_text_ready = false
		%Number.value = _number({"kind": _last_family})
		if _last_family == "music":
			%MusicAllocation.configure(_context.get("scope") == "personal" and not _context.has("sourceLibraryIdentity"), false, 1)
			if _base.has("expectedRevision"): await %MusicAllocation.load_slots(_commands, int(_base.expectedRevision))
	_configure()
	if visible and not _busy: %PrepareDelay.start()


func _params() -> Dictionary:
	var params := _base.duplicate(true)
	params["name"] = %DraftName.text
	if _context.get("scope") == "supplied": params["sourceReference"] = true
	params["resourceId"] = int(%Number.value)
	if _kind() == "music": params.merge(%MusicAllocation.selection(), true)
	params["collection"] = %Collection.get_item_metadata(%Collection.selected)
	if _action in ["import", "replace"]:
		params["kind"] = _kind()
		params["path"] = %Path.text
		params["reversePath"] = %ReversePath.text
		params["destination"] = "scenario" if _context.has("sourceLibraryIdentity") else _context.get("scope", "scenario")
		if _context.has("sourceLibraryIdentity"): params["sourceLibraryIdentity"] = _context.sourceLibraryIdentity
		params["output"] = %OutputMode.get_item_metadata(%OutputMode.selected)
		params["settings"] = {"fit": %Fit.get_item_metadata(%Fit.selected), "filter": %Quality.get_item_metadata(%Quality.selected), "transparency": %Transparency.get_item_metadata(%Transparency.selected), "dither": %Reduction.get_item_metadata(%Reduction.selected)}
		var canvas: Vector2i = %Canvas.get_item_metadata(%Canvas.selected)
		params["width"] = canvas.x
		params["height"] = canvas.y
		if _action == "replace": params["replaceIdentity"] = _context.row.identity
		if _kind() == "text-resource" and _text_ready: params["text"] = %Text.text
	if _action == "transfer" or _action == "import" and _context.get("scope") == "personal":
		params["libraryIdentity"] = _context.get("libraryIdentity", "personal:" + Crypto.new().generate_random_bytes(16).hex_encode())
		_context["libraryIdentity"] = params.libraryIdentity
	if _kind() == "special-land-tile":
		params["landlook"] = int(%LandLook.value) if %OverrideLandLook.button_pressed else null
		params["baseTile"] = int(%BaseTile.value) if %OverrideBaseTile.button_pressed else null
	if _action in ["organize", "remove-personal", "new-collection"]: params["expectedRevision"] = _base.get("expectedLibraryRevision", -1)
	if _action == "new-collection":
		params["identity"] = _context.get("collectionIdentity", "collection:" + Crypto.new().generate_random_bytes(16).hex_encode())
		_context["collectionIdentity"] = params.identity
	return params


func _prepare() -> void:
	if _busy or not visible or _commands == null or _commands.is_locked(): return
	if _action in ["import", "replace"] and %Path.text.is_empty() and not _context.has("sourceLibraryIdentity"): return
	%PrepareDelay.stop()
	if _action == "import" and _kind() == "text-resource" and not _text_ready and not _context.has("sourceLibraryIdentity"):
		_busy_state(true)
		var text_generation := _generation
		var text_path: String = %Path.text
		var text_read: Dictionary = await _commands.prepare("text-resource.prepare-import", {"path": %Path.text, "expectedRevision": _base.expectedRevision})
		if text_generation != _generation or text_path != %Path.text: _busy_state(false); return
		_busy_state(false)
		if not text_read.get("ok", false): _failure(text_read); return
		_loading = true
		%Text.text = str(text_read.result.get("text", ""))
		_text_ready = true
		_loading = false
	var params := _params()
	var method := _method(false)
	if method.is_empty():
		%Accept.disabled = _unchanged() or %DraftName.text.strip_edges().is_empty() and _action != "remove-personal"
		_prepared = {"params": params}
		%Impact.text = "Current values are unchanged." if _unchanged() else "Unapplied metadata changes" if _action in ["edit", "organize"] else "Review required."
		return
	var generation := _generation
	Presentation.clear_output(self, _action == "import" and not _context.has("sourceLibraryIdentity"))
	_busy_state(true)
	var response: Dictionary = await _commands.prepare(method, params)
	if generation != _generation or not visible: return
	_busy_state(false)
	if params != _params(): %PrepareDelay.start(); return
	if not response.get("ok", false): _failure(response); return
	var result: Dictionary = response.result
	_prepared = {"params": params, "reviewHash": result.get("reviewHash", "")}
	_configure()
	await _render(result)
	if generation != _generation or not visible or params != _params(): return
	%Accept.disabled = not bool(result.get("allowed", true))


func _render(result: Dictionary) -> void:
	_loading = true
	Presentation.render(self, result, _action, _kind(), _context.get("currentSound", {}), _context.get("currentSoundPreview", {}))
	var media: Dictionary = result.get("media", {})
	var uses: Dictionary = result.get("uses") if result.get("uses") is Dictionary else {}
	var total := int(uses.get("paging", {}).get("usedByTotal", 0))
	var warnings: Array = result.get("warnings", [])
	%Impact.text = str(result.get("reason", "")) if not result.get("allowed", true) else ("%d affected uses. " % total if total > 0 else "") + ("Scenario content is unchanged by this library operation." if _action == "transfer" else "Destination reviewed.")
	if not warnings.is_empty(): %Impact.text += "\n" + "\n".join(warnings)
	_loading = false
	if _action in ["replace", "remove"] or _params().has("replaceIdentity"):
		var generation := _generation
		await %AffectedUses.show_review(_commands, media, int(_base.expectedRevision), func(): return visible and generation == _generation)


func _method(commit: bool) -> String:
	var suffix := ".commit" if commit else ".prepare"
	match _action:
		"import", "replace": return "media.import" + suffix
		"transfer": return "media.transfer" + suffix
		"copy": return "media.copy" + suffix
		"remove": return "media.remove" + suffix
		"edit": return "media.metadata.apply" if commit else ""
		"organize": return "personal-library.update" if commit else ""
		"remove-personal": return "personal-library.remove" if commit else ""
		"new-collection": return "personal-library.create-collection" if commit else ""
	return ""


func _accept() -> void:
	if _busy or %Accept.disabled or _prepared.is_empty(): return
	if _prepared.params != _params(): _changed(); return
	var params: Dictionary = _prepared.params.duplicate(true)
	if _prepared.has("reviewHash"): params["reviewHash"] = _prepared.reviewHash
	var domain := "personal" if _action in ["transfer", "organize", "remove-personal", "new-collection"] or _action == "import" and _context.get("scope") == "personal" and not _context.has("sourceLibraryIdentity") else "project"
	_busy_state(true)
	var generation := _generation
	var context := _context.duplicate(true)
	context["action"] = _action
	_set_read_only(true)
	%AffectedUses.set_locked(true)
	var response: Dictionary = await _commands.perform(_method(true), params, domain, context)
	if generation != _generation: return
	_busy_state(false)
	if response.get("outcomeUnknown", false):
		title = "Outcome unconfirmed / submitted values retained"
		%Title.text = title
		%Impact.text = "Outcome unconfirmed. Submitted values are locked. Close to browse, then Reconcile stored state; no mutation will be retried."
		_set_read_only(true)
		%Accept.disabled = true
		%Review.disabled = true
		%Cancel.text = "Close"
		return
	_set_read_only(false)
	_configure()
	if not response.get("ok", false): _failure(response, true); return
	var result: Dictionary = response.get("result", {})
	applied.emit(result, domain, str(result.get("identity", params.get("identity", ""))))
	_cancel()


func _busy_state(busy: bool) -> void:
	_busy = busy
	%Review.disabled = busy
	%Accept.disabled = busy or _prepared.is_empty()
	%Cancel.disabled = busy
	%ChooseFile.disabled = busy
	%ChooseReverse.disabled = busy
	if busy: %Impact.text = "Loading the reviewed destination and output…"
	elif _prepared.is_empty() and %Impact.text.begins_with("Loading the reviewed"): %Impact.text = "Destination review required."


func _failure(response: Dictionary, write_failed := false) -> void:
	_busy_state(false)
	_prepared.clear()
	Presentation.clear_output(self, _action == "import" and not _context.has("sourceLibraryIdentity"))
	_stop_audio()
	%Accept.disabled = true
	%Impact.text = str(response.get("error", "Could not complete the operation. Your draft is kept."))
	%Review.text = "Retry review"
	if write_failed:
		title = "Change failed / draft retained"
		%Title.text = title
		%Impact.text += " Your source, destination and settings are kept. Review them before submitting again."


func _cancel() -> void:
	if _busy: return
	_generation += 1
	%PrepareDelay.stop()
	_stop_audio()
	%AffectedUses.clear_review()
	_suspended_review.clear()
	hide()
	if is_instance_valid(_origin) and _origin.is_visible_in_tree(): _origin.grab_focus()


func has_draft() -> bool:
	return visible


func discard_draft() -> void:
	_cancel()


func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"): _cancel(); set_input_as_handled()
	elif event is InputEventKey and event.pressed and event.keycode == KEY_ENTER and event.ctrl_pressed:
		_accept(); set_input_as_handled()


func _set_read_only(locked: bool) -> void:
	%MusicAllocation.set_locked(locked)
	for node: LineEdit in [%Path, %ReversePath, %DraftName]: node.editable = not locked
	for node: SpinBox in [%Number, %LandLook, %BaseTile]: node.editable = not locked
	for node: OptionButton in [%Family, %OutputMode, %Fit, %Quality, %Transparency, %Reduction, %Canvas, %Collection]: node.disabled = locked
	for node: CheckButton in [%OverrideLandLook, %OverrideBaseTile]: node.disabled = locked
	%Text.editable = not locked
	%ChooseFile.disabled = locked
	%ChooseReverse.disabled = locked
	%MoreCollections.disabled = locked
	%AffectedUses.set_locked(locked)


func _stop_audio(clear := true) -> void:
	%Audio.stop()
	%Play.text = "Play output"
	if clear: %Audio.stream = null; %Play.hide()


func _open_affected_source(reference: Dictionary) -> void:
	if _busy or _commands.is_locked(): return
	_suspended_review = {"context": _context.duplicate(true), "intent": {"params": _params()}}
	_suspended_review.context["action"] = _action
	_generation += 1
	_stop_audio()
	%AffectedUses.clear_review()
	hide()
	review_source_requested.emit(reference)


func resume_review() -> void:
	if _suspended_review.is_empty(): return
	var pending := _suspended_review.duplicate(true)
	_suspended_review.clear()
	if _bridge.connection_epoch() != pending.context.sourceEpoch or str(_bridge.current_project_path()) != pending.context.sourcePath:
		popup_centered(); _failure({"error": "The originating session changed. Cancel this retained review and reopen its source."}); return
	var response: Dictionary = await _commands.prepare("session.describe", {})
	if not response.get("ok", false): popup_centered(); _failure(response); return
	pending.context["revision"] = int(response.result.revision)
	await restore_review(_bridge, _commands, pending)


func _refresh_review() -> void:
	if _busy or _commands.is_locked(): return
	_suspended_review = {"context": _context.duplicate(true), "intent": {"params": _params()}}
	_suspended_review.context["action"] = _action
	await resume_review()


func _unchanged() -> bool:
	var row: Dictionary = _context.get("row", {})
	if _action == "organize":
		return %DraftName.text == str(row.get("name", "")) and %Collection.get_item_metadata(%Collection.selected) == row.get("collection")
	if _action == "edit":
		return %DraftName.text == str(row.get("label", "")) and (_kind() != "special-land-tile" or (%OverrideLandLook.button_pressed == (row.get("landlook") != null) and (not %OverrideLandLook.button_pressed or int(%LandLook.value) == int(row.landlook)) and %OverrideBaseTile.button_pressed == (row.get("baseTile") != null) and (not %OverrideBaseTile.button_pressed or int(%BaseTile.value) == int(row.baseTile))))
	return false


func restore_review(bridge: RefCounted, commands: RefCounted, pending: Dictionary) -> void:
	await open_review(str(pending.context.action), bridge, commands, pending.context)
	var params: Dictionary = pending.intent.params
	if params.get("collection") is String and _collection_index(params.collection) < 0:
		await _load_collections(_generation, params.collection)
	_loading = true
	for index in %Family.item_count:
		if %Family.get_item_metadata(index) == params.get("kind"): %Family.select(index)
	_last_family = _kind()
	%Path.text = str(params.get("path", "")); %ReversePath.text = str(params.get("reversePath", ""))
	%DraftName.text = str(params.get("name", "")); %Number.value = int(params.get("resourceId", %Number.value))
	if params.has("text"): %Text.text = str(params.text); _text_ready = true
	if params.has("libraryIdentity"): _context["libraryIdentity"] = params.libraryIdentity
	if pending.context.action == "new-collection": _context["collectionIdentity"] = params.identity
	%OverrideLandLook.button_pressed = params.get("landlook") != null
	%LandLook.value = int(params.get("landlook", 0)) if params.get("landlook") != null else 0
	%OverrideBaseTile.button_pressed = params.get("baseTile") != null
	%BaseTile.value = int(params.get("baseTile", 0)) if params.get("baseTile") != null else 0
	for index in %OutputMode.item_count:
		if %OutputMode.get_item_metadata(index) == params.get("output"): %OutputMode.select(index)
	for index in %Collection.item_count:
		if %Collection.get_item_metadata(index) == params.get("collection"): %Collection.select(index)
	var settings: Dictionary = params.get("settings", {})
	for pair in [[%Fit, "fit"], [%Quality, "filter"], [%Transparency, "transparency"], [%Reduction, "dither"]]:
		for index in pair[0].item_count:
			if pair[0].get_item_metadata(index) == settings.get(pair[1]): pair[0].select(index)
	for index in %Canvas.item_count:
		if %Canvas.get_item_metadata(index) == Vector2i(int(params.get("width", 32)), int(params.get("height", 32))): %Canvas.select(index)
	_loading = false
	_changed()
	await _prepare()


func _load_current_media(generation: int, row: Dictionary) -> void:
	var response: Dictionary = await _commands.prepare("media.open", {"identity": row.identity, "expectedRevision": _base.expectedRevision})
	if generation != _generation or not response.get("ok", false): return
	var media: Dictionary = response.result.get("media", {})
	_context["paired"] = media.get("companion") is Dictionary and media.companion.get("kind") != "text-style-resource"
	if _context.paired:
		var primary: Dictionary = media.get("primary", {})
		_context["companionResource"] = media.companion.get("classicResource", {})
		if _action != "edit":
			_base["identity"] = str(primary.get("identity", row.identity))
			_context.row = primary.duplicate(true)
			_context.row["classicResource"] = primary.get("classicResource", {})
			if primary.get("kind") == "icon": %Family.select(2)
			%Number.value = _number(_context.row)
	var preview: Dictionary = response.result.get("preview", {})
	var current := Decoder.decode({"ok": true, "result": preview.get("primary", {})}, {})
	_context["currentSound"] = media.get("primary", {}) if _kind() == "sound" else {}
	_context["currentSoundPreview"] = current if _kind() == "sound" else {}
	%Current.texture = current.get("texture", %Current.texture)
	var companion := Decoder.decode({"ok": true, "result": preview.get("companion") if preview.get("companion") is Dictionary else {}}, {})
	%CurrentReverse.texture = companion.get("texture")
	%CurrentReverse.visible = companion.has("texture")
	_configure()
