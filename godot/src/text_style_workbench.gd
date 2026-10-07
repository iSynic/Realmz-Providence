extends VBoxContainer

signal draft_changed
signal validation_changed(valid: bool, message: String)

const FONTS := {0:"Default",1:"Application / Geneva",3:"Geneva",4:"Monaco",16:"Palatino",20:"Times",21:"Helvetica",22:"Courier",23:"Symbol",1602:"Black Chancery",2004:"Sand"}
var inspect_handler: Callable
var _previous := ""
var _edits: Array = []
var _runs: Array = []
var _patch: Dictionary = {}
var _version := 0
var _shown_version := -1
var _suppress := false
var _editable_styles := true
var _locked := false
var _selected_range := -1
var _font_cache: Dictionary = {}

var editor: TextEdit:
	get: return %Draft

func _ready() -> void:
	for id in FONTS: %StyleFont.add_item(FONTS[id],id)
	%Draft.text_changed.connect(_text_changed)
	%Draft.caret_changed.connect(_selection_changed)
	%StyleBold.toggled.connect(_set_patch.bind("bold"))
	%StyleItalic.toggled.connect(_set_patch.bind("italic"))
	%StyleUnderline.toggled.connect(_set_patch.bind("underline"))
	%StyleFont.item_selected.connect(func(index): _patch["font"] = %StyleFont.get_item_id(index); _selection_changed())
	%StyleSize.value_changed.connect(func(value): _patch["size"] = int(value); _selection_changed())
	%StyleColor.color_changed.connect(func(color): _patch["color"] = [roundi(color.r*65535),roundi(color.g*65535),roundi(color.b*65535)]; _selection_changed())
	%ApplySelection.pressed.connect(_apply_selection)
	%StyleRanges.item_selected.connect(_range_selected)
	%AddStyleRange.pressed.connect(_add_range)
	%EditStyleRange.pressed.connect(func(): _range_selected(_selected_range); %StyleBold.grab_focus())
	%RemoveStyleRange.pressed.connect(_remove_range)
	%StyleTimer.timeout.connect(_inspect)

func reset_document(text: String, result: Dictionary = {}) -> void:
	_version += 1
	_suppress = true
	%Draft.text = text
	_suppress = false
	_previous = text
	_edits.clear()
	_patch.clear()
	_selected_range = -1
	for control in [%StyleBold,%StyleItalic,%StyleUnderline]: control.set_pressed_no_signal(false)
	%StyleFont.select(0)
	%StyleSize.set_value_no_signal(12)
	%StyleColor.color = Color.BLACK
	%PreviewTitle.text = "AUTHOR PREVIEW · APPROXIMATION"
	%StyleTimer.stop()
	_runs = result.get("styles",[]).duplicate(true)
	_editable_styles = bool(result.get("styleEditable",true))
	_shown_version = _version
	%FormattingNotice.text = str(result.get("styleError","")) if result.get("styleError") != null else "Unsupported imported attributes stay unchanged unless explicitly replaced."
	_render()
	_selection_changed()

func edits() -> Array: return _edits.duplicate(true)
func has_formatting_changes() -> bool:
	return _edits.any(func(edit): return edit.kind != "replace-text")
func current_ranges() -> Array: return _runs.duplicate(true)
func valid_preview() -> bool: return _shown_version == _version

func cancel_pending() -> void:
	_version += 1
	%StyleTimer.stop()

func request_validation() -> void:
	_version += 1
	%StyleTimer.start()
	validation_changed.emit(false,"Checking text and formatting…")

func set_locked(locked: bool) -> void:
	_locked = locked
	editor.editable = not locked
	_selection_changed()

func _set_patch(value: bool, field: String) -> void:
	_patch[field] = value
	_selection_changed()

func _text_changed() -> void:
	if _suppress: return
	var text := %Draft.text as String
	var start := 0
	while start < mini(text.length(),_previous.length()) and text[start] == _previous[start]: start += 1
	var suffix := 0
	while suffix < mini(text.length()-start,_previous.length()-start) and text[text.length()-suffix-1] == _previous[_previous.length()-suffix-1]: suffix += 1
	var change := {"kind":"replace-text","start":start,"removed":_previous.length()-start-suffix,"text":text.substr(start,text.length()-start-suffix)}
	if not _edits.is_empty() and _edits[-1].kind == "replace-text" and int(_edits[-1].removed) == 0 and int(change.removed) == 0 and int(change.start) == int(_edits[-1].start)+str(_edits[-1].text).length():
		_edits[-1].text += change.text
	else: _edits.append(change)
	_previous = text
	_queue()

func _queue() -> void:
	_version += 1
	%PreviewTitle.text = "AUTHOR PREVIEW · CHECKING CHANGES"
	%StyleTimer.start()
	validation_changed.emit(false,"Checking text and formatting…")
	draft_changed.emit()
	_selection_changed()

func _inspect() -> void:
	if not inspect_handler.is_valid(): return
	var version := _version
	var response: Dictionary = await inspect_handler.call(edits())
	if version != _version or not is_inside_tree(): return
	if not response.get("ok",false):
		%PreviewTitle.text = "AUTHOR PREVIEW · LAST VALID VERSION"
		%FormattingNotice.text = str(response.get("error","The formatting preview could not be read."))
		validation_changed.emit(false,%FormattingNotice.text)
		return
	var result: Dictionary = response.result
	var selected_start := int(_runs[_selected_range].start) if _selected_range >= 0 and _selected_range < _runs.size() else -1
	_runs = result.get("styles",[])
	_selected_range = _runs.find_custom(func(run): return int(run.start)==selected_start) if selected_start>=0 else -1
	_editable_styles = bool(result.get("styleEditable",true))
	_shown_version = version
	%FormattingNotice.text = str(result.get("styleError","")) if result.get("styleError") != null else "Preview approximates Classic fonts and adapts the default text color to this theme."
	%PreviewTitle.text = "AUTHOR PREVIEW · APPROXIMATION"
	_render()
	validation_changed.emit(bool(result.feedback.valid),"%d Classic bytes · %s" % [int(result.feedback.encodedBytes),"Representable in MacRoman" if result.feedback.valid else "Correct unsupported characters before Apply"])
	_selection_changed()

func selection() -> Vector2i:
	if not %Draft.has_selection(): return Vector2i(-1,-1)
	return Vector2i(_offset(%Draft.get_selection_from_line(),%Draft.get_selection_from_column()),_offset(%Draft.get_selection_to_line(),%Draft.get_selection_to_column()))

func _offset(line: int, column: int) -> int:
	var offset := column
	for index in line: offset += %Draft.get_line(index).length()+1
	return offset

func _selection_changed() -> void:
	if not is_node_ready(): return
	var range := selection()
	%SelectionStatus.text = "Selected: characters %d–%d · %d characters" % [range.x+1,range.y,range.y-range.x] if range.x >= 0 else "Select text to apply formatting · font choices and B/I/U stay local until Apply"
	%ApplySelection.disabled = _locked or not _editable_styles or range.x < 0 or range.y <= range.x or _patch.is_empty()
	for control in [%StyleBold,%StyleItalic,%StyleUnderline,%StyleFont,%StyleColor]: control.disabled = _locked or not _editable_styles
	%StyleSize.editable = not _locked and _editable_styles
	var start := _offset(editor.get_caret_line(),editor.get_caret_column())
	var boundary := _runs.any(func(run): return int(run.start) == start)
	%AddStyleRange.disabled = _locked or not _editable_styles or start >= editor.text.length() or boundary
	%AddStyleRange.tooltip_text = "This position already starts a range; select it and use Edit range." if boundary else "Place the caret inside the text to add a formatting boundary."
	%RemoveStyleRange.disabled = _locked or not _editable_styles or _selected_range < 0 or _selected_range >= _runs.size() or not _runs[_selected_range].get("removable",true)
	%RemoveStyleRange.tooltip_text = "This imported range carries unsupported attributes that must be preserved." if _selected_range >= 0 and _selected_range < _runs.size() and not _runs[_selected_range].get("removable",true) else "Remove the selected formatting boundary; surrounding text remains."
	%EditStyleRange.disabled = _locked or not _editable_styles or _selected_range < 0 or _selected_range >= _runs.size()

func _apply_selection() -> void:
	var range := selection()
	if %ApplySelection.disabled: return
	_edits.append({"kind":"format","start":range.x,"end":range.y,"patch":_patch.duplicate(true)})
	_patch.clear()
	_queue()

func _range_selected(index: int) -> void:
	if index < 0 or index >= _runs.size(): return
	_selected_range = index
	var run: Dictionary = _runs[index]
	var start := _position(int(run.start))
	var end := _position(int(run.end))
	%Draft.set_caret_line(start.y)
	%Draft.set_caret_column(start.x)
	%Draft.select(start.y,start.x,end.y,end.x)
	for pair in [[%StyleBold,1],[%StyleItalic,2],[%StyleUnderline,4]]:
		pair[0].set_pressed_no_signal((int(run.face)&int(pair[1])) != 0)
	var font_index: int = %StyleFont.get_item_index(int(run.font))
	if font_index < 0:
		%StyleFont.add_item("Imported font %d (preserved)" % int(run.font), int(run.font))
		font_index = %StyleFont.item_count - 1
	%StyleFont.select(font_index)
	%StyleSize.set_value_no_signal(maxi(1,int(run.size)))
	%StyleColor.color = Color(float(run.color[0])/65535,float(run.color[1])/65535,float(run.color[2])/65535)
	_patch.clear()
	_selection_changed()

func _position(index: int) -> Vector2i:
	var prefix := editor.text.left(index)
	return Vector2i(prefix.length()-prefix.rfind("\n")-1,prefix.count("\n"))

func _add_range() -> void:
	var start := _offset(editor.get_caret_line(),editor.get_caret_column())
	if _runs.any(func(run): return int(run.start) == start): return
	_edits.append({"kind":"add-range","start":start})
	_queue()

func _remove_range() -> void:
	if %RemoveStyleRange.disabled: return
	_edits.append({"kind":"remove-range","start":int(_runs[_selected_range].start)})
	_selected_range = -1
	_queue()

func _render() -> void:
	%StyleRanges.clear()
	for run in _runs:
		%StyleRanges.add_item("%d–%d  %s  %d pt  %s%s%s" % [int(run.start)+1,int(run.end),str(run.get("fontName")) if run.get("fontName") != null else "Imported font %d" % int(run.font),int(run.size),"Bold " if int(run.face)&1 else "","Italic " if int(run.face)&2 else "","Underline " if int(run.face)&4 else ""])
	if _selected_range>=0 and _selected_range<_runs.size(): %StyleRanges.select(_selected_range)
	%AuthorPreview.clear()
	if _runs.is_empty(): %AuthorPreview.append_text(editor.text); return
	for run in _runs:
		var color := Color(float(run.color[0])/65535,float(run.color[1])/65535,float(run.color[2])/65535)
		if color == Color.BLACK: color = get_theme_color("font_color","Label")
		%AuthorPreview.push_color(color)
		%AuthorPreview.push_font(_font_for(run))
		%AuthorPreview.push_font_size(clampi(int(run.size),1,255) if int(run.size)>0 else 12)
		if int(run.face)&4: %AuthorPreview.push_underline()
		%AuthorPreview.append_text(editor.text.substr(int(run.start),int(run.end)-int(run.start)))
		if int(run.face)&4: %AuthorPreview.pop()
		for _property in 3: %AuthorPreview.pop()

func _font_for(run: Dictionary) -> Font:
	var key := "%d:%d" % [int(run.font) if FONTS.has(int(run.font)) else 0,int(run.face)&3]
	if not _font_cache.has(key):
		var font := SystemFont.new()
		font.font_names = PackedStringArray(["Consolas","Courier New"]) if int(run.font) in [4,22] else PackedStringArray(["Times New Roman"]) if int(run.font) in [16,20,1602] else PackedStringArray(["Segoe UI","Arial"])
		font.font_weight = 700 if int(run.face)&1 else 400
		font.font_italic = (int(run.face)&2) != 0
		_font_cache[key] = font
	return _font_cache[key]
