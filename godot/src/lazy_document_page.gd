class_name ProvidenceLazyDocumentPage
extends Control
## Holds a workbench page's tab slot, name and route until the page is first needed.
## The scene is a path string, not a scene dependency, so it loads only on realization.

@export_file("*.tscn") var page_scene := ""


func instantiate_page() -> Control:
	return (load(page_scene) as PackedScene).instantiate() as Control
