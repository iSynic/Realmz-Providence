extends RefCounted

const ProjectedImage = preload("res://src/projected_image.gd")


static func load_portrait(bridge, icon_id: int) -> Dictionary:
	if bridge == null:
		return {"texture": null, "status": "Appearance unavailable: no project attached."}
	var response: Dictionary = bridge.request("monster-appearance.open", {"iconId": icon_id})
	if not bool(response.get("ok", false)):
		return {"texture": null, "status": str(response.get("error", "Appearance unavailable."))}
	return from_projection(response.get("result", {}), icon_id)


static func from_projection(result: Dictionary, icon_id: int) -> Dictionary:
	var unavailable := {"texture": null, "status": "Icon %d · appearance unavailable" % icon_id}
	if str(result.get("format", "")) != "providence.monster-appearance.v1" or int(result.get("iconId", -32769)) != icon_id:
		unavailable.status = "Appearance response does not match the selected icon."
		return unavailable
	var resource: Variant = result.get("base")
	if not resource is Dictionary or not bool(resource.get("payloadAvailable", false)):
		unavailable.status = "Icon %d · %s" % [icon_id, str(result.get("state", "unavailable"))]
		return unavailable
	var texture := ProjectedImage.decode(resource)
	if texture == null:
		return unavailable
	return {
		"texture": texture,
		"facingTexture": ProjectedImage.decode(result.facing) if result.get("facing") is Dictionary and result.facing.get("payloadAvailable", false) else null,
		"status": "%s · pair %d / %d%s" % ["Stock" if str(resource.get("sourceRole", "")) == "classic-application" else "Scenario", icon_id, icon_id + int(result.get("pairOffset", 308)), "" if bool(result.get("payloadComplete", false)) else " · facing unavailable"],
	}
