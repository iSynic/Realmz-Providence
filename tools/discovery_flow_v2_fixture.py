"""Controlled authoring examples for Flow V2; never edits a campaign fixture."""
import hashlib
import json
import struct
import zlib
from verify_discovery_adapter import step


def populate_v2(client, project):
    step(client, "extra-action-point:40", 3, 39, 90)
    simple = client.request("encounter.open-simple", {"identity": "simple-encounter:0"})["encounter"]
    simple.update(texts=["Speak to gatekeeper", "Leave gate", "", ""], promptMessageNativeId=349,
                  choiceResults=[1, 2, 0, 0], actions=[
                      {"slot": 0, "rawOpcode": 39, "targetNativeId": 40},
                      {"slot": 8, "rawOpcode": 1, "targetNativeId": 349}])
    client.request("encounter.update-simple", {"encounter": simple})
    ranged = client.request("encounter.create-simple")["document"]["encounter"]
    client.request("message.create", {"nativeId": 350, "text": "An isolated result range fixture."})
    client.request("extra-code.upsert", {"row": {"nativeId": 2, "values": [2, 0, 1, 0, 0]}})
    ranged.update(texts=["Continue", "", "", ""], choiceResults=[1, 0, 0, 0], actions=[
        {"slot": 0, "rawOpcode": 1, "targetNativeId": 350},
        {"slot": 2, "rawOpcode": 47, "targetNativeId": 19},
        {"slot": 3, "rawOpcode": 63, "targetNativeId": 2},
        {"slot": 4, "rawOpcode": -128, "targetNativeId": 77},
        {"slot": 7, "rawOpcode": 39, "targetNativeId": 991}])
    client.request("encounter.update-simple", {"encounter": ranged})
    _rogue_callers(client)
    _pictures(client, project)


def _rogue_callers(client):
    rogue = client.request("encounter.create-rogue")["document"]["encounter"]
    rogue["typeFlags"][0] = True
    rogue["successCodes"][0] = 1
    client.request("rogue-encounter.update", {"encounter": rogue})
    for number in range(1, 6):
        owner = client.request("encounter.create-complex")["document"]["encounter"]
        if number < 4: continue
        owner.update(thief=True, thiefSuccess=1, promptMessageNativeId=350)
        client.request("encounter.update-complex", {"encounter": owner})


def _pictures(client, project):
    for number, name, width, height in [(203, "Gatefront", 640, 400), (204, "Courtyard", 320, 200)]:
        path = project.parent / f"fixture-{number}.png"
        def chunk(kind, data):
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        pixels = (b"\x00" + bytes([30, 50, 70]) * width) * height
        path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b""))
        client.request("asset.import", {"path": str(path), "asset": {
            "identity": f"flow-fixture:{number}", "label": name, "kind": "picture", "mimeType": "image/png",
            "classicResource": {"resourceType": "PICT", "resourceId": number},
            "width": width, "height": height, "source": "Controlled Flow V2 ambiguity fixture"}})
    client.request("extra-action-point.create", {"nativeId": 405})
    step(client, "extra-action-point:405", 1, 27, 203)


def inject_ambiguous_resource(project):
    # Ordinary authoring rejects duplicate exact keys. Construct only this
    # disposable damaged-input fixture at the portable snapshot boundary.
    path = project / "project.providence.json"
    manifest = json.loads(path.read_text())
    blobs = project / "blobs" / "sha256"
    assets = json.loads((blobs / manifest["segments"]["assets"].split(":")[1]).read_text())
    next(row for row in assets if row["identity"] == "flow-fixture:204")["classicResource"]["resourceId"] = 203
    encoded = json.dumps(assets, sort_keys=True, separators=(",", ":")).encode()
    digest = hashlib.sha256(encoded).hexdigest()
    (blobs / digest).write_bytes(encoded)
    manifest["segments"]["assets"] = "sha256:" + digest
    path.write_text(json.dumps(manifest, sort_keys=True, separators=(",", ":")))
