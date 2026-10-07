"""Verify native Windows tools do not require an installed Visual C++ runtime."""
import struct


def imports(path):
    data = path.read_bytes()
    header = struct.unpack_from("<I", data, 60)[0]
    if data[header:header + 4] != b"PE\0\0": raise ValueError("Invalid PE header")
    coff = header + 4
    count = struct.unpack_from("<H", data, coff + 2)[0]
    optional_size = struct.unpack_from("<H", data, coff + 16)[0]
    optional = coff + 20
    if struct.unpack_from("<H", data, optional)[0] != 0x20b:
        raise ValueError("Release tools must use the x64 PE format")
    sections = [struct.unpack_from("<IIII", data, optional + optional_size + i * 40 + 8)
                for i in range(count)]

    def offset(address):
        return next(raw + address - base for size, base, raw_size, raw in sections
                    if base <= address < base + max(size, raw_size))

    cursor = offset(struct.unpack_from("<I", data, optional + 120)[0])
    names = []
    while any(data[cursor:cursor + 20]):
        name = offset(struct.unpack_from("<I", data, cursor + 12)[0])
        names.append(data[name:data.index(0, name)].decode("ascii"))
        cursor += 20
    return names


def verify_static_crt(runtime, binaries):
    for name in binaries:
        dependencies = imports(runtime / (name + ".exe"))
        if any(value.lower().startswith(("vcruntime", "msvcp", "ucrtbase", "api-ms-win-crt"))
               for value in dependencies):
            raise ValueError(f"{name} depends on a separately installed C runtime")
    print("WINDOWS_STATIC_CRT_OK", flush=True)
