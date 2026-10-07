extends SceneTree

func _initialize() -> void:
	print(JSON.stringify({
		"version": Engine.get_version_info(),
		"license": Engine.get_license_text(),
		"thirdPartyLicenses": Engine.get_license_info(),
		"copyright": Engine.get_copyright_info(),
	}))
	quit()
