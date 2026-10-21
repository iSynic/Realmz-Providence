# Package versions

Current development writers produce schema-v6 Rebuilt packages for both newly
authored and imported scenarios, and for newly built application libraries.
Every map carries its complete signed native tile words alongside compiled
topology. This includes authored maps; their native encoders already existed.

The published beta.4 predates this unification and retains its documented split.
Its existing downloads and archives are not relabelled by a development change.
An older scenario package is upgraded by a new canonical export, not by changing
its manifest version. Explicit maintenance of an archived package retains its
original contract unless a source-backed migration is performed.

Schemas v3–v5 and their hashes remain immutable. Readers retain support for old
archives. V6 representation does not enable imported-only compatibility exceptions
in fresh projects: missing references and undefined random weapon tables remain
authoring errors, while source-supported signed Monster magic values are valid.

Current publication uses version-neutral export entry points. The historical
`compile_rebuilt_v3_document_set` entry points retain their former authored-v3
behavior and constraints for compatibility callers; they are not the current
product publishing path.

The portable editor snapshot is a different format, currently version 38. Its
version describes editor truth rather than the runtime package. Local cache and
saved-game versions also have independent owners; their numbers are not a product
completion score.

A rebuilt stock library has a new verified package identity. Export finalization
must use its matching package/catalog context, and playtest needs a compatible
separate Rebuilt installation. Preserve the old pinned library for archived
packages that still reference it; a new hash does not authorize silent substitution.
