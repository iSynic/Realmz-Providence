extends VBoxContainer


func clear_results(message: String) -> void:
	for child in %AlgorithmGrid.get_children():
		%AlgorithmGrid.remove_child(child)
		child.queue_free()
	%GeneratorStatus.text = message


func set_results(rows: Array) -> void:
	clear_results("%d distinct results · computed candidates and recorded codes retain separate identities." % rows.size())
	for row in rows:
		var panel := PanelContainer.new()
		panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		panel.custom_minimum_size = Vector2(280, 0)
		panel.theme_type_variation = &"ScenarioPanel"
		var body := HBoxContainer.new()
		var details := VBoxContainer.new()
		details.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var title := Label.new()
		title.text = str(row.label)
		title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		title.theme_type_variation = &"ScenarioHeading"
		var code := Label.new()
		code.text = str(row.code) if row.code != null else str(row.availabilityReason)
		code.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		var status := Label.new()
		status.text = str(row.confidence).replace("-", " ")
		status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		status.tooltip_text = str(row.detail)
		status.theme_type_variation = &"ItemContext"
		var copy := Button.new()
		copy.text = "Copy"
		copy.disabled = row.code == null
		copy.set_meta("algorithmIdentity", str(row.algorithmId))
		copy.pressed.connect(func(): DisplayServer.clipboard_set(str(row.code)))
		%AlgorithmGrid.add_child(panel)
		panel.add_child(body)
		body.add_child(details)
		details.add_child(title)
		details.add_child(code)
		details.add_child(status)
		body.add_child(copy)
