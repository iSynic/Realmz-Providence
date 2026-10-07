# Third-party notices

## Godot and Rust dependencies

Native bundles include Godot's full engine and third-party copyright/license
inventory in `third-party/godot-notices.json`. The locked Rust dependency
licenses and source locations are retained under `third-party/rust` and
`third-party/rust-dependencies.json`. Their original licenses remain in force.

## Divinity Manual and Red Dragon artwork

The bundled Divinity Manual chapter artwork preserves the manual HTML, CSS and
illustrations from Providence commit `e65836c01b9d0a50ddeec20b62aa9ea8c1321836`,
`public/divinity-manual`. The reader shortcut uses the original Realmz Red Dragon
facing, Family Jewels `cicn` 738, decoded without visual changes. These Realmz and
Divinity support resources retain their original licensing and are separate from
the GPL native source. Exact source and asset hashes are recorded in
the bundled chapter layout index and manual catalog.

## Application icon letterform

The application icon uses the capital P from Theldrow Rebuilt, adapted with gold
shading. Font source: Realmz Rebuilt commit
`384fd0bcac2098bb054caf15309605a69b4aa064`,
`src/ui/shared/assets/fonts/Theldrow-Rebuilt.ttf`, SHA-256
`79c7b7d54ad746db41b103ffc9f1bc3fabacb2cf2b594af080c0ac2c2fc7705d`.
The associated Realmz font notice is retained in
`artwork/application-icon/Theldrow-REALMZ-NONCOMMERCIAL.txt`; Realmz artwork
remains separately licensed from the native source.

## StuffIt archive library

`vendor/stuffit` pins stuffit-rs 0.3.1 at upstream commit
`84e1a9d4c4dd209063cebcdbeab84f7c9b3dcd86`, with the two Packsmith-qualified
serialization fixes. See its `PROVENANCE.md`, `LICENSE-MIT` and `LICENSE-APACHE`.
Its license remains MIT OR Apache-2.0. Vendored third-party source is not
relicensed by the converter grant.

## Classic HFS name equivalence

`classic_stuffit/names.rs` adapts the machfs-derived HFS equivalence weights in
Packsmith commit `73e79e57582022cea7fefa50c54fc20ca0300321`,
`app/classic_format.h`. See `vendor/machfs/LICENSE-MIT` for the retained notice.

## ResourceDASM MACE decoder tables and predictor structure

`crates/providence-core/src/codecs/classic_mace.rs` adapts the MACE 3:1 predictor structure and lookup tables from ResourceDASM commit `7ab8452bacde929025ff36f750c6d78ff666618f`, file `src/Audio/Codecs.cc`.

The MIT License (MIT)

Copyright (c) 2023 Martin Michelsen

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
