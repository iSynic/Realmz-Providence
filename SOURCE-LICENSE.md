# Source and resource licensing

## Original source

The original Rust crates, Godot scripts and scenes, build tools, tests and
documentation in this native editor are GPL-3.0-or-later. The owner authorized
this grant for the v0.6.0-beta.1 release. See `LICENSE` for the full terms.

This grant includes the earlier converter grant, which covered the headless
converter distributed with Realmz Rebuilt: `crates/providence-core`,
`crates/providence-native-adapter`, `crates/providence-application-library`,
`crates/providence-rebuilt-package`, `crates/providence-storage`, and the
filesystem support it needs in `crates/providence-publication`.

## Realmz and Divinity resources

Realmz and Divinity resources retain CC BY-NC-SA 4.0 and original attribution.
This includes bundled stock data, the Rebuilt application support archive,
manual illustrations and page renders, and Realmz art in screenshots. The
Theldrow-derived application icon retains its separate font notice. These
resources are not part of the GPL source grant. See `LICENSE-REALMZ.txt`.

## Third-party source

Third-party source and binary dependencies retain their original licenses.
See `THIRD_PARTY_NOTICES.md`, `vendor/` and the release's music-preview notices
and corresponding source. The ResourceDASM-derived MACE decoder remains subject
to its MIT notice. Each release identifies its exact native source commit and
dependency lock; builds do not claim a different source identity.

## Per-file licensing

`REUSE.toml` records the license and copyright holders of every file in the
public source, and `LICENSES/` holds each license text. Running `reuse lint` in
a public checkout confirms that every file is covered.

## Redistributing Providence

You can share Providence release archives. This is a summary; the licenses
themselves govern.

- **Keep the notices.** Pass on `LICENSE`, `LICENSE-REALMZ.txt`, `NOTICE`,
  `SOURCE-LICENSE.md`, `THIRD_PARTY_NOTICES.md`, the `third-party/` folder, and
  the license and corresponding source in `music-preview/`.
- **Non-commercial only.** Every bundle contains Realmz resources under
  CC BY-NC-SA 4.0, so a bundle may only be shared non-commercially, with
  attribution, and adapted Realmz resources must stay under the same license.
- **Offer the source.** The native programs are GPL-3.0-or-later, so whoever
  passes them on must also make their corresponding source available. Each
  bundle's `bundle-manifest.json` records the exact source commit it was built
  from, so you can point to that commit in this repository.
- **Modified builds** stay GPL-3.0-or-later, must say they are modified, and
  must report their own source identity rather than an official release's.
