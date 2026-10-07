extends RefCounted

const Content = preload("res://src/land_tile_dock_content.tscn")


static func build(dock: PanelContainer) -> Dictionary:
	var content := Content.instantiate()
	dock.add_child(content)
	return {
		"content":content,
		"terrain_palette":content.get_node("Body/PaletteSelector/Terrain"),
		"special_palette":content.get_node("Body/SpecialPalette"),
		"special_selector":content.get_node("Body/PaletteSelector/Special"),
		"expand": content.get_node("Body/Header/Expand"),
		"source": content.get_node("Body/Source/SourceName"),
		"scope": content.get_node("Body/Source/Scope"),
		"search": content.get_node("Body/Search"),
		"category": content.get_node("Body/Filter/Category"),
		"count": content.get_node("Body/Filter/Count"),
		"atlas_scroll": content.get_node("Body/AtlasScroll"),
		"atlas": content.get_node("Body/AtlasScroll/Atlas"),
		"results": content.get_node("Body/Results"),
		"empty": content.get_node("Body/Empty"),
		"open_assets": content.get_node("Body/OpenAssets"),
		"clear_search": content.get_node("Body/ClearSearch"),
		"previous": content.get_node("Body/Navigation/Previous"),
		"columns": content.get_node("Body/Navigation/Columns"),
		"next": content.get_node("Body/Navigation/Next"),
		"preview": content.get_node("Body/Brush/Preview"),
		"brush_name": content.get_node("Body/Brush/Details/BrushName"),
		"brush_source": content.get_node("Body/Brush/Details/BrushSource"),
		"brush_size": content.get_node("Body/Brush/Details/BrushSize"),
		"recents": content.get_node("Body/Recent/Recents"),
		"save_brush": content.get_node("Body/SaveCommands/SaveBrush"),
		"favorite": content.get_node("Body/SaveCommands/FavoriteTile"),
		"behavior": content.get_node("Body/TileBehavior"),
		"customization": content.get_node("Body/CustomLandlooks"),
		"special": content.get_node("Body/SpecialArtwork"),
		"tabs": {
			"Atlas": content.get_node("Body/Tabs/Atlas"),
			"Browse": content.get_node("Body/Tabs/Browse"),
			"Stamps": content.get_node("Body/Tabs/Stamps"),
			"Saved": content.get_node("Body/Tabs/Saved"),
		},
	}
