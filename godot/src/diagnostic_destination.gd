extends RefCounted

const ROUTES := {
	"action-point":"scripts.action-points", "extra-action-point":"scripts.macros",
	"simple-encounter":"encounters.simple", "complex-encounter":"encounters.complex",
	"rogue-encounter":"encounters.rogue", "timed-encounter":"encounters.timed",
	"battle":"combat.battles", "monster":"combat.monsters", "monster-description":"combat.monsters",
	"treasure":"economy.treasure", "shop":"economy.shops", "item":"economy.items",
	"spell":"rules.spells", "race":"rules.races", "caste":"rules.castes",
	"message":"text.messages", "option-label":"text.messages", "player-map":"player-maps.map-records",
	"picture":"assets.pictures", "sound":"assets.sounds", "icon":"assets.icons",
	"text-resource":"assets.project-assets", "special-land":"assets.special-land",
}

static func describe(reference: Dictionary) -> Dictionary:
	var source := str(reference.get("source", reference.get("entity", "")))
	var field := str(reference.get("field", ""))
	if source.is_empty(): return {}
	var kind := source.get_slice(":", 0)
	if source.begins_with("classic."): kind = source.get_slice(".", 1)
	var route := str(ROUTES.get(kind, ""))
	if not route.is_empty() and not _valid_record_identity(source,kind): return {}
	if source == "land-layout": route = "maps.layout"
	elif source.begins_with("land:"): route = "maps.land"
	elif source.begins_with("dungeon:"): route = "maps.dungeon"
	elif source == "global" or field.begins_with("scenarioApplication.hooks."): route = "scripts.global-macros"
	elif field.begins_with("campaign.restrictions."): route = "scenario.restrictions"
	elif field.begins_with("startLocation.") or field.begins_with("startup."): route = "scenario.startup"
	elif field.begins_with("campaign.contact.") or field in ["campaign.description", "campaign.author", "campaign.version"]: route = "scenario.contact"
	elif field.begins_with("security."): route = "scenario.registration"
	if route.is_empty(): return {}
	var exact := _known_field(kind, field)
	return {"route":route, "kind":kind, "identity":source, "field":field, "editable":true,
		"exact":exact, "reason":"" if exact else "Open the owning record; this finding does not identify an editable field."}

static func _valid_record_identity(source: String, kind: String) -> bool:
	var parts:=source.split("." if source.begins_with("classic.") else ":")
	if parts.size()<2 or not parts[-1].is_valid_int(): return false
	if int(parts[-1])<0 and kind not in ["picture","sound","icon","text-resource"]: return false
	if kind=="action-point":
		return parts.size()==4 and parts[1] in ["land","dungeon"] and parts[2].is_valid_int() and int(parts[2])>=0
	if kind=="monster": return parts.size()==3 and parts[1].is_valid_int() and int(parts[1]) in [-1,0,1]
	return parts.size()==3 if source.begins_with("classic.") else parts.size()==2

static func retained_path(reference: Dictionary) -> String:
	var explicit := str(reference.get("nativePath", ""))
	if not explicit.is_empty(): return explicit
	var source := str(reference.get("source", reference.get("entity", "")))
	return "Data EDCD" if source.begins_with("extra-code:") else ""

static func _known_field(kind: String, field: String) -> bool:
	if field.is_empty(): return false
	if kind in ["action-point","extra-action-point","simple-encounter","complex-encounter"] and _index_field(field,"actions\\[(\\d+)\\]",32 if kind=="complex-encounter" else 8): return true
	if kind in ["land","dungeon"]: return _index_field(field,"^tiles\\[(\\d+)\\]\\[(\\d+)\\]",90,90)
	if kind=="land-layout": return _index_field(field,"^cells\\[(\\d+)\\]\\[(\\d+)\\]$",8,16)
	if kind=="battle": return field in ["distance","messageBefore","messageAfter","battleMacro"] or _index_field(field,"^grid\\[(\\d+)\\]\\.monster$",169)
	if kind in ["message","option-label"]: return field in ["text","message","label"]
	return false

static func _index_field(field: String, pattern: String, first: int, second: int = -1) -> bool:
	var regex:=RegEx.new(); regex.compile(pattern)
	var match:=regex.search(field)
	return match!=null and int(match.get_string(1))<first and (second<0 or int(match.get_string(2))<second)
