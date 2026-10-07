extends RefCounted

# Result windows use local slots; document drafts keep the global result slot.
static func for_result(result_index: int, drafts: Dictionary, definitions: Dictionary) -> Array:
	var result: Array = []
	for local_slot in range(8):
		var global_slot := result_index * 8 + local_slot
		if not drafts.has(global_slot): continue
		var draft := (drafts[global_slot] as Dictionary).duplicate(true)
		var definition := (definitions.get(str(draft.get("actionIdentity", "")), {}) as Dictionary).duplicate(true)
		var opcode := int(definition.get("opcode", str(draft.get("actionIdentity", "realmz.action.0")).get_slice(".", 2).to_int()))
		var raw: int = -absi(opcode) if bool(draft.get("gosub", false)) else opcode
		var projection := {"slot": local_slot, "rawOpcode": raw, "opcode": abs(raw), "targetNativeId": int(draft.get("targetNativeId", 0)), "definition": definition}
		if draft.has("settings"):
			var settings := draft.settings as Dictionary
			projection["primarySettings"] = {"nativeId": int(draft.get("targetNativeId", 0)), "typedValues": (settings.get("values", {}) as Dictionary).duplicate(true)}
			if settings.has("secondaryValues"): projection["secondarySettings"] = {"nativeId": int(draft.get("targetNativeId", 0)) + 1, "typedValues": (settings.get("secondaryValues", {}) as Dictionary).duplicate(true)}
		result.append(projection)
	return result
