extends VBoxContainer

const SIZES := [25, 50, 100, 128]
var _state: ProvidenceIssuesState
var _codes: Array = []


func configure(state: ProvidenceIssuesState) -> void:
	_state = state
	$Uncalled.toggled.connect(func(value): _state.filters.hide_uncalled_warnings = value; _state.reload_filters())
	for count in SIZES: $Types/PageSize.add_item("%d per page" % count)
	$Types/PageSize.item_selected.connect(func(index): _state.set_capacity(SIZES[index]))
	$Types/TypeFilter.item_selected.connect(func(index): _state.set_filters(_state.query, _state.severity, str($Types/TypeFilter.get_item_metadata(index))))
	$Temporary/Enabled.toggled.connect(func(value): _state.filters.enabled = value; _state.reload_filters())
	$Temporary/Rules.get_popup().hide_on_checkable_item_selection = false
	$Temporary/Rules.get_popup().id_pressed.connect(_toggle_rule)
	state.changed.connect(_render)
	_render()


func _render() -> void:
	var available: Array = _state.page.get("availableCodes", _codes).duplicate()
	if _state.status == "no-project": available = []
	elif not _state.code.is_empty() and not available.has(_state.code): available.append(_state.code)
	if available != _codes or $Types/TypeFilter.item_count == 0:
		_codes = available.duplicate()
		$Types/TypeFilter.clear()
		$Types/TypeFilter.add_item("All finding types")
		$Types/TypeFilter.set_item_metadata(0, "")
		for code in _codes:
			$Types/TypeFilter.add_item(preload("res://src/issues_presentation.gd").type_label(str(code)))
			$Types/TypeFilter.set_item_tooltip($Types/TypeFilter.item_count - 1, str(code))
			$Types/TypeFilter.set_item_metadata($Types/TypeFilter.item_count - 1, code)
	for index in $Types/TypeFilter.item_count:
		if $Types/TypeFilter.get_item_metadata(index) == _state.code: $Types/TypeFilter.select(index)
	$Types/PageSize.select(maxi(0, SIZES.find(_state.limit)))
	$Types/TypeFilter.disabled = _state.status == "no-project"
	$Uncalled.set_pressed_no_signal(_state.filters.hide_uncalled_warnings)
	$Uncalled.disabled = _state.status == "no-project"
	$Temporary/Enabled.set_pressed_no_signal(_state.filters.enabled)
	$Temporary/Enabled.disabled = _state.filters.rules.is_empty()
	$Temporary/Rules.text = "Hidden filters (%d)" % _state.filters.rules.size()
	$Temporary/Rules.disabled = _state.filters.rules.is_empty()
	$Temporary/Count.text = "%d rows hidden" % int(_state.page.get("temporaryHiddenCount", 0)) if not _state.filters.rules.is_empty() or _state.filters.hide_uncalled_warnings else ""
	var popup: PopupMenu = $Temporary/Rules.get_popup()
	popup.clear()
	for index in _state.filters.rules.size():
		var rule: Dictionary = _state.filters.rules[index]
		popup.add_check_item(str(rule.label), index)
		popup.set_item_checked(index, bool(rule.enabled))
	if not _state.filters.rules.is_empty():
		popup.add_separator()
		popup.add_item("Remove all hidden filters", _state.filters.rules.size())


func _toggle_rule(index: int) -> void:
	if index == _state.filters.rules.size(): _state.filters.reset()
	else: _state.filters.rules[index].enabled = not _state.filters.rules[index].enabled
	_state.reload_filters()
