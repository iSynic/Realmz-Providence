extends RefCounted

const ProjectedImage = preload("res://src/projected_image.gd")
const IDS := [2002, 2014, 2012]


static func load_art(bridge, revision: int) -> Array:
	if bridge == null:
		return []
	var response: Dictionary = bridge.request("monster-rewards.preview", {})
	return from_projection(response.get("result", {}), revision) if response.get("ok", false) else []


static func from_projection(result: Dictionary, revision: int) -> Array:
	if result.get("format") != "providence.monster-rewards.v1" or result.get("revision") != revision:
		return []
	var resources: Variant = result.get("resources")
	if not resources is Array or resources.size() != 3:
		return []
	var art: Array = []
	for slot in 3:
		var resource: Variant = resources[slot]
		if not resource is Dictionary or resource.get("resourceId") != IDS[slot]:
			return []
		var state := str(resource.get("resolution", "unavailable"))
		var texture := ProjectedImage.decode(resource) if state == "resolved" else null
		if state == "missing" and not result.get("applicationConfigured", false):
			state = "application catalog not attached"
		elif state == "resolved" and texture == null:
			state = "preview unavailable"
		art.append({"texture": texture, "status": "cicn %d · %s · %s" % [IDS[slot], state, str(resource.get("sourceRole", "unavailable"))]})
	return art
