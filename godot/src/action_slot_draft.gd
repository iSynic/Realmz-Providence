extends RefCounted


static func merged(actions: Array, slot: int, opcode: int, target: int) -> Array:
	var draft := actions.duplicate(true)
	if slot < 0:
		return draft
	for index in draft.size():
		if int(draft[index].get("slot", -1)) != slot:
			continue
		if opcode == 0 and target == 0:
			draft.remove_at(index)
		else:
			draft[index]["rawOpcode"] = opcode
			draft[index]["targetNativeId"] = target
		return draft
	if opcode != 0 or target != 0:
		draft.append({"slot": slot, "rawOpcode": opcode, "targetNativeId": target})
		draft.sort_custom(func(left: Dictionary, right: Dictionary): return int(left.slot) < int(right.slot))
	return draft
