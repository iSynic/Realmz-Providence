# Timed Encounter Reserved Fields

This report scans `Data TD3` timed encounter records for nonzero values in `stuff[1..9]`, the nine currently reserved compatibility slots after the known location-kind field.

Scan scope: benchmark-projects
Project sources: 2
Raw scenario sources: 0
Timed encounter records scanned: 16
Records with nonzero reserved slots: 16

## Summary

Reserved slot usage is present in 2 source(s). Treat these slots as compatibility fields until follow-up archaeology names their runtime meaning.

Developer note:

stuff[1..9] are preserved compatibility fields. The current corpus shows repeated nonzero patterns, but Realmz runtime evidence only names stuff[0] as the location-kind field. Do not promote these slots into authoring UI until source, Divinity fixture, or runtime behavior gives a slot a confirmed meaning.

## Slot Usage

| Slot | Records | Scenarios | Values |
| ---: | ---: | ---: | --- |
| 1 | 16 | 2 | 11005, 15927 |
| 2 | 16 | 2 | 9994, 13874 |
| 3 | 16 | 2 | 11308, 14391 |
| 4 | 16 | 2 | 10800, 13365 |
| 5 | 16 | 2 | 12079, 14905 |
| 6 | 16 | 2 | 11568, 13364 |
| 7 | 16 | 2 | 11046, 12850 |
| 8 | 16 | 2 | 9980, 13357 |
| 9 | 16 | 2 | 10001, 10279 |

## Co-Occurrence

- active/nonzero day: 16
- has Extra AP target: 16
- plausible runnable schedule: 16
- inactive/template-like: 0
- with Extra AP target: 16
- with item gate: 0
- with quest gate: 16
- with location gate: 2
- with random rectangle gate: 0
- with coordinate gate: 0

## Common Patterns

- `11005,9994,11308,10800,12079,11568,11046,9980,10001`: 14 record(s), 2 scenario(s)
- `15927,13874,14391,13365,14905,13364,12850,13357,10279`: 2 record(s), 2 scenario(s)

## Findings

### Wrath Assets

Source: project (F:\Realmz - Providence\tmp\desktop-ui-harness\wrath-assets-release-011\WrathAssets.providence\project.json)

| Record | Extra AP | Schedule | Gates | Nonzero reserved slots | Reserved pattern |
| ---: | ---: | --- | --- | --- | --- |
| 0 | 84 | day 1, inc 10, 0% | quest | stuff[1]=15927, stuff[2]=13874, stuff[3]=14391, stuff[4]=13365, stuff[5]=14905, stuff[6]=13364, stuff[7]=12850, stuff[8]=13357, stuff[9]=10279 | `15927,13874,14391,13365,14905,13364,12850,13357,10279` |
| 1 | 52 | day 1, inc 7, 0% | quest, location | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 2 | 71 | day 1, inc 2, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 3 | 89 | day 1, inc 8, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 4 | 214 | day 1, inc 2, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 5 | 527 | day 1, inc 75, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 6 | 1636 | day 1, inc 0, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 7 | 1636 | day 1, inc 0, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |

### Wrath Assets Harness

Source: project (F:\Realmz - Providence\tmp\desktop-ui-harness\wrath-assets\WrathAssets.providence\project.json)

| Record | Extra AP | Schedule | Gates | Nonzero reserved slots | Reserved pattern |
| ---: | ---: | --- | --- | --- | --- |
| 0 | 84 | day 1, inc 10, 0% | quest | stuff[1]=15927, stuff[2]=13874, stuff[3]=14391, stuff[4]=13365, stuff[5]=14905, stuff[6]=13364, stuff[7]=12850, stuff[8]=13357, stuff[9]=10279 | `15927,13874,14391,13365,14905,13364,12850,13357,10279` |
| 1 | 52 | day 1, inc 7, 0% | quest, location | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 2 | 71 | day 1, inc 2, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 3 | 89 | day 1, inc 8, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 4 | 214 | day 1, inc 2, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 5 | 527 | day 1, inc 75, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 6 | 1636 | day 1, inc 0, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |
| 7 | 1636 | day 1, inc 0, 0% | quest | stuff[1]=11005, stuff[2]=9994, stuff[3]=11308, stuff[4]=10800, stuff[5]=12079, stuff[6]=11568, stuff[7]=11046, stuff[8]=9980, stuff[9]=10001 | `11005,9994,11308,10800,12079,11568,11046,9980,10001` |

