extends RefCounted

# Tree exposes scroll position but no setter; its native scrollbars own restoration.
static func restore(tree: Tree, position: Vector2) -> void:
	for child in tree.get_children(true):
		if child is VScrollBar: child.value = position.y
		elif child is HScrollBar: child.value = position.x
