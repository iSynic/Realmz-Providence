extends RefCounted


static func target_kind(opcode: int) -> String:
	return {1: "message", 4: "simple encounter", 5: "complex encounter",
		8: "same-map Action Point", 39: "extra Action Point", 92: "EDCD row pair"}.get(opcode, "raw target")


static func opcode_label(opcode: int) -> String:
	return {1: "Display String", 4: "Simple Encounter", 5: "Complex Encounter",
		8: "Same-Map Action", 39: "Extra Action Point", 92: "Random Region Shape"}.get(opcode, "Classic opcode")


static func repair_label(opcode: int) -> String:
	return {1: "Message 47", 4: "Simple Encounter 3", 8: "This Action Point",
		39: "Extra AP 40"}.get(opcode, "Typed Target")
