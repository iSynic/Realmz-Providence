extends RefCounted


static func permitted(method: String) -> bool:
	return method in ["action-settings.reconcile-repair", "action-settings.compare-repair", "encounter.reconcile-draft",
		"monster.operation.status", "battle.operation.status", "battle.recovery.read", "item.operation.status", "item.recovery.read", "media.operation.status", "media.recovery.read", "world.operation.status", "world.recovery.read"]


static func classify(method: String, response: Dictionary, reconnected: bool, repair_intent_empty: bool) -> Dictionary:
	if not response.get("ok", false): return {}
	if method == "media.recovery.read": return {}
	var outcome := str(response.get("result", {}).get("outcome", "unknown"))
	if method == "encounter.reconcile-draft":
		return {"flag": "encounterRecoveryConfirmed", "clearRepairIntent": false} if outcome in ["matches-draft", "different", "not-applied"] else {}
	if method == "media.operation.status":
		return {"flag": "mediaRecoveryConfirmed", "clearRepairIntent": false} if outcome in ["committed", "not-committed"] else {}
	if method == "world.operation.status":
		return {"flag": "worldRecoveryConfirmed", "clearRepairIntent": false} if outcome in ["committed", "not-committed"] else {}
	if method == "world.recovery.read":
		return {"flag": "worldRecoveryConfirmed", "clearRepairIntent": false} if reconnected else {}
	if method == "monster.operation.status":
		return {"flag": "monsterRecoveryConfirmed", "clearRepairIntent": false} if outcome in ["committed", "not-committed"] else {}
	if method == "battle.operation.status":
		return {"flag": "battleRecoveryConfirmed", "clearRepairIntent": false} if outcome in ["committed", "not-committed"] else {}
	if method == "item.operation.status":
		return {"flag": "itemRecoveryConfirmed", "clearRepairIntent": false} if outcome in ["committed", "not-committed"] else {}
	if method == "item.recovery.read":
		return {"flag": "itemRecoveryConfirmed", "clearRepairIntent": false} if reconnected else {}
	if method == "battle.recovery.read":
		return {"flag": "battleRecoveryConfirmed", "clearRepairIntent": false} if reconnected else {}
	if outcome in ["not-applied", "matches-repair"] or (reconnected and repair_intent_empty):
		return {"flag": "repairRecoveryConfirmed", "clearRepairIntent": true}
	return {}
