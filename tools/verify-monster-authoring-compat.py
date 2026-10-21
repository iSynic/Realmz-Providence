"""Check Monster-owned Classic bytes and Rebuilt output in a disposable import."""

import argparse
import hashlib
import json
import pathlib
import subprocess
import zipfile


class Adapter:
    def __init__(self, executable, project, application):
        self.process = subprocess.Popen([str(executable), "serve-project", str(project),
                                         "--application-library-root", str(application)],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, text=True, encoding="utf-8")
        self.sequence = 0

    def request(self, method, params=None):
        self.sequence += 1
        self.process.stdin.write(json.dumps({"id": self.sequence, "method": method, "params": params or {}}) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError(self.process.stderr.read())
        response = json.loads(line)
        if not response.get("ok"):
            raise RuntimeError(f"{method}: {response.get('error')}")
        return response["result"]

    def close(self):
        self.process.stdin.close()
        self.process.wait(timeout=15)


def first_active(adapter):
    offset = 0
    while True:
        page = adapter.request("monster.catalog", {"setId": 0, "offset": offset, "limit": 128})["catalog"]
        for row in page["items"]:
            if row["nativeId"] > 0 and 0 < row["hitDice"] < 255 and 0 in row["availableSets"]:
                return row["nativeId"]
        offset += len(page["items"])
        if offset >= page["total"]:
            raise ValueError("No active Normal Monster")


def certify_edit(adapter, receipt):
    revision = adapter.request("session.describe")["revision"]
    receipt["classicBefore"] = adapter.request("project.inspect-classic-no-edit")
    assert receipt["classicBefore"]["exact"]
    native_id = first_active(adapter)
    document = adapter.request("monster.open", {"setId": 0, "nativeId": native_id})
    receipt["nativeId"] = native_id
    receipt["editedRevision"] = adapter.request("monster.draft.apply", {"expectedRevision": revision,
        "operationId": hashlib.sha256(receipt["outputRoot"].encode()).hexdigest(), "draft": {"setId": 0, "nativeId": native_id,
        "fields": {"armor": min(120, document["monster"]["armor"] + 1), "weapon": -3, "requiredWeapon": -128},
        "description": "Compatibility authoring check.", "normalNotOnMenu": not document["normalNotOnMenu"]}})["change"]["revision"]
    receipt["classicOwnedEdit"] = adapter.request("project.inspect-classic-owned-edit", {"limit": 128})
    assert receipt["classicOwnedEdit"]["withinDeclaredOwnership"]
    assert not receipt["classicOwnedEdit"]["changedFilesTruncated"]


def rebuilt_output(adapter, output, receipt):
    package = output / "monster-edited.realmz2"
    receipt["rebuilt"] = adapter.request("project.compile-rebuilt-package", {"expectedRevision": receipt["editedRevision"], "minimumEngineVersion": "0.1.0", "path": str(package)})
    with zipfile.ZipFile(package) as archive:
        receipt["packageFiles"] = archive.namelist()
        receipt["scenarioDocumentSha256"] = hashlib.sha256(archive.read("scenario.json")).hexdigest()


def restore_edit(adapter, receipt):
    if "editedRevision" not in receipt or "restoredRevision" in receipt:
        return
    undo = adapter.request("history.undo", {"expectedRevision": receipt["editedRevision"]})
    receipt["restoredRevision"] = undo["revision"]
    receipt["classicRestored"] = adapter.request("project.inspect-classic-no-edit")
    if not receipt["classicRestored"]["exact"] or receipt["classicBefore"]["manifestSha256"] != receipt["classicRestored"]["manifestSha256"]:
        raise AssertionError("One Undo did not restore the exact complete retained native manifest")


def verify(arguments):
    fixture = arguments.fixture.resolve()
    project = fixture / "project"
    if not (project / "assets-corpus-disposable.marker").is_file():
        raise ValueError("Only a marked disposable Classic import may be edited")
    output = arguments.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    adapter = Adapter(arguments.adapter, project, arguments.application)
    receipt = {"fixture": str(fixture), "outputRoot": str(output), "retention": "Retain exact Classic certifier reports, one Rebuilt package and this receipt for the native gate; no donor writes.", "status": "running"}
    try:
        receipt["buildIdentity"] = adapter.request("build.identity")
        certify_edit(adapter, receipt)
        rebuilt_output(adapter, output, receipt)
        restore_edit(adapter, receipt)
        receipt["status"] = "passed"
        receipt["runtimeEvidence"] = "Package compilation only; no live Rebuilt execution claim."
    except Exception as error:
        receipt["status"] = "failed"
        receipt["error"] = str(error)
        raise
    finally:
        if "editedRevision" in receipt and "restoredRevision" not in receipt:
            try:
                restore_edit(adapter, receipt)
            except Exception as error:
                receipt["restoreError"] = str(error)
        (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        adapter.close()
    print("PROVIDENCE_MONSTER_COMPAT_OK", json.dumps({"fixture": fixture.name, "nativeId": receipt["nativeId"], "status": receipt["status"]}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    parser.add_argument("--adapter", type=pathlib.Path, required=True)
    parser.add_argument("--application", type=pathlib.Path, required=True)
    verify(parser.parse_args())
