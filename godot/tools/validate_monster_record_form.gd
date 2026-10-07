extends SceneTree

var _failed := false


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	_check_reference_labels()
	var form := load("res://src/monster_record_form.tscn").instantiate() as Control
	form.size = Vector2(828, 720)
	root.add_child(form)
	await process_frame
	_check(form.field_count() == 123, "Monster form does not contain all 123 source-bound fields")
	_check(form.get_combined_minimum_size().x <= 828, "Monster form exceeds its bounded detail width")
	_check_inventory(form)
	var requested_sets: Array[int] = []
	form.set_requested.connect(func(set_id: int): requested_sets.append(set_id))
	_bind_fixture(form)
	await process_frame
	await process_frame
	_check_section_geometry(form)
	_check_slot_bindings(form)
	_check_scalar_bindings(form)
	for set_name in ["Normal", "Monster", "Mega"]:
		var button := form.get_node("Content/SetPanel/MonsterSetToolbar/Sets/" + set_name) as Button
		_check(not button.disabled, "Connected set navigation remains disabled")
		button.pressed.emit()
	_check(requested_sets == [0, 1, -1], "Set navigation emitted incorrect identities")
	form.clear_projection()
	_check_clear(form)
	form.queue_free()
	await process_frame
	await _check_library_preview()
	_check_appearance()
	await _check_thumbnails()
	if not _failed: print("PROVIDENCE_MONSTER_RECORD_FORM_OK fields=123 sections=6 exact-array-slots read-only-preserved")
	quit(1 if _failed else 0)


func _check_inventory(form: Control) -> void:
	var expected: Array[String] = ["displayName", "deathMacro", "hitDice", "staminaBonus", "agility", "movementMax", "armor", "magicResistance", "magicToHit", "experience", "spellPoints", "maxSpellPoints", "traitor", "size", "requiredWeapon", "attackCount", "magicAttackCount", "damageBonus", "castPercent", "runPercent", "surrenderPercent", "missilePercent", "canSummon", "weapon"]
	for family in {"typeFlags": 8, "spells": 10, "items": 6, "money": 3, "spellImmunities": 6, "saves": 6, "conditions": 40}:
		var counts := {"typeFlags": 8, "spells": 10, "items": 6, "money": 3, "spellImmunities": 6, "saves": 6, "conditions": 40}
		for index in counts[family]: expected.append("%s.%d" % [family, index])
	for attack in 5:
		for slot in 4: expected.append("attacks.%d.%d" % [attack, slot])
	for field in form.find_children("*", "", true, false):
		if field.has_method("bind_record"):
			_check(expected.has(field.field_path), "Unexpected or duplicate Monster field: " + str(field.field_path))
			expected.erase(field.field_path)
	_check(expected.is_empty(), "Required Monster fields missing: " + str(expected))


func _bind_fixture(form: Control) -> void:
	form.set_projection({"setId": -1, "monster": {
		"identity": "monster:-1:0", "nativeId": 0, "displayName": "Fixture Frog", "hitDice": 3.0,
		"conditions": range(10, 50), "typeFlags": [0, 0, 0, 0, 0, 0, 0, 1], "notOnMenu": false,
		"attacks": [[2, 6, 34, 0], [0, 0, 31, 0], [0, 0, 31, 0], [0, 0, 31, 0], [0, 0, 31, 0]],
		"spells": [7, 0, 0, 0, 0, 0, 0, 0, 0, 0], "items": [-8, 0, 0, 0, 0, 0], "weapon": 0, "money": [1, 2, 3],
	}, "description": {"text": "Explicit test description"}, "slotPreview": {
		"spells": [{"slot": 0, "rawId": 7, "target": "classic.spell.7", "label": "Fixture spell", "resolution": "resolved"}],
		"items": [{"slot": 0, "rawId": -8, "label": "Must not display", "resolution": "ambiguous"}],
	}}, true)


func _field(form: Control, path: String) -> Node:
	for field in form.find_children("*", "", true, false):
		if field.has_method("bind_record") and field.field_path == path: return field
	return null


func _check_slot_bindings(form: Control) -> void:
	var spell := _field(form, "spells.0")
	_check(spell.get_node("Reference").visible and spell.get_node("Reference").disabled and spell.get_node("Reference").text == "7 · Fixture spell", "Spell preview lost exact identity/name")
	spell.bind_slot_preview([{"slot": 1, "rawId": 7, "label": "Wrong slot", "resolution": "resolved"}])
	_check(spell.get_node("Reference").text == "7 · Fixture spell", "Wrong slot replaced Monster reference")
	spell.bind_slot_preview([{"slot": 0, "rawId": 7, "label": "No identity", "resolution": "resolved"}])
	_check(spell.get_node("Reference").text == "7 · Fixture spell", "Unidentified target replaced Monster reference")
	_check(_field(form, "items.0").get_node("Reference").text == "-8 · Ambiguous target", "Ambiguous item lost its signed identity")
	var attack := _field(form, "attacks.0.2").get_node("Reference") as Button
	_check(attack.text == "34\nBite" and attack.disabled, "Attack form lost semantic label")
	var art := ImageTexture.create_from_image(Image.create(2, 2, false, Image.FORMAT_RGBA8))
	form.set_reward_art([{"texture": art}, {"texture": art}, {"texture": art}])
	_check(_field(form, "money.0").get_node("Icon").texture == art and _field(form, "money.0").get_node("Value").text == "1", "Reward art displaced its source amount")


func _check_scalar_bindings(form: Control) -> void:
	_check(_field(form, "conditions.39").get_node("Value").text == "49", "Last condition lost slot 39")
	_check(_field(form, "hitDice").get_node("Value").text == "3", "JSON integer acquired decimal suffix")
	_check(_field(form, "attacks.0.0").get_node("Value").text == "2", "Damage became a reference label")
	_check(_field(form, "typeFlags.7").get_node("Value").button_pressed, "Last trait lost slot 7")
	_check(form.get_node("%HideFromBestiary").button_pressed, "Bestiary flag lost its Normal owner")
	_check(form.get_node("%Description").text == "Explicit test description", "Shared description did not bind")
	for field in form.find_children("*", "", true, false):
		if field.has_method("bind_record") and field.get_node("Value") is CheckBox:
			var outline := field.get_node("Value").get_theme_stylebox("disabled") as StyleBoxFlat
			_check(outline != null and outline.border_width_left >= 1, "Unchecked read-only flag lost its boundary")


func _check_clear(form: Control) -> void:
	_check(_field(form, "money.0").get_node("Icon").texture == null, "Clearing retained reward art")
	_check(not _field(form, "spells.0").get_node("Reference").visible, "Clearing retained a slot preview")
	_check(_field(form, "conditions.39").get_node("Value").text.is_empty(), "Clearing retained condition data")
	_check(form.get_node("%Description").text.is_empty(), "Clearing retained description")
	for button in form.find_children("*", "Button", true, false):
		_check(button.disabled, "Cleared form command is enabled: " + str(button.name))


func _check_section_geometry(form: Control) -> void:
	for section in ["Overview", "Attacks", "Spells", "Items", "Saves", "Conditions"]:
		form.show_section(section)
		_check(form.get_node("Content/BodyScroll/Pages/" + section).visible, "Section cannot be reached: " + section)
		_check(form.get_node("Content/DraftFooter").visible, "Draft footer disappeared while changing sections")
	form.show_section("Overview")
	var footer := form.get_node("Content/DraftFooter") as Control
	_check(footer.position.y + footer.size.y <= form.size.y, "Draft footer lies outside its bounded form")


func _check_reference_labels() -> void:
	var labels = preload("res://src/monster_reference_labels.gd")
	_check(labels.display("deathMacro", 0) == "0 · No monster macro", "Empty macro lost semantic label")
	_check(labels.display("weapon", 0) == "0 · No weapon", "Empty weapon lost semantic label")
	_check(labels.display("requiredWeapon", 0) == "0 · All weapons", "Unrestricted weapon lost semantic label")
	_check(labels.display("requiredWeapon", -1) == "-1 · Blunt only", "Signed restriction lost raw byte value")
	_check(labels.display("requiredWeapon", 254) == "254 · Sharp only", "Unsigned restriction lost raw byte value")
	_check(labels.display("spells.0", 0) == "0 · No spell", "Empty spell was presented as unresolved")
	_check(labels.display("items.0", 99) == "99 · Item label unavailable", "Unknown item invented a resolved name")
	_check(labels.display("canSummon", 1) == "1 = Yes", "Summon eligibility lost meaning")
	_check(labels.display("attacks.0.2", 34) == "34 · Bite", "Known attack form lost label")
	_check(labels.display("attacks.0.2", 31) == "31 · Unknown form", "Unknown attack form invented meaning")
	_check(labels.display("attacks.0.3", 0) == "0 · No Special Attacks", "Empty special attack lost label")
	_check(labels.display("hitDice", 3).is_empty(), "Ordinary numeric field was treated as a reference")


class PortraitBridge:
	extends RefCounted
	var calls := 0
	func request(_method: String, params: Dictionary) -> Dictionary:
		calls += 1
		var image := Image.create(64, 32, false, Image.FORMAT_RGBA8)
		image.fill(Color.RED)
		var bytes := image.save_png_to_buffer()
		return {"ok": true, "result": {
			"format": "providence.monster-appearance.v1", "iconId": params.iconId, "payloadComplete": true,
			"base": {"payloadAvailable": true, "mimeType": "image/png", "bytes": bytes.size(), "base64": Marshalls.raw_to_base64(bytes)},
		}}


func _check_thumbnails() -> void:
	var inventory := Control.new()
	root.add_child(inventory)
	var scroll := ScrollContainer.new()
	scroll.name = "InventoryScroll"
	scroll.size = Vector2(200, 80)
	inventory.add_child(scroll)
	var rows := Control.new()
	rows.name = "Rows"
	rows.custom_minimum_size = Vector2(200, 180)
	scroll.add_child(rows)
	for index in 3:
		var row := load("res://src/monster_inventory_row.tscn").instantiate() as Control
		rows.add_child(row)
		row.position = Vector2(0, index * 60)
		row.size = Vector2(180, 60)
		row.set_meta("icon_id", 4 if index < 2 else 9)
	var loader = load("res://src/monster_inventory_thumbnails.gd").new()
	root.add_child(loader)
	var bridge := PortraitBridge.new()
	loader.attach(bridge, [inventory])
	loader.set_process(false)
	await process_frame
	loader.load_visible_row()
	_check(bridge.calls == 1, "Thumbnail tick loaded more than one appearance")
	var texture: Texture2D = rows.get_child(0).get_node("Contents/Portrait").texture
	_check(texture != null and texture.get_width() == 32 and texture.get_height() == 16, "Thumbnail retained full-size image or distorted aspect")
	loader.load_visible_row()
	_check(bridge.calls == 1, "Shared icon was requested twice")
	loader.load_visible_row()
	_check(bridge.calls == 1, "Offscreen row triggered media IO")
	loader._process(0.0)
	_check(not loader.is_processing(), "Satisfied visible rows left idle processing active")
	scroll.scroll_vertical = 60
	_check(loader.is_processing(), "Scrolling did not rearm thumbnail work")
	await process_frame
	loader._process(0.0)
	_check(bridge.calls == 2 and rows.get_child(2).get_node("Contents/Portrait").texture != null, "Newly visible row did not load exactly once after real scroll")
	loader._process(0.0)
	_check(not loader.is_processing() and bridge.calls == 2, "Idle wake made unnecessary media requests")
	loader.attach(null, [inventory])
	_check(rows.get_child(0).get_node("Contents/Portrait").texture == null, "Detach retained stale thumbnail")
	loader.load_visible_row()
	_check(bridge.calls == 2, "Detached thumbnail loader made a request")
	loader.queue_free()
	inventory.queue_free()
	await process_frame


func _check_appearance() -> void:
	var view = load("res://src/monster_appearance_view.gd")
	var image := Image.create(2, 2, false, Image.FORMAT_RGBA8)
	image.fill(Color.RED)
	var bytes := image.save_png_to_buffer()
	var projection := {
		"format": "providence.monster-appearance.v1", "iconId": -8, "payloadComplete": true,
		"base": {"payloadAvailable": true, "mimeType": "image/png", "bytes": bytes.size(),
			"base64": Marshalls.raw_to_base64(bytes), "sourceRole": "scenario"},
	}
	var resolved: Dictionary = view.from_projection(projection, -8)
	_check(resolved.texture != null and resolved.texture.get_width() == 2, "Projected portrait was not decoded")
	_check(resolved.status.to_lower().contains("scenario"), "Appearance ownership was lost")
	projection.facing = projection.base.duplicate(true)
	_check(view.from_projection(projection, -8).facingTexture != null, "Resolved facing artwork was not decoded independently")
	projection.facing.bytes = bytes.size() + 1
	_check(view.from_projection(projection, -8).facingTexture == null, "Malformed facing pixels reused a base texture")
	_check(view.from_projection(projection, 8).texture == null, "Wrong signed icon identity was accepted")
	projection.payloadComplete = false
	_check(view.from_projection(projection, -8).status.contains("facing unavailable"), "Missing facing was hidden")
	projection.base.bytes = bytes.size() + 1
	_check(view.from_projection(projection, -8).texture == null, "Mismatched payload size was accepted")
	projection.base = null
	_check(view.from_projection(projection, -8).texture == null, "Missing base reused an old portrait")
	_check(view.load_portrait(null, -8).texture == null, "Detached view produced artwork")
	var rewards = load("res://src/monster_reward_view.gd")
	var rows: Array = []
	for id in [2002, 2014, 2012]:
		rows.append({"resourceId": id, "resolution": "resolved", "sourceRole": "classic-application", "payloadAvailable": true, "mimeType": "image/png", "bytes": bytes.size(), "base64": Marshalls.raw_to_base64(bytes)})
	var reward_projection := {"format": "providence.monster-rewards.v1", "revision": 7, "applicationConfigured": true, "resources": rows}
	var art: Array = rewards.from_projection(reward_projection, 7)
	_check(art.size() == 3 and art.all(func(row): return row.texture != null), "Three independent reward icons did not decode")
	_check(rewards.from_projection(reward_projection, 8).is_empty(), "Stale reward revision was accepted")
	rows[0].resourceId = 2310
	_check(rewards.from_projection(reward_projection, 7).is_empty(), "Actor-facing offset was accepted as Gold")
	rows[0].resourceId = 2002
	rows[0].resolution = "missing"
	reward_projection.applicationConfigured = false
	art = rewards.from_projection(reward_projection, 7)
	_check(art[0].texture == null and art[0].status.contains("not attached"), "Unattached catalog was reported as a missing source")
	_check(rewards.load_art(null, 7).is_empty(), "Detached reward view produced artwork")


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)


func _check_library_preview() -> void:
	var preview := load("res://src/monster_library_preview.tscn").instantiate() as Control
	preview.size = Vector2(828, 810)
	root.add_child(preview)
	await process_frame
	_check(preview.get_combined_minimum_size().x <= 828, "Library preview exceeds approved width")
	_check(preview.set_projection({"protected": true, "entry": {
		"identity": "library:stock:0", "ownership": "built-in", "label": "Fixture Frog",
		"description": "Reference description, not Scenario 0 text.", "template": {
			"hitDice": 3, "attacks": [[2, 8, 34, 0]], "money": [12, 3, 4],
			"spells": [0, -42, 7], "items": [0, 0],
		},
	}}, 17), "Protected reference did not bind")
	_check((preview.get_node("LibraryDescription/Body/Text/Description") as Label).text == "Reference description, not Scenario 0 text.", "Library description was replaced by scenario text")
	_check((preview.get_node("StatsAndAttacks/LibraryAttacks/Body/AttackTable/Damage0") as Label).text == "2–8", "Attack damage slots were reordered")
	var spells := preview.get_node("%Spells")
	_check(spells.row_scene is PackedScene and spells.row_scene.resource_path == "res://src/monster_library_reference_row.tscn", "Library row composition is not owned by the scene")
	var rows := spells.get_node("Rows")
	_check(rows.get_child_count() == 2 and rows.get_child(0).get_meta("native_id") == -42 and rows.get_child(1).get_meta("slot") == 2, "Signed library IDs or exact slot order were lost")
	_check(rows.get_child(0).get_node("Contents/Target").text == "Spell -42" and rows.get_child(0).get_meta("resolution_state") == "unavailable", "Raw reference fabricated a resolved label")
	_check(preview.get_node("%Items/Status").text == "No items", "Empty item list is not explicit")
	spells.set_slots([7.0, 7.0], "Spell", "No spells")
	_check(rows.get_child_count() == 2 and rows.get_child(1).get_meta("native_id") == 7, "Repeated JSON slots were deduplicated or lost")
	spells.set_slots([7, "bad"], "Spell", "No spells")
	_check(rows.get_child_count() == 0 and spells.get_node("Status").text == "Slot data unavailable", "Malformed slot left partial or fabricated data")
	spells.set_slots(null, "Spell", "No spells")
	_check(spells.get_node("Status").text == "Slot data unavailable", "Absent slot data was reported as empty")
	spells.set_slots(range(11), "Spell", "No spells")
	_check(rows.get_child_count() == 0 and spells.get_node("Status").text == "Slot data unavailable", "Library spell presentation exceeded its ten-slot bound")
	var resolved := {"slot": 0.0, "rawId": 7.0, "target": "classic.spell.7", "label": "Fixture spell", "resolution": "resolved"}
	spells.set_slots([7.0], "Spell", "No spells", [resolved])
	_check(rows.get_child(0).get_node("Contents/Target").text == "Fixture spell · Spell 7", "Core projected name was not displayed")
	resolved.rawId = 8
	spells.set_slots([7], "Spell", "No spells", [resolved])
	_check(rows.get_child(0).get_meta("resolution_state") == "unavailable", "Wrong signed slot projection was accepted")
	resolved.rawId = 7
	resolved.resolution = "ambiguous"
	spells.set_slots([7], "Spell", "No spells", [resolved])
	_check(rows.get_child(0).get_node("Contents/Target").text == "Spell 7" and rows.get_child(0).get_node("Contents/Resolution").text == "Ambiguous target", "Ambiguous projection reused a chosen name")
	_check((preview.get_node("%Jewelry") as Label).text == "4", "Final reward did not bind")
	var fixture_image := Image.create(2, 2, false, Image.FORMAT_RGBA8)
	var fixture_texture := ImageTexture.create_from_image(fixture_image)
	preview.set_reward_art([{"texture": fixture_texture}, {"texture": fixture_texture}, {"texture": fixture_texture}])
	_check(preview.get_node("%GoldIcon").texture == fixture_texture and preview.get_node("%JewelryIcon").texture == fixture_texture, "Reward scene slots did not bind")
	var stats := preview.get_node("StatsAndAttacks/LibraryStats/Body")
	for field in ["hitDice", "armor", "agility", "movementMax", "attackCount", "magicAttackCount", "spellPoints", "experience"]:
		_check(stats.get_node(field) is PanelContainer, "Library fact lost its named bordered row: " + field)
	var table := preview.get_node("StatsAndAttacks/LibraryAttacks/Body/AttackTable") as GridContainer
	_check(table.get_child_count() == 24 and table.get_theme_constant("h_separation") == 0 and table.get_theme_constant("v_separation") == 0, "Attack grid lost its contiguous four-column structure")
	_check(table.get_node("Damage0").get_theme_stylebox("normal") is StyleBoxFlat, "Attack cell border is missing")
	_check((preview.get_node("OwnershipHeader/OwnershipActions/Row1/ReplaceScenario") as Button).text == "Replace Scenario 17", "Inactive replacement target is wrong")
	var actions := preview.find_children("*", "Button", true, false)
	_check(actions.size() == 6, "Library ownership action coverage changed")
	for action in actions:
		_check(action.disabled, "Library ownership mutation is enabled")
	_check(not preview.set_projection({"protected": false, "entry": {"identity": "custom:0", "ownership": "custom"}}), "Custom ownership was presented as protected")
	_check(preview.current_identity().is_empty(), "Ownership rejection retained stale identity")
	_check(rows.get_child_count() == 0 and spells.get_node("Status").text == "—", "Clearing retained reference rows or state")
	_check((preview.get_node("%Jewelry") as Label).text == "—", "Cleared Library preview retained rewards")
	_check(preview.get_node("%JewelryIcon").texture == null, "Clearing retained reward artwork")
	preview.queue_free()
	var inspector := load("res://src/inspector_panel.tscn").instantiate() as Control
	root.add_child(inspector)
	inspector.show_monster_context({"kind": "monster-library-entry", "result": {"entry": {"identity": "library:stock:0", "label": "Fixture Frog"}}})
	_check(inspector.get_node("%CurrentReferenceTarget").text == "Fixture Frog\nReference information unavailable", "Absent Library references were reported as zero or lost the selected name")
	inspector.show_monster_context({"kind": "monster-library-entry", "result": {"entry": {"identity": "library:stock:0", "label": "Fixture Frog"}, "references": []}})
	_check(inspector.get_node("%CurrentReferenceTarget").text == "Fixture Frog\n0 outgoing references", "An explicit empty reference projection was treated as unavailable")
	inspector.show_monster_context({"kind": "scenario-monster", "result": {"setId": -1, "monster": {"identity": "monster:-1:4", "nativeId": 4, "displayName": "Fixture Frog"}, "references": []}})
	_check(inspector.get_node("%CurrentReferenceTarget").text == "Fixture Frog · Mega 4\n0 outgoing references", "Monster Inspector lost selected name or exact set")
	inspector.queue_free()
	await process_frame
