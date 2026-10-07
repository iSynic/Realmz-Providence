extends RefCounted

func run(shell, view: ProvidenceRuleAuthoringEditor, settle: Callable, snapshot: Callable) -> void:
	view.show_section("References")
	await settle.call()
	assert_reference_labels(view)
	var discovery = shell._commands._discovery
	for pair in [["FindAllUses", "incoming"], ["TraceCallers", "trace"]]:
		view.get_node("%" + pair[0]).pressed.emit()
		await settle.call()
		assert(discovery._view.visible and discovery._view._direction == pair[1])
		assert(discovery._view._record.identity == view.current_selection())
		assert(not discovery._view._page.is_empty())
		if pair[1] == "trace":
			assert(not discovery._view._page.get("workLimited", false))
			assert(int(discovery._view._page.total) == view._uses_total)
			for row in discovery._view._page.items:
				assert(not str(row.link.targetLabel).is_empty())
		await snapshot.call(view, "links-" + pair[1], "Actual Reference button reads existing Discovery links/trace for the selected Rule through the adapter.")
		discovery._view.close_view(); await settle.call()
	var origin := view.current_selection()
	var uses: ItemList = view.get_node("%Uses")
	uses.grab_focus()
	var before := view.read_navigation_state()
	assert(not view._used_by.is_empty())
	var reference: Dictionary = view._used_by[0]
	assert(reference.sourceLabel.contains(" · ") and not reference.fieldLabel.is_empty())
	uses.item_activated.emit(0); await settle.call()
	var target = shell._navigation.current_view()
	assert(target.current_selection() == reference.source)
	assert(target._section in ["Races", "Castes"])
	assert(target.is_ancestor_of(shell.get_viewport().gui_get_focus_owner()))
	await snapshot.call(view, "linked-owner", "Actual caller double-click opens the typed owning Rule and focuses its exact eligibility control.")
	await shell._navigation.navigate_back(); await settle.call()
	assert(shell._navigation.current_view() == view and view.current_selection() == origin)
	assert(view._section == before.section and view.get_node("%RuleDetailScroll").scroll_vertical == before.scroll)
	assert(view.get_node("%RecordList").get_v_scroll_bar().value == before.catalogScroll)
	assert(shell.get_viewport().gui_get_focus_owner() == uses)
	await snapshot.call(view, "linked-return", "Actual shell Back restores the originating identity, section, both scroll positions and focus.")
	await restriction_caller(shell, view, settle, snapshot)

func assert_reference_labels(view: ProvidenceRuleAuthoringEditor) -> void:
	for row in view._outgoing:
		if str(row.field).begins_with("eligible"):
			assert(str(row.fieldLabel).ends_with(str(row.targetId).get_slice(".", 2)))
		if str(row.field) == "startingItemIds[1]":
			assert(row.targetId == "classic.item.14" and row.fieldLabel == "Starting item slot 03")

func restriction_caller(shell, view: ProvidenceRuleAuthoringEditor, settle: Callable, snapshot: Callable) -> void:
	var index := -1
	for candidate in view._used_by.size():
		if str(view._used_by[candidate].field).begins_with("campaign.restrictions."): index = candidate; break
	assert(index >= 0 and view._used_by[index].sourceLabel == "Scenario restrictions")
	view.get_node("%Uses").grab_focus()
	var origin := view.read_navigation_state()
	view.get_node("%Uses").item_activated.emit(index); await settle.call()
	assert(shell._navigation.current_view().route_identity() == "scenario.restrictions")
	var focus: Control = shell.get_viewport().gui_get_focus_owner()
	assert(focus is CheckBox and focus.get_meta("identity") == origin.identity and focus.button_pressed)
	await snapshot.call(view, "restriction-owner", "Real Scenario restriction caller opens and focuses the exact banned identity checkbox.")
	await shell._navigation.navigate_back(); await settle.call()
	assert(shell._navigation.current_view() == view and view.current_selection() == origin.identity and view._section == origin.section)
	var returned: Control = shell.get_viewport().gui_get_focus_owner()
	assert(returned == view.get_node("%Uses"), "Restriction Back focus: %s; origin %s" % [returned.get_path() if returned != null else "none", origin.focus])
	await snapshot.call(view, "restriction-return", "Actual Back from Scenario restrictions restores the Rule caller list and focus.")
