extends RefCounted

func run(host) -> void:
	var view = host.view
	var checkbox: CheckBox = view.get_node("%LockNodes")
	assert(checkbox.button_pressed and view.model.nodes_locked, "New flows lock nodes by default")
	assert(view.graph.cards.values().all(func(card): return not card.draggable))
	var id: String = view.root_id()
	var position: Vector2 = view.graph.cards[id].position_offset
	view.graph.cards[id].position_offset += Vector2(30, 20)
	view.graph._save_drag()
	assert(view.graph.cards[id].position_offset == position, "Locked moves cannot persist a layout change")
	assert(not view.model.manual_positions.has(id))
	checkbox.button_pressed = false
	assert(view.graph.cards.values().all(func(card): return card.draggable), "Unlock permits every visible node to move")
	view.graph.cards[id].position_offset += Vector2(30, 20)
	view.graph._save_drag()
	assert(view.model.manual_positions.has(id) and view.model.positions[id] == position + Vector2(30, 20))
	await host.flow._action("refresh")
	await host._settle()
	assert(not checkbox.button_pressed and not view.model.nodes_locked, "Refresh retains the explicit unlock choice")
	assert(view.graph.cards[id].draggable and view.model.positions[id] == position + Vector2(30, 20))
	checkbox.button_pressed = true
	assert(view.graph.cards.values().all(func(card): return not card.draggable), "Relocking protects the adjusted layout")
	var snapshot: Dictionary = view.model.snapshot()
	view.graph.zoom = 0.85
	view.graph.scroll_offset = Vector2(20, 30)
	view.graph.save_positions()
	view.select_node(id)
	assert(view.model.selected == id and view.model.positions == snapshot.positions, "Selection and viewport changes preserve locked positions")
	view.model.manual_positions.erase(id)
	view.model.positions[id] = position
	view.graph._display_positions[id] = position
	view.graph.cards[id].position_offset = position
	view.graph.fit_content()
	await host._capture("locked-nodes")
