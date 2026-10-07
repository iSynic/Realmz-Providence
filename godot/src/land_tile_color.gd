extends RefCounted


static func color(tile: int) -> Color:
	# Providence's display colors distinguish words while real artwork is hidden.
	var base := (tile & ~0x6000)%1000 if tile>0 else tile
	var hue := posmod(base*43+2100,360)/360.0
	var saturation := (34+absi(base)%20)/100.0
	var lightness := (28+absi(base)%26)/100.0
	if base<0: hue=fposmod(hue+.5,1); saturation+=.1; lightness-=.08
	if tile>999: saturation+=.12; lightness+=.1
	if tile>0 and tile&4: hue=.25; saturation=.42; lightness=.45
	if tile>0 and tile&2: hue=285.0/360; saturation=.44; lightness=.48
	saturation=minf(saturation,.8); lightness=clampf(lightness,.12,.7)
	var chroma := (1-absf(2*lightness-1))*saturation
	var phase := hue*6
	var secondary := chroma*(1-absf(fposmod(phase,2)-1))
	var colors := [Color(chroma,secondary,0),Color(secondary,chroma,0),Color(0,chroma,secondary),Color(0,secondary,chroma),Color(secondary,0,chroma),Color(chroma,0,secondary)]
	var result: Color = colors[mini(5,int(phase))]
	var offset := lightness-chroma*.5
	return Color(result.r+offset,result.g+offset,result.b+offset)
