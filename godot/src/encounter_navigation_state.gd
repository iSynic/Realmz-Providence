extends RefCounted

static func capture(state: Dictionary, browser: ItemList, dialog: Window) -> Dictionary:
	state["listScroll"] = browser.get_v_scroll_bar().value
	state["dialog"] = dialog.read_navigation_state()
	if state.dialog.visible:
		state["result"] = int(state.dialog.result)
		state["step"] = int(state.dialog.step.get("selectedSlot", state.get("step", 0)))
	return state
