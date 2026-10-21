extends RefCounted

var _viewports: Dictionary = {}


func freeze(tree: SceneTree) -> void:
	_capture(tree.root)
	if not tree.node_added.is_connected(_node_added): tree.node_added.connect(_node_added)


func _capture(node: Node) -> void:
	if node is Viewport and not _viewports.has(node):
		_viewports[node] = node.gui_disable_input
		node.gui_disable_input = true
	for child in node.get_children(): _capture(child)


func _node_added(node: Node) -> void:
	if node is Viewport: _capture(node)


func release(tree: SceneTree) -> void:
	if tree.node_added.is_connected(_node_added): tree.node_added.disconnect(_node_added)
	for viewport in _viewports:
		if is_instance_valid(viewport): viewport.gui_disable_input = _viewports[viewport]
	_viewports.clear()
