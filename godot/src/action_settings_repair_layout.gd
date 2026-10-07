extends RefCounted

const Content = preload("res://src/action_settings_repair_content.tscn")
const CONTROL_NAMES := {
	"background": "Background",
	"heading": "Heading",
	"source": "Source",
	"notice": "Notice",
	"notice_title": "NoticeTitle",
	"notice_body": "NoticeBody",
	"body": "Body",
	"target_heading": "TargetHeading",
	"mapKind_label": "MapKindLabel",
	"mapKind": "MapKind",
	"map_label": "MapLabel",
	"map": "Map",
	"area_label": "AreaLabel",
	"area": "Area",
	"chanceAdjustment_label": "ChanceAdjustmentLabel",
	"chanceAdjustment": "ChanceAdjustment",
	"chance_help": "ChanceHelp",
	"shapeMode_label": "ShapeModeLabel",
	"shapeMode": "ShapeMode",
	"shape_help": "ShapeHelp",
	"mode_warning": "ModeWarning",
	"bounds": "Bounds",
	"bound0_label": "Bound0Label",
	"bound0": "Bound0",
	"bound1_label": "Bound1Label",
	"bound1": "Bound1",
	"bound2_label": "Bound2Label",
	"bound2": "Bound2",
	"bound3_label": "Bound3Label",
	"bound3": "Bound3",
	"bounds_help": "BoundsHelp",
	"errors": "Errors",
	"summary": "Summary",
	"summary_heading": "SummaryHeading",
	"outcome": "Outcome",
	"scope": "Scope",
	"only": "Only",
	"shared": "Shared",
	"affects_heading": "AffectsHeading",
	"uses": "Uses",
	"all_uses": "AllUses",
	"scope_help": "ScopeHelp",
	"summary_spacer": "SummarySpacer",
	"after_heading": "AfterHeading",
	"after_help": "AfterHelp",
	"recovery": "Recovery",
	"recovery_title": "RecoveryTitle",
	"recovery_body": "RecoveryBody",
	"recovery_buttons": "RecoveryButtons",
	"footer": "Footer",
	"status": "Status",
	"copy": "Copy",
	"compare": "Compare",
	"cancel": "Cancel",
	"apply": "Apply",
}
const INPUT_FIELDS := ["mapKind","map","area","chanceAdjustment","shapeMode","bound0","bound1","bound2","bound3"]

var ui: Dictionary = {}
var fields: Array[Control] = []


func build(window: Window) -> Dictionary:
	var content := Content.instantiate()
	window.add_child(content)
	for key in CONTROL_NAMES:
		ui[key] = content.get_node("%" + CONTROL_NAMES[key])
	for key in INPUT_FIELDS:
		fields.append(ui[key])
	return ui


func summary_variant(shared: bool) -> void:
	var order := ["summary_heading", "scope", "outcome", "affects_heading", "uses", "all_uses", "summary_spacer", "scope_help", "after_heading", "after_help"] if shared else ["summary_heading", "outcome", "scope", "affects_heading", "uses", "all_uses", "scope_help", "summary_spacer", "after_heading", "after_help"]
	for index in order.size(): ui.summary.move_child(ui[order[index]], index)
	ui.summary_heading.text = "Repair scope" if shared else "This repair"
	ui.summary.add_theme_constant_override("separation", 12 if shared else 14)
	ui.scope.add_theme_constant_override("separation", 12)
	for key in ["only", "shared"]:
		ui[key].custom_minimum_size.y = 42
		ui[key].alignment = HORIZONTAL_ALIGNMENT_LEFT
		ui[key].add_theme_font_size_override("font_size", 12)
	ui.outcome.custom_minimum_size.y = 40 if shared else 0
	ui.outcome.add_theme_constant_override("line_spacing", 0 if shared else 3)
	ui.affects_heading.custom_minimum_size.y = 16 if shared else 0
	ui.affects_heading.add_theme_font_size_override("font_size", 12 if shared else 13)
	ui.uses.custom_minimum_size.y = 48 if shared else 0
	ui.uses.add_theme_font_size_override("font_size", 12 if shared else 13)
	ui.uses.add_theme_constant_override("line_spacing", -1 if shared else 3)
	ui.scope_help.custom_minimum_size.y = 20 if shared else 0
	ui.after_heading.visible = not shared
	ui.after_help.visible = not shared


func apply_theme(window: Window, mode: String, density: String) -> void:
	var controls = preload("res://src/issues_theme.gd").new()
	controls.mode = mode
	controls.density = density
	for type in ["Button", "LineEdit", "OptionButton"]: controls.set_font_size("font_size", type, 13)
	window.theme = controls
	var colors: Array = controls.PALETTES[mode].map(func(hex: String): return Color(hex))
	ui.background.add_theme_stylebox_override("panel", controls.make_panel_style(colors[0], colors[2], 1, 0, 0, 0))
	var notice_box: StyleBoxFlat = controls.make_panel_style(colors[1], controls.get_color("gold", "Issues"), 0, 10, 12, 0)
	notice_box.border_width_left = 2
	ui.notice.add_theme_stylebox_override("panel", notice_box)
	ui.notice_title.add_theme_color_override("font_color", controls.get_color("gold", "Issues"))
	ui.errors.add_theme_color_override("font_color", colors[7])
	ui.apply.theme_type_variation = "IssuesPrimary"
	for button_key in ["cancel", "apply"]: ui[button_key].add_theme_font_size_override("font_size", 12)
	var footer_box: StyleBoxFlat = controls.make_panel_style(Color.TRANSPARENT, colors[2], 0, 0, 0, 0)
	footer_box.border_width_top = 1
	footer_box.content_margin_top = 11
	footer_box.content_margin_bottom = 1
	ui.footer.add_theme_stylebox_override("panel", footer_box)
	for control in fields:
		control.custom_minimum_size.y = 28 if density == "compact" else 34
		control.get_parent().custom_minimum_size.y = 54 if density == "compact" else 60
