# Scrolling TEXT Export Fixture

`authored_scrolling_text_exports_same_id_text_and_style_resources` verifies
Providence's writer contract for paired scrolling-text resources.

The original failure did not mean `TEXT -200` was missing from exporter output.
New projects seed a valid resource fork as `Scenario.rsrc`, but the old test
parsed `Scenario`, the 600-byte scenario data file. The writer reported both
authored resources correctly while the assertion inspected the wrong file.

The fixture now resolves the exported resource fork through project source
metadata and checks portable, Mac Classic, and Windows Realmz targets. Every
target must contain:

- `TEXT -200` with the authored text payload;
- `styl -200` with the authored style payload;
- the same resource ID for both entries;
- a written-resource report for both entries.

The runtime-suspect warning remains required. It records uncertainty in current
Realmz runtime behavior and does not weaken the proven Providence writer
contract.
