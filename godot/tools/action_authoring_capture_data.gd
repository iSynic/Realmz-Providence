extends RefCounted


static func action_field(index: int, name: String, label: String) -> Dictionary:
	return {"index": index, "row": "primary", "name": name, "label": label,
		"help": label, "control": "integer", "minimum": 0, "maximum": 32767,
		"preserved": false, "targetKind": "message", "choices": []}


static func raw_actions(extra: bool) -> Array:
	if extra:
		return [{"slot": 0, "rawOpcode": 2, "targetNativeId": 15},
			{"slot": 1, "rawOpcode": 1, "targetNativeId": 47},
			{"slot": 2, "rawOpcode": -39, "targetNativeId": 17}]
	return [{"slot": 0, "rawOpcode": 3, "targetNativeId": 4},
		{"slot": 1, "rawOpcode": 1, "targetNativeId": 47},
		{"slot": 2, "rawOpcode": -39, "targetNativeId": 17}]


static func shared_impact_actions(extra: bool) -> Array:
	if extra:
		return [{"slot": 0, "rawOpcode": 1, "targetNativeId": 190},
			{"slot": 1, "rawOpcode": -39, "targetNativeId": 17},
			{"slot": 4, "rawOpcode": 2, "targetNativeId": 2}]
	return [{"slot": 0, "rawOpcode": 1, "targetNativeId": 190},
		{"slot": 1, "rawOpcode": 3, "targetNativeId": 2},
		{"slot": 2, "rawOpcode": -39, "targetNativeId": 3}]


static func catalog() -> Dictionary:
	return {"documentedActionCount": 120, "items": [
		{"identity": "realmz.action.2", "opcode": 2, "label": "Battle", "category": "Encounters",
			"description": "Start one battle or an inclusive random battle range.", "storage": "extra-code-row", "targetKind": null, "formId": "battle"},
		{"identity": "realmz.action.3", "opcode": 3, "label": "Player Option", "category": "Choices",
			"description": "Offer two authored responses, then continue or branch according to Otherwise.", "storage": "extra-code-row", "targetKind": null, "formId": "choice"},
		{"identity": "realmz.action.19", "opcode": 19, "label": "Show Random Message", "category": "Dialogue",
			"description": "Show one message from an inclusive authored range.", "storage": "extra-code-row", "targetKind": null, "formId": "random-message"},
		{"identity": "realmz.action.1", "opcode": 1, "label": "Show Message", "category": "Dialogue",
			"description": "Show a scenario message.", "storage": "direct-code-id", "targetKind": "message", "formId": null},
		{"identity": "realmz.action.9", "opcode": 9, "label": "Play Sound", "category": "Media",
			"description": "Play a scenario sound.", "storage": "direct-code-id", "targetKind": "sound", "formId": null},
		{"identity": "realmz.action.39", "opcode": 39, "label": "Call Extra Action Point", "category": "Flow",
			"description": "Run a reusable Extra Action Point.", "storage": "direct-code-id", "targetKind": "extra-action-point", "formId": null},
		{"identity": "realmz.action.92", "opcode": 92, "label": "Transform Random Region", "category": "Map",
			"description": "Mutate a bounded random map region.", "storage": "paired-extra-code-row", "targetKind": null, "formId": "random-region"},
	], "forms": [{"identity": "random-message", "companionFormId": null, "fields": [
		action_field(0, "messageLow", "First message"), action_field(1, "messageHigh", "Last message"),
		{"index": 2, "row": "primary", "name": "reserved2", "label": "Reserved", "help": "Preserved source word.",
			"control": "integer", "minimum": -32768, "maximum": 32767, "preserved": true, "targetKind": null, "choices": []},
	]}]}


static func definition(identity: String) -> Dictionary:
	for value in catalog().items:
		var result := value as Dictionary
		if str(result.get("identity", "")) == identity: return result
	return {}


static func steps(extra: bool) -> Array:
	if extra:
		return [{"slot": 0, "rawOpcode": 2, "opcode": 2, "targetNativeId": 15,
			"definition": definition("realmz.action.2"), "primarySettings": {"nativeId": 15,
				"typedValues": {"battleLow": 12, "battleHigh": 15, "soundOrReviveLossMacro": 628, "message": 47, "revivePartyFlag": 0}},
			"primaryUsage": {"status": "shared", "callerCount": 2}},
			{"slot": 1, "rawOpcode": 1, "opcode": 1, "targetNativeId": 47, "definition": definition("realmz.action.1")},
			{"slot": 2, "rawOpcode": -39, "opcode": 39, "targetNativeId": 17, "definition": definition("realmz.action.39")}]
	return [{"slot": 0, "rawOpcode": 3, "opcode": 3, "targetNativeId": 4,
		"definition": definition("realmz.action.3"), "primarySettings": {"nativeId": 4,
			"typedValues": {"replyPolarity": 1, "branchMode": 1, "branchTarget": 17, "promptA": 47, "promptB": 52}},
		"primaryUsage": {"status": "shared", "callerCount": 2}},
		{"slot": 1, "rawOpcode": 1, "opcode": 1, "targetNativeId": 47, "definition": definition("realmz.action.1")},
		{"slot": 2, "rawOpcode": -39, "opcode": 39, "targetNativeId": 17, "definition": definition("realmz.action.39")}]


static func linked_steps(state: String) -> Array:
	var sound := state == "linked-sound"
	return [{"slot": 0, "rawOpcode": 9 if sound else 1, "opcode": 9 if sound else 1,
		"targetNativeId": 1015 if sound else 47,
		"definition": definition("realmz.action.9" if sound else "realmz.action.1")}]
