extends PanelContainer


func _ready() -> void:
	theme = theme.duplicate()
	$Content/AdmissionPolicy.select(1)
	$Content/Navigation/Navigate.pressed.connect(func(): $Content/Result.text = "Navigation activated · specimen only")
	$Content/EvidenceDisclosure.toggled.connect(_toggle_evidence)
	theme_changed.connect(_tint_policy_icons, CONNECT_DEFERRED)
	_tint_policy_icons()


func _tint_policy_icons() -> void:
	var list := $Content/AdmissionPolicy as ItemList
	for index in range(list.item_count):
		list.set_item_icon_modulate(index, list.get_theme_color("font_color"))


func _toggle_evidence(expanded: bool) -> void:
	$Content/Evidence.visible = expanded
	$Content/EvidenceDisclosure.text = "▾ Source evidence" if expanded else "▸ Source evidence"
