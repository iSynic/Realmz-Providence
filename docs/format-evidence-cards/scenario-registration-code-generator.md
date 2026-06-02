# Evidence Card: Scenario Registration Code Generator

## User-Facing Unlock

Providence can help authors inspect and test legacy scenario registration codes without pretending one universal algorithm is proven for every Realmz/Mac/PC path.

The Scenario tool now shows confidence-labeled registration code variants:

- source-ported PC v7.1 custom candidate;
- source-ported Mac classic custom candidate;
- official Fantasoft Mac codes when an imported scenario, registration name, and serial number match a known official vector.
- official Fantasoft Windows codes when the same inputs match a known Windows vector.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\main.c:1503` | Legacy `regscen` includes a third-party scenario branch with segment demixing, `StringToNum`, and bit-flip logic. |
| `F:\Realmz\src\realmz_orig\main.c:1974` | PC v7.1 `regscen_pc_custom` computes a custom scenario registration value from registration name, serial, demixed code segments, and scenario title. |
| `F:\Realmz\src\realmz_orig\variables.h:16` | `MyrBit*Long` macros use high-bit-first 32-bit bit numbering. |
| `F:\Realmz\src\MemoryManager.cpp:271` | Classic `Bit*` operations use high-bit-first byte memory order. |
| `F:\Realmz\src\WindowManager.cpp:1990` | `StringToNum` masks each character with `0x0F`, so nonnumeric text is still numerically meaningful. |
| `F:\Realmz\src\realmz_orig\MyrRealmz.c:303` | `MyrNumToString` converts to a number string and then calls `PtoCstr`, leaving historical C/Pascal string edge cases intact. |

## Official Evidence

An official Fantasoft MacOS registration form supplied by the user provides these extracted fixture values:

- Realmz serial: `9140886`
- Realmz registration code: `5713254`
- Scenario registration name: `RABREAUS`
- Scenario codes:
  - Prelude to Pestilence: `25470888`
  - Assault on Giant Mountain: `58371333`
  - Castle in the Clouds: `26279812`
  - Destroy the Necronomicon: `5013448`
  - White Dragon: `7476219`
  - Grilochs Revenge: `8731175`
  - Trouble in the Sword Lands: `52358362`
  - Mithril Vault: `3247949`
  - Twin Sands of Time: `42454079`
  - War in the Sword Lands: `24767635`
  - Half Truth: `31841033`
  - Wrath of the Mind Lords: `11993502`

A second official Fantasoft Windows registration form supplied by the user uses the same scenario registration name and Realmz serial, but provides different official Windows scenario codes:

- Realmz serial: `9140886`
- Realmz registration code: `5332824`
- Scenario registration name: `RABREAUS`
- Scenario codes:
  - Prelude to Pestilence: `1905660`
  - Assault on Giant Mountain: `1840485`
  - Castle in the Clouds: `1239074`
  - Destroy the Necronomicon: `202458`
  - White Dragon: `204146`
  - Grilochs Revenge: `460806`
  - Trouble in the Sword Lands: `1032019`
  - Mithril Vault: `109146`
  - Twin Sands of Time: `1653401`
  - War in the Sword Lands: `621043`
  - Half Truth: `964355`

Additional official MacOS vectors supplied by the user for Realmz v7.1.2:

- Realmz serial: `9515615`
- Realmz registration code: `5947449`
- Scenario registration name: `JONESC`
- Scenario codes:
  - Prelude to Pestilence: `1398120`
  - Assault on Giant Mountain: `3204672`
  - Castle in the Clouds: `1442844`
  - Destroy the Necronomicon: `276995`
  - White Dragon: `412608`
  - Grilochs Revenge: `481007`

These official vectors are treated as verified UI outputs when the scenario/name/serial match. They do not yet prove that Providence has fully reconstructed the exact original Mac or Windows generator path.

## Providence Policy

- Do not present a single generated code as authoritative unless it matches an official or otherwise verified vector.
- Keep source-ported algorithms visible as candidates for archaeology and compatibility testing.
- Preserve marker/main code segments and `Data CS` exactly; the generator is helper output, not export-critical data.
- Add future official or player-supplied vectors to `REGISTRATION_EVIDENCE_VECTORS` and keep `npm run check:registration-codes` green.
