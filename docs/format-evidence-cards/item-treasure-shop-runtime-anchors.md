# Runtime Note: Items, Treasure, And Shops

## User-Facing Unlock

This note gives Providence enough source-backed evidence to improve Treasure, Shop, and scenario item awareness without overclaiming every item-definition editing workflow. The immediate editor unlock is:

- item pickers with weapon/armor/accessory/magic/supply grouping;
- scenario `Data NI` import as the 800-999 supply/special item table;
- Treasure records with 20 item slots plus random/fixed experience, gold, gems, and jewelry rewards;
- Shop records with item stock, quantities, and inflation;
- clear source-vs-runtime labeling for shops, because Realmz copies `Data SD` to runtime `CS` and mutates the runtime copy.

## Runtime Model

Realmz splits this area into three data roles:

- **Item definitions** are loaded into five 200-record arrays: weapons, armor, accessories/helms, magic, and supplies/special items.
- **Shared item definitions** for IDs 0-799 come from `:Data Files:Data ID`.
- **Scenario supply/special item definitions** for IDs 800-999 come from the active scenario's `Data NI`.
- **Treasure source records** live in scenario `Data TD` and are loaded directly when a treasure action fires.
- **Shop source records** live in scenario `Data SD`, but first-start copies them into runtime `CS`. Active shop changes mutate `CS`, not the scenario source file.

Providence should therefore prioritize Treasure and Shop editors plus a strong item picker/library. Scenario `Data NI` can now be imported and preserved as the local supply/special item table; full item editing should start with the Divinity-supported 900-999 custom item range.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\structs.h:221` | Defines `struct treasure`: 20 item IDs plus exp, gold, gems, jewelry. |
| `F:\Realmz\src\realmz_orig\structs.h:330` | Defines `struct itemattr`, the 100-byte item definition profile used by item lookup and display. |
| `F:\Realmz\src\realmz_orig\structs.h:338` | Defines `struct shop`: 1000 item IDs, 1000 quantity bytes, and inflation. |
| `F:\Realmz\src\realmz_orig\convert.h:89` | `CvtTreasureToPc` converts all treasure shorts. |
| `F:\Realmz\src\realmz_orig\convert.c:151` | `CvtItemAttrToPc` lists endian-owned item attribute fields. |
| `F:\Realmz\src\realmz_orig\convert.c:282` | `CvtShopToPc` converts shop item IDs and inflation; quantity bytes are not endian-converted. |
| `F:\Realmz\src\realmz_orig\main.c:952` | Startup reads shared `:Data Files:Data ID` into weapons, armor, helms, and magic arrays. |
| `F:\Realmz\src\realmz_orig\main.c:962` | Startup reads `City of Bywater:Data NI` into the supplies array. |
| `F:\Realmz\src\realmz_orig\misc.c:2036` | Scenario menu update calls `getfilename("Data NI")` and reads the active scenario's `Data NI` into `allsupply`. |
| `F:\Realmz\src\realmz_orig\loaditem.c:5` | `loaditem` resolves IDs by 200-record families and uses `abs(id)`. |
| `F:\Realmz\src\realmz_orig\setupnewgame.c:128` | First-start copies scenario `Data SD` into runtime `:Data Files:CS`. |
| `F:\Realmz\src\realmz_orig\loadsavedgame.c:846` | `loadshop` reads current shop state from runtime `CS`, not scenario `Data SD`. |
| `F:\Realmz\src\realmz_orig\loadsavedgame.c:867` | `saveshop` writes shop mutations back to runtime/saved `CS`. |
| `F:\Realmz\src\realmz_orig\newland.c:1696` | Opcode `6` loads a shop by absolute ID and can immediately open it when the ID is negative. |
| `F:\Realmz\src\realmz_orig\newland.c:1823` | Opcode `10` loads `Data TD` and gives treasure. |
| `F:\Realmz\src\realmz_orig\newland.c:2934` | Opcode `73` loads a restricted shop, using EDCD ranges for accepted items. |
| `F:\Realmz\src\realmz_orig\newland.c:3174` | Opcode `51` alters runtime shop inflation and quantities, then saves the runtime shop. |
| `F:\Realmz\src\realmz_orig\newland.c:3548` | Opcode `65` builds an in-memory random-item treasure reward from an item ID range. |

## Item ID Families

`loaditem` normalizes item IDs with `abs(id)` and chooses a family by `id / 200 * 200`:

| ID Range | Runtime Array | Source |
| --- | --- | --- |
| 0-199 | `allweapons` | `:Data Files:Data ID` group 1 |
| 200-399 | `allarmor` | `:Data Files:Data ID` group 2 |
| 400-599 | `allhelms` | `:Data Files:Data ID` group 3 |
| 600-799 | `allmagic` | `:Data Files:Data ID` group 4 |
| 800-999 | `allsupply` | active scenario `Data NI` |

Local output evidence agrees with this split: `Data ID` is 80,000 bytes, which is 800 itemattr records at 100 bytes each, and scenario `Data NI` files are 20,000 bytes, which is 200 supply/special records.

The Divinity guide narrows the authoring promise further: the Item Editor can edit custom/special scenario items in IDs 900-999, while permanent built-in items are browse/copy/reference data.

## Treasure Byte Layout

`Data TD` records are 48 bytes. All fields are big-endian shorts.

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 40 | `itemid[20]` | Twenty item references. Positive values are listed as reward items. |
| 40 | 2 | `exp` | Experience reward. Negative values are randomized with `Rand(abs(exp))`. |
| 42 | 2 | `gold` | Gold reward. Negative values randomize. |
| 44 | 2 | `gems` | Gem reward. Negative values randomize. |
| 46 | 2 | `jewelry` | Jewelry reward. Negative values randomize. |

Treasure action opcode `10` reads `Data TD` by ID and passes the record to `booty(1)`. Opcode `65` does not read a `Data TD` record; it builds a temporary treasure with random items from an EDCD item range.

## Shop Byte Layout

`Data SD` shop records are 3,002 bytes:

| Offset | Size | Field | Notes |
| ---: | ---: | --- | --- |
| 0 | 2000 | `id[1000]` | Big-endian item IDs. |
| 2000 | 1000 | `num[1000]` | Quantity bytes. |
| 3000 | 2 | `inflation` | Big-endian short. Used by shop pricing logic. |

The authored source file is scenario `Data SD`. Runtime shop state is copied into `CS` at first start, then shop purchases/sales and opcode `51` mutate `CS`. Providence should show this distinction clearly: editing source shop records affects new runs/exported scenarios, not an already-running save's current shop stock.

## Corpus Evidence

`Data TD`, `Data SD`, `Data ID`, and `Data NI` evidence confirms fixed sizes:

| File | Local Evidence |
| --- | --- |
| `Data TD` | Appears in all 44 analyzed scenarios; Price of Power has 11,424 bytes = 238 records. |
| `Data SD` | Appears in all 44 analyzed scenarios; large scenarios have 117,078 bytes = 39 records. |
| `Data ID` | Shared output file is 80,000 bytes = 800 itemattr records. |
| `Data NI` | Scenario item table: 20,000 bytes = 200 supply/special itemattr records. |

## Providence Editor Implications

- Add `Data NI` to imported scenario tracking so scenario special items are visible even without a library refresh.
- Item pickers should show family, ID, name/resource evidence, icon, type, cost, charge, curse/fake-item status, restrictions, and whether the item comes from the scenario or Realmz library when available.
- Treasure editors should expose 20 item slots and reward fields, with negative reward fields labeled as random ranges.
- Shop editors should expose stock as item rows with quantity and inflation, not 1000 raw IDs by default.
- Script/AP opcode target drawers should link:
  - opcode `10` to Treasure records;
  - opcode `6` and `73` to Shop records;
  - opcode `51` to runtime shop mutation semantics;
  - opcode `65` to random item range semantics.
- Runtime `CS` should be shown as generated/current-state evidence, not the source editor file when `Data SD` is present.

## Validation Rules

- `Data TD` length must be divisible by 48.
- `Data SD` length must be divisible by 3,002.
- Treasure item slots should resolve through the item library when nonzero.
- Negative treasure reward fields should be described as randomized rewards.
- Shop item IDs should resolve through the item library when quantity is nonzero.
- Shop quantities should be treated as unsigned/byte stock counts in UI, even though C stores them as `char`.
- Shop inflation should have a warning range until Divinity labels/limits are proven.
- Opcode `51` should warn that it mutates runtime shop state, not scenario source records during play.

## Divinity Evidence Still Needed

- Exact Divinity write behavior for item names/descriptions and icon resources in the 900-999 custom range.
- Item names/resources and field labels for every `itemattr` field.
- Treasure editor labels for fixed vs random reward values.
- Shop editor UI grouping, defaults, quantity limits, and inflation labels.
- Restricted shop UI labels for opcode `73` EDCD accepted item ranges.

## Providence Follow-Up

- Follow-up: `parser-writer`, `editor-ui`, `validation`.
- Build item library plus scenario `Data NI` picker support first.
- Deepen Treasure and Shop editors after item picker summaries exist.
- Add item definition editing first for the Divinity-supported custom range 900-999; keep built-in item families read-only unless global Realmz library editing is deliberately added.
