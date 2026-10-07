extends VBoxContainer

signal changed

var _slots := {}
var _generation := 0
var _loading := false
var _replacement := false
var _library := false
var _selected_slot := 1


func _ready() -> void:
	%MusicSlot.item_selected.connect(func(_index):
		if %MusicSlot.get_selected_id() == _selected_slot: return
		_selected_slot = %MusicSlot.get_selected_id(); _present(); changed.emit())
	%ReplaceMusic.toggled.connect(func(_value): changed.emit())
	for slot in range(1, 4): %MusicSlot.add_item("Slot %d" % slot, slot)


func configure(library: bool, replacement: bool, number: int) -> void:
	_generation += 1
	_library = library; _replacement = replacement; _slots.clear()
	%MusicSlot.select(clampi(number - 1, 0, 2))
	_selected_slot = %MusicSlot.get_selected_id()
	%MusicSlot.disabled = library or replacement
	%ReplaceMusic.set_pressed_no_signal(false)
	%ReplaceMusic.disabled = replacement
	%MusicAllocationStatus.text = "My Library retains the exact module. Choose a scenario slot when copying it." if library else "Loading scenario slots…"
	_loading = not library
	%MusicSlot.visible = not library
	%ReplaceMusic.hide()


func load_slots(commands: RefCounted, revision: int) -> Dictionary:
	if _library: return {"ok": true}
	var generation := _generation
	var response: Dictionary = await commands.prepare("media.music-slots", {"expectedRevision": revision})
	if generation != _generation: return {"ok": false, "stale": true}
	if not response.get("ok", false): return response
	if int(response.result.get("revision", -1)) != revision: return {"ok": false, "error": "The scenario changed. Reopen the music review."}
	for row: Dictionary in response.result.get("items", []):
		var slot := int(row.get("slot", 0))
		if slot in [1, 2, 3] and row.get("slotStatus") != "empty": _slots[slot] = row
	_loading = false
	_present()
	return {"ok": true}


func selection() -> Dictionary:
	var slot: int = %MusicSlot.get_selected_id()
	var result := {"resourceId": slot}
	if not _library and %ReplaceMusic.button_pressed and _slots.get(slot, {}).get("canReplace", false): result["replaceIdentity"] = _slots[slot].identity
	return result


func set_locked(locked: bool) -> void:
	%MusicSlot.disabled = locked or _library or _replacement
	%ReplaceMusic.disabled = locked or _replacement


func _present() -> void:
	if _library or _loading: return
	var slot: int = %MusicSlot.get_selected_id()
	%ReplaceMusic.set_pressed_no_signal(_replacement)
	%ReplaceMusic.visible = _slots.get(slot, {}).get("canReplace", false)
	for index in 3:
		var number := index + 1
		%MusicSlot.set_item_text(index, "Slot %d · %s" % [number, str(_slots[number].get("label", "Occupied")) if _slots.has(number) else "Empty"])
	%MusicAllocationStatus.text = str(_slots[slot].slotReason) if _slots.has(slot) else "Slot %d is empty. The exact MOD will be stored as Custom %d Music." % [slot, slot]
