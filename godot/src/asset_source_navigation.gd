extends RefCounted


static func open(reference: Dictionary, navigation: RefCounted, maps: RefCounted, player_maps: RefCounted) -> void:
	match str(reference.get("sourceKind", "")):
		"map":
			await navigation.open_map(str(reference.source))
		"player-map":
			await navigation.select_route("player-maps.map-records")
			await player_maps.open_media_source(str(reference.source), str(reference.field))
		_: await navigation.open_script_source(reference)
