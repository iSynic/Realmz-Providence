# Building Providence

Providence uses Rust 1.98.0, Godot 4.7.1 and Python 3.14. Install Rust with
rustup, including rustfmt and Clippy, and install Godot's matching export
templates. The editor uses the Compatibility renderer and requires OpenGL 3.3.

## Development

```sh
cargo build --workspace --locked
cargo test --workspace --all-targets --locked
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
godot --editor --path godot
```

The Godot shell finds the adapter and CLI through `CARGO_TARGET_DIR`, or the
workspace's debug/release target directories. Set `PROVIDENCE_GODOT_PATH` when
using the release scripts. `PROVIDENCE_ADAPTER_PATH` and `PROVIDENCE_CLI_PATH`
can select explicit development binaries. Verify their names against
`godot/src/native_bridge.gd` before changing integration settings.

Stock reference data is bundled separately under its original license. The
Monster Library creates a writable personal store from the licensed Scrapbook;
scenario projects contain their own authored content. Avoid writing to the
bundled reference directories.

## Native release bundle

Use an external build/output directory. The packaging command requires a clean,
committed checkout and verifies the source identity embedded in the native
tools. It does not relabel binaries built from another revision.

```sh
python tools/release/bootstrap.py --cache /path/to/external/cache
python tools/release/package.py --godot /path/to/godot \
  --target /path/to/external/target --cache /path/to/external/cache \
  --output /path/to/external/release
```

The bootstrap verifies pinned official Godot downloads. Packaging builds the
Rust tools, exports the Godot application, derives the stock media library,
verifies Rebuilt application support, adds music preview and licensing notices,
checks embedded identities and performs a headless startup smoke check. Each
archive carries a SHA-256 receipt and an internal bundle manifest.

macOS additionally requires both `aarch64-apple-darwin` and
`x86_64-apple-darwin` Rust targets and the Xcode command-line tools. Packaging
combines the sidecars with lipo and signs the finished universal app ad hoc.
Unix music preview builds a minimal static libopenmpt decoder using a C++
compiler, make and pkg-config. It renders bounded PCM for Godot playback;
stored MOD data remains unchanged. The matching decoder source is included.

GitHub Actions runs formatting, Clippy and workspace tests on Windows, Linux
and macOS before creating bundles. A version tag publishes only after every
platform succeeds. macOS builds are not notarized; signed/notarized distribution
requires the maintainer's Apple developer credentials.

## Compatibility evidence

Fixtures protect native record geometry, resource ownership, revisions,
Undo/Redo, import preservation and package guards. Export success establishes
conversion and archive validation, not completion of a campaign. Legacy
scenario anomalies may remain warnings or guarded runtime failures.
