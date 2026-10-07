extends VBoxContainer

signal search_requested(query: Dictionary, generation: int)
signal choice_requested(choice: Dictionary, generation: int)
signal recovery_requested
signal open_requested(choice: Dictionary)

var generation := 0
var selected: Dictionary = {}
var _rows: Array = []
var _offset := 0
var _total := 0


func _ready() -> void:
	for source in ["All sources", "Scenario", "Stock"]: %Ownership.add_item(source)
	%Search.text_changed.connect(func(_text): refresh())
	%Ownership.item_selected.connect(func(_index): refresh())
	%ShowUnavailable.toggled.connect(func(_value): refresh())
	%Choices.item_selected.connect(_choose)
	%Previous.pressed.connect(func(): refresh(maxi(0, _offset - 64)))
	%Next.pressed.connect(func(): refresh(_offset + 64))
	%Retry.pressed.connect(recovery_requested.emit)
	%OpenReference.pressed.connect(func(): open_requested.emit(selected.duplicate(true)))


func refresh(offset := 0) -> void:
	generation += 1; _offset = offset; _rows.clear(); %Choices.clear()
	%Count.text = "Loading Special artwork…"
	set_preview({})
	%OpenReference.disabled = true
	%Details.text = "Painting is paused while artwork loads."
	%Retry.hide()
	%Previous.disabled = true; %Next.disabled = true
	search_requested.emit({"field":"specialLand", "currentValue":int(selected.get("value",0)),
		"search":%Search.text, "ownership":["all","scenario","stock"][%Ownership.selected],
		"showUnavailable":%ShowUnavailable.button_pressed, "offset":offset,"limit":64},generation)


func receive(response: Dictionary, request_generation: int) -> void:
	if request_generation != generation: return
	%Retry.visible = not response.get("ok",false)
	if not response.get("ok",false):
		failure(str(response.get("error","Artwork could not load. Retry."))); return
	var page: Dictionary = response.result.page
	%Choices.clear()
	_rows = page.items; _offset = int(page.offset); _total = int(page.total)
	var thumbnails := {}
	for item: Dictionary in response.result.get("specialThumbnails",[]): thumbnails[int(item.value)] = item.response
	for row: Dictionary in _rows:
		var decoded := preload("res://src/asset_preview_decoder.gd").decode(thumbnails.get(int(row.value),{}),{})
		var index: int = %Choices.add_item("%s\n%d" % [row.label,row.value],decoded.get("texture"))
		%Choices.set_item_metadata(index,row)
		%Choices.set_item_tooltip(index,"%s · %d · %s\n%s" % [row.label,row.value,row.ownership,row.get("reason","")])
		if int(row.value) == int(selected.get("value",0)): %Choices.select(index); _choose.call_deferred(index)
	%Count.text = "%d matches · %d–%d" % [_total,0 if _rows.is_empty() else _offset+1,_offset+_rows.size()]
	%Details.text = "No matching artwork." if _rows.is_empty() else "No artwork selected."
	%Previous.disabled = _offset == 0; %Next.disabled = _offset + _rows.size() >= _total


func _choose(index: int) -> void:
	if index < 0 or index >= _rows.size(): return
	selected = _rows[index].duplicate(true); set_preview({})
	%Details.text = "%s · %d · %s\n%s" % [selected.label,selected.value,selected.ownership,
		"Loading exact artwork…" if selected.available else str(selected.get("reason","Unavailable"))]
	choice_requested.emit(selected.duplicate(true),generation)


func set_preview(decoded: Dictionary) -> void:
	%Preview.texture = decoded.get("texture")
	%OpenReference.disabled = selected.get("targetIdentity") == null or str(selected.get("targetIdentity","")).is_empty() or (%Preview.texture == null and selected.get("available",true))
	if %Preview.texture != null:
		%Details.text = "%s · %d · %s" % [selected.label,selected.value,selected.ownership]


func failure(message: String) -> void:
	_rows.clear(); %Choices.clear(); set_preview({})
	%OpenReference.disabled = true
	%Count.text = message
	%Details.text = "Painting is paused. Retry or check the connection before choosing artwork."
	%Previous.disabled = true; %Next.disabled = true; %Retry.show()


func clear() -> void:
	generation += 1; selected.clear(); _rows.clear(); %Choices.clear(); set_preview({})
	%Count.text = "Choose Special artwork to browse the complete catalog."
