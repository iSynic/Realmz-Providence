extends GraphNode

signal disclosure_requested
var row: Dictionary = {}
var accent := Color.WHITE
var warning := false
var related := false
var unknown_steps := 0

func _ready() -> void:
	get_titlebar_hbox().hide()
	%Members.pressed.connect(func(): disclosure_requested.emit())
	focus_entered.connect(queue_redraw)
	focus_exited.connect(queue_redraw)

static func family(value: Dictionary) -> String:
	var kind := str(value.get("kind", "record"))
	var names := {"extra-action-point":"↗  Extra Action Point", "action-point":"⌖  Map Action Point", "quest-flag":"■  Quest state", "quest":"■  Quest state", "message":"≡  String", "picture":"▧  Picture", "sound":"♪  Sound", "cycle-group":"↔  Call cycle", "caller-group":"↗  Loaded callers"}
	if names.has(kind): return names[kind]
	return "◇  " + kind.replace("-", " ").capitalize()

static func accent_index(kind: String) -> int:
	if kind in ["quest", "quest-flag"]: return 2
	if "encounter" in kind or kind in ["item", "spell", "caste", "race"]: return 1
	return 0

func present(value: Dictionary, summary: Dictionary, is_root: bool, member_count := 0, revealed := false) -> void:
	row = value
	unknown_steps = int(summary.get("unknownSteps", 0))
	warning = not value.get("navigable", true) and value.get("resolution", "") in ["missing", "ambiguous"]
	accent = Color(theme.ACCENTS[theme.mode][accent_index(str(value.get("kind", "")))])
	if value.get("kind") == "message": accent = Color("8edbd6") if theme.mode != "light" else Color("126665")
	%Family.text = family(value).to_upper()
	%Family.add_theme_color_override("font_color", accent)
	%Title.text = str(value.get("groupTitle", preload("res://src/discovery_flow_canvas.gd").caption(value)))
	%Badge.text = "! " + str(value.resolution).to_upper() if warning else ("ROOT" if is_root else ("CONTEXT" if value.get("contextual", false) else ""))
	if unknown_steps > 0: %Badge.text += " · !%d" % unknown_steps
	%Badge.add_theme_color_override("font_color", Color(theme.ACCENTS[theme.mode][3]) if warning else accent)
	%Summary.text = str(summary.get("cardText", summary.get("summary", value.get("label", ""))))
	if warning: %Summary.text = "No unique usable target.\nOpen the owning field to repair."
	%Meta.text = "%d used steps · 8 slots" % int(summary.usedSteps) if summary.get("program", false) else str(value.get("selection", {}).get("scope", "scenario")) + " content"
	if unknown_steps > 0: %Meta.text = "%d used · %d unknown · 8 slots" % [int(summary.usedSteps), unknown_steps]
	if warning: %Meta.text = "! source reference retained"
	%Meta.add_theme_color_override("font_color", Color(theme.PALETTES[theme.mode][4]))
	%Members.visible = member_count > 0 or revealed
	%Members.text = "Collapse member" if revealed else "+ %d loaded members →" % member_count
	custom_minimum_size.y = 128 if theme.density == "compact" else 140
	_style()
	queue_redraw()

func _style() -> void:
	var colors: Array = theme.PALETTES[theme.mode]
	var border := Color(theme.ACCENTS[theme.mode][3]) if warning or unknown_steps > 0 else Color(colors[2])
	var normal = theme.make_panel_style(Color(colors[1]), border, 1, 10, 12, 0)
	var chosen = theme.make_panel_style(Color(colors[8]), Color(colors[6]), 2, 10, 12, 0)
	add_theme_stylebox_override("panel", normal)
	add_theme_stylebox_override("panel_selected", chosen)
	add_theme_stylebox_override("titlebar", StyleBoxEmpty.new())
	add_theme_stylebox_override("titlebar_selected", StyleBoxEmpty.new())

func _draw() -> void:
	draw_rect(Rect2(0, 0, 4, size.y), accent)
	if related: draw_rect(Rect2(Vector2(2, 2), size - Vector2(4, 4)), accent, false, 2)
	if warning or unknown_steps > 0:
		var color := Color(theme.ACCENTS[theme.mode][3])
		for x in range(12, int(size.x) - 8, 15): draw_line(Vector2(x, 1), Vector2(x + 6, 7), color, 1)
	if has_focus():
		var color := Color(theme.PALETTES[theme.mode][6])
		for x in range(4, int(size.x) - 4, 7):
			draw_line(Vector2(x, 4), Vector2(x + 3, 4), color)
			draw_line(Vector2(x, size.y - 4), Vector2(x + 3, size.y - 4), color)
		for y in range(4, int(size.y) - 4, 7):
			draw_line(Vector2(4, y), Vector2(4, y + 3), color)
			draw_line(Vector2(size.x - 4, y), Vector2(size.x - 4, y + 3), color)
