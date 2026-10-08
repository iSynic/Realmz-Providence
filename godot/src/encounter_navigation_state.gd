extends RefCounted

static func capture(state: Dictionary, browser: ItemList, dialog: Window, flow_context: Dictionary = {}) -> Dictionary:
	state["listScroll"] = browser.get_v_scroll_bar().value
	state["dialog"] = dialog.read_navigation_state()
	if state.dialog.visible:
		state["result"] = int(state.dialog.result)
		state["step"] = int(state.dialog.step.get("selectedSlot", state.get("step", 0)))
	if flow_context.get("identity") == str(state.get("identity", "")) + ":result:%d" % int(state.get("result", 0)):
		state.flowSelection = flow_context.duplicate(true)
	return state
