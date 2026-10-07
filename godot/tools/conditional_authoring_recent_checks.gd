extends RefCounted

const PercentBranchChecks = preload("res://tools/conditional_authoring_percent_branch_checks.gd")
const QuestValueChecks = preload("res://tools/conditional_authoring_quest_value_checks.gd")
const StaminaChangeChecks = preload("res://tools/conditional_authoring_stamina_change_checks.gd")
const ItemMutationChecks = preload("res://tools/conditional_authoring_item_mutation_checks.gd")
const SpellPointBranchChecks = preload("res://tools/conditional_authoring_spell_point_branch_checks.gd")
const PartyStateChecks = preload("res://tools/conditional_authoring_party_state_checks.gd")
const MapCoordinateChecks = preload("res://tools/conditional_authoring_map_coordinate_checks.gd")
const ConditionDurationChecks = preload("res://tools/conditional_authoring_condition_duration_checks.gd")
const CompanionGeometryChecks = preload("res://tools/conditional_authoring_companion_geometry_checks.gd")
const DirectQuantityChecks = preload("res://tools/conditional_authoring_direct_quantity_checks.gd")


static func run(host: SceneTree, slot: int, xap_identity: String) -> void:
	await StaminaChangeChecks.run(host, slot, xap_identity)
	await QuestValueChecks.run(host, slot, xap_identity)
	await PercentBranchChecks.run(host, slot, xap_identity)
	await ItemMutationChecks.run(host, slot, xap_identity)
	await SpellPointBranchChecks.run(host, slot, xap_identity)
	await PartyStateChecks.run(host, slot, xap_identity)
	await MapCoordinateChecks.run(host, slot, xap_identity)
	await ConditionDurationChecks.run(host, slot, xap_identity)
	await CompanionGeometryChecks.run(host, slot, xap_identity)
	await DirectQuantityChecks.run(host, slot, xap_identity)
