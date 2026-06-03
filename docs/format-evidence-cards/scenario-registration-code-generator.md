# Evidence Card: Scenario Registration Code Generator

## User-Facing Unlock

Providence can help authors inspect and test legacy scenario registration codes without pretending one universal algorithm is proven for every Realmz/Mac/PC path.

The user-facing generator is visible again, but it deliberately shows evidence-labeled variants instead of pretending one universal formula is proven. The underlying module now separates these paths:

- source-ported Windows bundled-scenario formula from `regscen_pc`;
- source-ported Mac bundled-scenario formula for the classic pre-later-slot branch in `regscen`;
- source-ported Divinity Coder / custom-scenario candidate from `regscen_pc_custom`;
- source-ported Mac classic custom-scenario candidate from the third-party scenario branch in `regscen`;
- official Fantasoft Mac/Windows evidence vectors when scenario/name/serial match a known form.

Bundled official Fantasoft scenario codes and custom Divinity scenario codes are not the same algorithm family. Treating them as interchangeable was the main source of false confidence.

## Realmz Source Anchors

| Source | Evidence |
| --- | --- |
| `F:\Realmz\src\realmz_orig\main.c:1503` | Legacy `regscen` includes a third-party scenario branch with segment demixing, `StringToNum`, and bit-flip logic. |
| `F:\Realmz\src\realmz_orig\main.c:1833` | Windows `regscen_pc` handles bundled Fantasoft scenarios using registration name, serial, scenario menu slot, and the shell `reclevel`/`maxlevel` fields. |
| `F:\Realmz\src\realmz_orig\main.c:1974` | PC v7.1 `regscen_pc_custom` computes the Divinity Coder / custom scenario registration value from registration name, serial, demixed code segments, and scenario title. |
| `F:\Realmz\src\realmz_orig\main.c:1512` | Mac bundled scenarios compute a scenario serial component only for Destroy the Necronomicon and later slots. |
| `F:\Realmz\src\realmz_orig\main.c:1686` | Mac bundled scenarios switch to an extra name/serial bit-flip branch for White Dragon-era and later slots. |
| `F:\Realmz\src\realmz_orig\main.c:2058` | PC custom scenario code-segment contributions are cast through `short` before being added/subtracted from the 32-bit registration code. |
| `F:\Realmz\src\realmz_orig\variables.h:16` | `MyrBit*Long` macros use high-bit-first 32-bit bit numbering. |
| `F:\Realmz\src\MemoryManager.cpp:271` | Classic `Bit*` operations use high-bit-first byte memory order. |
| `F:\Realmz\src\WindowManager.cpp:1990` | `StringToNum` masks each character with `0x0F`, so nonnumeric text is still numerically meaningful. |
| `F:\Realmz\src\realmz_orig\MyrRealmz.c:303` | `MyrNumToString` converts to a number string and then calls `PtoCstr`, leaving historical C/Pascal string edge cases intact. |

## Source-Matched Status

`npm run check:registration-codes` now requires:

- exact Windows bundled formula matches for 10 official Windows vectors using same-named scenario shell files from `F:\Realmz\base\Realmz\Scenarios`;
- exact Mac bundled formula matches for 8 official Mac vectors in the pre-later-slot branch;
- source-faithful custom PC behavior for the `short`-truncated code-segment products;
- segment demix/remix and `StringToNum` helper coverage.

Known unresolved items:

- `War in the Sword Lands` Windows official vector is off by 9 from the source formula against the local shell file, likely due to a shell/version/menu fixture mismatch or transcription issue. It remains evidence, not discarded.
- Mac official vectors for White Dragon-era and later slots enter the extra bit-switch branch. The source port is present as a candidate, but those vectors are not yet source-matched. The likely missing detail is a classic-runtime behavior around `abs`, bit operations, serial display/internal serial, or old compiler integer promotion.
- The custom scenario path formerly labeled `PC v7.1 custom` is now known to be the Divinity Coder path for custom scenarios. `Divinity Coder 7.0.9.rsrc` contains the same constants used by `regscen_pc_custom` (`333`, `450`, `96`, `456`, `999`, `1689`, `423`, and `112233`), and user testing on Mac confirmed that the Divinity-generated custom code is accepted by the runtime for a Divinity-authored scenario.
- The Mac classic custom algorithm remains a source-ported candidate until a distinct acceptance vector proves when that branch is used.

## War and Divinity Investigation Notes

`War in the Sword Lands` is an official Fantasoft scenario, not a Divinity/custom scenario. The local shell fields are stable across the checked copies under `F:\Realmz\base`, `F:\Realmz\out_win_clang`, and packaged build outputs:

- shell length: `316` bytes
- `reclevel`: `72`
- `maxlevel`: `84`
- source formula result for `RABREAUS` / `9140886` / slot `20`: `621034`
- official Windows form result: `621043`

A second user-supplied vector for `AMBERK` / `13706024` produces `933071`, exactly matching the same Windows bundled formula for slot `20` and the local War shell fields. That makes the bundled formula look generally right for War, while the `RABREAUS` +9 mismatch should stay visible as unresolved source archaeology. The source also has a suspicious boundary split: `topfantasoftsceanrio` is `23`, but `regscen_pc` redirects `currentscenario > 19` into `regscen_pc_custom`. War is slot `20`, exactly on that boundary. Existing registration acceptance logs still identify it as Adventure menu position `20`, so the mismatch is not currently explained by a simple slot-number error.

For full Divinity editor archaeology, the best local binary target is `F:\Realmz - Providence\public\bundled-libraries\divinity\Divinity.rsrc`. It is an AppleDouble-wrapped Classic Mac application resource fork with:

- `CODE 1` (`Mac Libraries`, `194,318` bytes)
- `CODE 2` (`ANSI Libraries`, `26,295` bytes)
- `DATA 0` (`28,568` bytes)

The app contains symbols/strings such as `getcode`, `getscenario`, `editscenariodata`, `editextracode`, `switchscenario`, and `Data CS`. Capstone can disassemble the 68k CODE resources, but a blind sweep lands in mixed code/string/jump-table territory. The next useful step is a resource-aware disassembly pass that follows the CODE segment jump table and cross-references the `Data CS` and security strings back to owning functions.

For Divinity Coder specifically, `F:\Divinity CD\Divinity CD\Install Options\World of Realmz\Divinity\Divinity Coder 7.0.9.rsrc` is the better target. It is an AppleDouble-wrapped Classic Mac resource fork with:

- `CODE 1` (`Application`, `8,042` bytes)
- `CODE 2` (`Mac Libraries`, `852` bytes)
- `CODE 3` (`ANSI Libraries`, `25,731` bytes)
- `DATA 0` (`2,521` bytes)

Capstone disassembly of `CODE 1` around offsets `0x0eb4..0x12d2` shows the custom scenario generator path: lowercase registration name, serial/name value calculation, serial division by `333`, modulo math using `450`, `96`, `456`, and `999`, code-segment loops using `1689` and `423`, and scenario-title contribution using `112233`. This matches Providence's `pcCustomV71` implementation and explains why Divinity Coder's output follows that formula even when tested on Mac.

A user-supplied Divinity Coder 7.0.9 screenshot and Mac runtime acceptance test confirms the same formula for:

- Realmz serial: `9140886`
- Scenario registration name: `SAMUEL`
- Scenario: `Wrath of the Mind Lords`
- Code segments: `p38beta` / `p38delta`
- Divinity Coder result: `268585916`

No Classic Mac Realmz runtime application with CODE resources was found locally. That means Divinity can help explain how the editor writes security data, but it cannot by itself prove the Realmz runtime acceptance algorithm for later Mac bundled scenarios.

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

Additional user-supplied War in the Sword Lands vector:

- Realmz serial: `13706024`
- Realmz registration code: `7995820`
- Verification code: `410`
- Scenario registration name: `AMBERK`
- War in the Sword Lands: `933071`

These official vectors are treated as verified evidence when the scenario/name/serial match. They do not by themselves prove that Providence has fully reconstructed every original Mac or Windows generator path.

## Providence Policy

- Do not present a single generated code as authoritative unless it matches an official or otherwise verified vector.
- Label the `regscen_pc_custom` formula as the Divinity Coder / custom path, not merely as a Windows-only path.
- Keep source-ported algorithms visible as candidates for archaeology and compatibility testing.
- Preserve marker/main code segments and `Data CS` exactly; the generator is helper output, not export-critical data.
- Add future official or player-supplied vectors to `REGISTRATION_EVIDENCE_VECTORS` and keep `npm run check:registration-codes` green.
