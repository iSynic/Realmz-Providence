# PICT Codec Corpus Report

- Projects scanned: tmp/pict-corpus/Wrath of the Mind Lords.providence/project.json, tmp/pict-corpus/City of Bywater.providence/project.json
- Resources scanned: 141
- Attention needed: 0

## Corpus Scenario Status

### Wrath of the Mind Lords

- Project: tmp/pict-corpus/Wrath of the Mind Lords.providence/project.json
- Scenario PICT rows: 21
- Tileset PICT rows: 8
- Preview-ready rows: 29
- Attention rows: 0
- Status counts: preview-ready 29
- Scenario PICT IDs: 306, 307, 308, 30120, 30121, 30122, 30123, 30124, 30125, 30126, 30127, 30128, 30129, 30130, 30131, 30132, 30133, 30134, 30135, 30136, 32128
- Source snapshot: Scenario.rsrc, 5174545 bytes, sha256 2d674f9244d2aeb19ee1ac4c83c55cb54be122d1b978d38bae206beec9fde595
- Focus PICT 30120: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30121: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30122: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30123: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30124: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30125: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30126: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30127: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30128: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30129: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30130: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30131: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30132: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30133: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30134: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30135: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Focus PICT 30136: preview-ready, 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.

### City of Bywater

- Project: tmp/pict-corpus/City of Bywater.providence/project.json
- Scenario PICT rows: 1
- Tileset PICT rows: 5
- Preview-ready rows: 6
- Attention rows: 0
- Status counts: preview-ready 6
- Scenario PICT IDs: 32128
- Source snapshot: Scenario.rsrc, 113707 bytes, sha256 d1b530968d5c189b05778b7b2abbf7d89b5491a960b872b6e419f6b9b502f8ec
- Focus PICT 32128: preview-ready, 320 x 320; preview-ready

## Codec Policy

- Unsupported rare vector/text QuickDraw drawing remains diagnostic-only unless it blocks known scenario content.
- Preview generation does not rewrite original PICT resources. Imported scenario resource forks are kept in the project source snapshot and export preservation is covered by the Rust round-trip resource tests.
- PICT 30121-style rows are treated as decoder bugs only when the current importer reports malformed or unsupported bitmap data. A preview-ready row means the decoder path is not the current blocker.

## Diagnostic Groups

### preview-ready - divinity-manual - not-applicable (106)

Diagnostic: `manual-preview-present`

- Divinity manual: PICT 2001: pict2001 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2001.png; 425 x 340; manual reference preview present
- Divinity manual: PICT 2002: pict2002 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2002.png; 58 x 58; manual reference preview present
- Divinity manual: PICT 2003: pict2003 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2003.png; 292 x 292; manual reference preview present
- Divinity manual: PICT 2004: pict2004 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2004.png; 16 x 16; manual reference preview present
- Divinity manual: PICT 2005: pict2005 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2005.png; 32 x 32; manual reference preview present
- Divinity manual: PICT 2006: pict2006 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2006.png; 16 x 16; manual reference preview present
- Divinity manual: PICT 2007: pict2007 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2007.png; 32 x 32; manual reference preview present
- Divinity manual: PICT 2008: pict2008 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2008.png; 126 x 93; manual reference preview present
- Divinity manual: PICT 2009: pict2009 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2009.png; 431 x 108; manual reference preview present
- Divinity manual: PICT 2010: pict2010 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2010.png; 130 x 72; manual reference preview present
- Divinity manual: PICT 2011: pict2011 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2011.png; 192 x 47; manual reference preview present
- Divinity manual: PICT 2012: pict2012 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2012.svg; manual reference preview present
- Divinity manual: PICT 2013: pict2013 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2013.png; 431 x 108; manual reference preview present
- Divinity manual: PICT 2014: pict2014 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2014.svg; manual reference preview present
- Divinity manual: PICT 2015: pict2015 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2015.png; 425 x 306; manual reference preview present
- Divinity manual: PICT 2016: pict2016 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2016.png; 361 x 108; manual reference preview present
- Divinity manual: PICT 2017: pict2017 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2017.svg; manual reference preview present
- Divinity manual: PICT 2018: pict2018 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2018.png; 361 x 75; manual reference preview present
- Divinity manual: PICT 2019: pict2019 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2019.png; 16 x 16; manual reference preview present
- Divinity manual: PICT 2020: pict2020 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2020.png; 347 x 243; manual reference preview present
- Divinity manual: PICT 2021: pict2021 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2021.png; 425 x 306; manual reference preview present
- Divinity manual: PICT 2022: pict2022 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2022.png; 124 x 92; manual reference preview present
- Divinity manual: PICT 2023: pict2023 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2023.png; 151 x 201; manual reference preview present
- Divinity manual: PICT 2024: pict2024 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2024.png; 425 x 306; manual reference preview present
- Divinity manual: PICT 2025: pict2025 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2025.png; 64 x 64; manual reference preview present
- Divinity manual: PICT 2026: pict2026 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2026.png; 425 x 306; manual reference preview present
- Divinity manual: PICT 2027: pict2027 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2027.png; 422 x 417; manual reference preview present
- Divinity manual: PICT 2028: pict2028 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2028.png; 475 x 3; manual reference preview present
- Divinity manual: PICT 2029: pict2029 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2029.png; 425 x 305; manual reference preview present
- Divinity manual: PICT 2030: pict2030 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2030.png; 282 x 96; manual reference preview present
- Divinity manual: PICT 2031: pict2031 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2031.png; 293 x 337; manual reference preview present
- Divinity manual: PICT 2032: pict2032 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2032.png; 320 x 22; manual reference preview present
- Divinity manual: PICT 2033: pict2033 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2033.png; 50 x 50; manual reference preview present
- Divinity manual: PICT 2034: pict2034 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2034.png; 386 x 462; manual reference preview present
- Divinity manual: PICT 2035: pict2035 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2035.png; 352 x 52; manual reference preview present
- Divinity manual: PICT 2036: pict2036 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2036.png; 18 x 17; manual reference preview present
- Divinity manual: PICT 2037: pict2037 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2037.png; 50 x 50; manual reference preview present
- Divinity manual: PICT 2038: pict2038 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2038.png; 50 x 50; manual reference preview present
- Divinity manual: PICT 2039: pict2039 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2039.png; 50 x 50; manual reference preview present
- Divinity manual: PICT 2040: pict2040 (public/divinity-manual/assets) - public/divinity-manual/assets/pict2040.png; 425 x 306; manual reference preview present

### preview-ready - realmz-reference-resource - not-applicable (10)

Diagnostic: `preview-ready`

- City of Bywater: PICT 300: Plains (Realmz reference resources) - reference://realmz/pict/300; preview-ready
- City of Bywater: PICT 302: Dungeon Top Down (Realmz reference resources) - reference://realmz/pict/302; preview-ready
- City of Bywater: PICT 303: Subterranean (Realmz reference resources) - reference://realmz/pict/303; preview-ready
- City of Bywater: PICT 304: Castle (Realmz reference resources) - reference://realmz/pict/304; preview-ready
- City of Bywater: PICT 309: Swamp (Realmz reference resources) - reference://realmz/pict/309; preview-ready
- Wrath of the Mind Lords: PICT 300: Plains (Realmz reference resources) - reference://realmz/pict/300; preview-ready
- Wrath of the Mind Lords: PICT 302: Dungeon Top Down (Realmz reference resources) - reference://realmz/pict/302; preview-ready
- Wrath of the Mind Lords: PICT 303: Subterranean (Realmz reference resources) - reference://realmz/pict/303; preview-ready
- Wrath of the Mind Lords: PICT 304: Castle (Realmz reference resources) - reference://realmz/pict/304; preview-ready
- Wrath of the Mind Lords: PICT 309: Swamp (Realmz reference resources) - reference://realmz/pict/309; preview-ready

### preview-ready - scenario-resource-fork - not-applicable (25)

Diagnostic: `preview-ready`

- City of Bywater: PICT 32128: PICT 32128 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_32128.png; 320 x 320; preview-ready
- Wrath of the Mind Lords: PICT 306: Custom 6 (Scenario resource fork) - assets/tile-atlases/landlook-6.png; 640 x 320; preview-ready
- Wrath of the Mind Lords: PICT 306: PICT 306 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_306.png; 640 x 320; preview-ready
- Wrath of the Mind Lords: PICT 307: Custom 7 (Scenario resource fork) - assets/tile-atlases/landlook-7.png; 640 x 320; preview-ready
- Wrath of the Mind Lords: PICT 307: PICT 307 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_307.png; 640 x 320; preview-ready
- Wrath of the Mind Lords: PICT 308: Custom 8 (Scenario resource fork) - assets/tile-atlases/landlook-8.png; 640 x 320; preview-ready
- Wrath of the Mind Lords: PICT 308: PICT 308 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_308.png; 640 x 320; preview-ready
- Wrath of the Mind Lords: PICT 30120: PICT 30120 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30120.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30121: PICT 30121 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30121.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30122: PICT 30122 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30122.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30123: PICT 30123 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30123.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30124: PICT 30124 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30124.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30125: PICT 30125 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30125.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30126: PICT 30126 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30126.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30127: PICT 30127 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30127.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30128: PICT 30128 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30128.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30129: PICT 30129 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30129.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30130: PICT 30130 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30130.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30131: PICT 30131 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30131.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30132: PICT 30132 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30132.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30133: PICT 30133 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30133.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30134: PICT 30134 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30134.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30135: PICT 30135 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30135.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 30136: PICT 30136 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_30136.png; 320 x 320; preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.
- Wrath of the Mind Lords: PICT 32128: PICT 32128 (Scenario resource fork: Scenario.rsrc) - assets/pictures/picture_32128.png; 320 x 320; preview-ready

